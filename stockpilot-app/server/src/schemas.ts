import { z } from 'zod';

const knownItem = z.object({
  id: z.string().max(64),
  name: z.string().max(200),
  unit: z.string().max(32),
  variant: z.string().max(100).nullable(),
});

const image = z.object({
  /** Base64 JPEG/PNG without the data: prefix. ~5MB cap after encoding. */
  data: z.string().max(7_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

const base = z.object({
  locale: z.enum(['ja', 'en', 'th', 'zh', 'ko', 'vi', 'id', 'es']),
  industry: z.enum(['food', 'salon', 'retail', 'fashion', 'pharmacy', 'other']),
  knownItems: z.array(knownItem).max(2000),
});

export const ShelfRequest = base.extend({ image });
export const InvoiceRequest = base.extend({ image });
export const VoiceRequest = base.extend({ transcript: z.string().min(1).max(2000) });

// ----- model outputs (structured outputs) -----

export const ShelfResult = z.object({
  items: z.array(
    z.object({
      matchedItemId: z.string().nullable().describe('id from the known item list, or null if not in the list'),
      name: z.string().describe('product name as it should appear in the inventory'),
      count: z.number().describe('number of units visible, in the item unit'),
      confidence: z.enum(['high', 'medium', 'low']),
      note: z.string().nullable().describe('short reason when confidence is not high, e.g. partly hidden'),
    }),
  ),
});

export const InvoiceResult = z.object({
  supplier: z.string().nullable(),
  date: z.string().nullable().describe('YYYY-MM-DD'),
  currency: z.string().nullable().describe('ISO 4217 code'),
  lines: z.array(
    z.object({
      matchedItemId: z.string().nullable(),
      name: z.string(),
      quantity: z.number().describe('quantity received, converted to the matched item unit when possible'),
      unit: z.string().nullable(),
      unitCost: z.number().nullable().describe('cost per unit, tax excluded if both are shown'),
      expiresOn: z.string().nullable().describe('YYYY-MM-DD if printed on the document'),
    }),
  ),
});

export const VoiceResult = z.object({
  operations: z.array(
    z.object({
      matchedItemId: z.string().nullable(),
      name: z.string(),
      kind: z.enum(['in', 'out', 'count']).describe('in = received, out = used/sold, count = stocktake result'),
      quantity: z.number().describe('positive amount in the item unit'),
    }),
  ),
  clarification: z.string().nullable().describe('question to ask back when the request was ambiguous'),
});

export type ShelfResultT = z.infer<typeof ShelfResult>;
export type InvoiceResultT = z.infer<typeof InvoiceResult>;
export type VoiceResultT = z.infer<typeof VoiceResult>;

const snapshotItem = z.object({
  id: z.string().max(64),
  name: z.string().max(200),
  variant: z.string().max(100).nullable(),
  unit: z.string().max(32),
  quantity: z.number(),
  dailyUsage: z.number(),
  daysLeft: z.number().nullable(),
  suggestedOrder: z.number(),
  expiringSoon: z.string().nullable(),
  wasteRisk: z.number(),
  unitCost: z.number().nullable(),
  supplier: z.string().max(200).nullable(),
});

export const AssistantRequest = z.object({
  locale: base.shape.locale,
  industry: base.shape.industry,
  shopName: z.string().max(200),
  today: z.string().max(10),
  snapshot: z.array(snapshotItem).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(20),
  question: z.string().min(1).max(2000),
});

export const AssistantResult = z.object({
  answer: z.string().describe('the reply shown to the owner: short, concrete, plain text, no markdown tables'),
  actions: z
    .array(
      z.object({
        matchedItemId: z.string().nullable(),
        name: z.string(),
        kind: z.enum(['in', 'out', 'count']),
        quantity: z.number(),
      }),
    )
    .describe('stock changes the owner asked you to make; empty unless they asked to change stock'),
  followUps: z.array(z.string()).describe('up to 3 short follow-up questions the owner might tap next'),
});

export type AssistantResultT = z.infer<typeof AssistantResult>;

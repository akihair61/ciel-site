import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

import {
  AssistantResult,
  InvoiceResult,
  ShelfResult,
  VoiceResult,
  type AssistantRequest,
  type InvoiceRequest,
  type ShelfRequest,
  type VoiceRequest,
} from './schemas';

export const DEFAULT_MODEL = 'claude-opus-5-5';

const LANGUAGE = {
  ja: 'Japanese',
  en: 'English',
  th: 'Thai',
  zh: 'Simplified Chinese',
  ko: 'Korean',
  vi: 'Vietnamese',
  id: 'Indonesian',
  es: 'Spanish',
} as const;

const SYSTEM = `You are the inventory assistant inside StockPilot, a stock-management app used by restaurants, hair salons, small shops, fashion boutiques and pharmacies.

You turn photos and short spoken requests into structured stock data. Accuracy matters more than completeness: the shop owner reviews your output before it changes their stock, so mark uncertain counts as low confidence instead of guessing silently.

Matching: you are given the shop's existing items as JSON. When something you see or hear is the same product as a known item (allowing for abbreviations, brand vs. generic names, other languages, and size or colour variants), return that item's id as matchedItemId. Only use ids from the list. If nothing matches, return null and give a clean product name the owner would recognise.

Quantities are always in the matched item's unit. Write names, notes and questions in the language requested.`;

export class AiRefusedError extends Error {}

type Common = { locale: keyof typeof LANGUAGE; industry: string; knownItems: { id: string }[] };

function context(req: Common): Anthropic.Beta.BetaTextBlockParam {
  return {
    type: 'text',
    text: `Industry: ${req.industry}\nRespond in: ${LANGUAGE[req.locale]}\nKnown items:\n${JSON.stringify(req.knownItems)}`,
    // The item list is stable for a shop, so cache everything up to here.
    cache_control: { type: 'ephemeral' },
  };
}

async function run<T extends z.ZodType>(
  client: Anthropic,
  model: string,
  schema: T,
  effort: 'low' | 'medium' | 'high',
  content: Anthropic.Beta.BetaContentBlockParam[],
  history: Anthropic.Beta.BetaMessageParam[] = [],
): Promise<z.infer<T>> {
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort, format: zodOutputFormat(schema) },
    messages: [...history, { role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new AiRefusedError(response.stop_details?.category ?? 'refusal');
  if (!response.parsed_output) throw new Error(`no structured output (stop_reason=${response.stop_reason})`);
  return response.parsed_output as z.infer<T>;
}

/** Drop ids the model invented so the app never writes to a missing item. */
function keepKnownIds<T extends { matchedItemId: string | null }>(rows: T[], known: { id: string }[]): T[] {
  const ids = new Set(known.map((k) => k.id));
  return rows.map((r) => (r.matchedItemId && !ids.has(r.matchedItemId) ? { ...r, matchedItemId: null } : r));
}

export async function countShelf(client: Anthropic, model: string, req: z.infer<typeof ShelfRequest>) {
  const out = await run(client, model, ShelfResult, 'medium', [
    context(req),
    { type: 'image', source: { type: 'base64', media_type: req.image.mediaType, data: req.image.data } },
    {
      type: 'text',
      text: 'Count every distinct product visible on this shelf / storage photo. One row per product (and per variant). Count units you can actually see; if items are stacked or boxed, estimate and lower the confidence.',
    },
  ]);
  return { items: keepKnownIds(out.items, req.knownItems) };
}

export async function readInvoice(client: Anthropic, model: string, req: z.infer<typeof InvoiceRequest>) {
  const out = await run(client, model, InvoiceResult, 'medium', [
    context(req),
    { type: 'image', source: { type: 'base64', media_type: req.image.mediaType, data: req.image.data } },
    {
      type: 'text',
      text: 'This is a delivery note, invoice or receipt for stock the shop received. Extract every product line. Skip delivery fees, discounts, tax and totals.',
    },
  ]);
  return { ...out, lines: keepKnownIds(out.lines, req.knownItems) };
}

export async function parseVoice(client: Anthropic, model: string, req: z.infer<typeof VoiceRequest>) {
  const out = await run(client, model, VoiceResult, 'low', [
    context(req),
    {
      type: 'text',
      text: `Speech-to-text of the owner talking (may contain recognition errors):\n"""${req.transcript}"""\nTurn it into stock operations. If an amount or item is unclear, return no operation for it and ask in clarification.`,
    },
  ]);
  return { ...out, operations: keepKnownIds(out.operations, req.knownItems) };
}

const ASSISTANT_GUIDE = `You are now acting as the shop's inventory advisor. The snapshot lists every item with on-device forecasts: dailyUsage (units/day), daysLeft, suggestedOrder (units to order now), expiringSoon (earliest expiry date within the warning window) and wasteRisk (units likely to expire unused).

Answer the owner's question from this data. Lead with what to do, name items and numbers, and keep it short enough to read on a phone. When money matters, use unitCost to estimate amounts. If the data can't answer the question, say what's missing.

Only return actions when the owner asks you to change stock (e.g. "I used 3 of X", "received the order"). Never invent items or ids.`;

export async function assistant(client: Anthropic, model: string, req: z.infer<typeof AssistantRequest>) {
  const snapshot: Anthropic.Beta.BetaTextBlockParam = {
    type: 'text',
    text: `${ASSISTANT_GUIDE}\n\nShop: ${req.shopName || '-'}\nIndustry: ${req.industry}\nToday: ${req.today}\nRespond in: ${LANGUAGE[req.locale]}\nSnapshot:\n${JSON.stringify(req.snapshot)}`,
    cache_control: { type: 'ephemeral' },
  };
  // Earlier turns go first as plain text; the fresh snapshot rides with the new question.
  const history: Anthropic.Beta.BetaMessageParam[] = req.history.map((h) => ({ role: h.role, content: h.text }));
  const out = await run(
    client,
    model,
    AssistantResult,
    'medium',
    [snapshot, { type: 'text', text: req.question }],
    history,
  );
  return {
    ...out,
    actions: keepKnownIds(out.actions, req.snapshot),
    followUps: out.followUps.slice(0, 3),
  };
}

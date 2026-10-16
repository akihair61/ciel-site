import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import type { Locale, MessageKey } from '@/lib/i18n';
import type { IndustryId, KnownItem } from '@/lib/types';

const AI_URL = process.env.EXPO_PUBLIC_AI_URL ?? 'http://localhost:8787';
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY ?? 'dev';

export type Confidence = 'high' | 'medium' | 'low';

export interface ShelfResult {
  items: { matchedItemId: string | null; name: string; count: number; confidence: Confidence; note: string | null }[];
}

export interface InvoiceResult {
  supplier: string | null;
  date: string | null;
  currency: string | null;
  lines: {
    matchedItemId: string | null;
    name: string;
    quantity: number;
    unit: string | null;
    unitCost: number | null;
    expiresOn: string | null;
  }[];
}

export interface VoiceResult {
  operations: { matchedItemId: string | null; name: string; kind: 'in' | 'out' | 'count'; quantity: number }[];
  clarification: string | null;
}

export class AiError extends Error {
  constructor(public code: 'quota_exceeded' | 'offline' | 'refused' | 'failed') {
    super(code);
  }
}

interface Ctx {
  deviceId: string;
  locale: Locale;
  industry: IndustryId;
  knownItems: KnownItem[];
}

async function post<T>(path: string, ctx: Ctx, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AI_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-key': APP_KEY, 'x-device-id': ctx.deviceId },
      body: JSON.stringify({
        locale: ctx.locale,
        industry: ctx.industry,
        ...(path === '/v1/assistant' ? {} : { knownItems: ctx.knownItems }),
        ...body,
      }),
    });
  } catch {
    throw new AiError('offline');
  }
  if (res.status === 402) throw new AiError('quota_exceeded');
  if (res.status === 422) throw new AiError('refused');
  if (!res.ok) throw new AiError('failed');
  return (await res.json()) as T;
}

/** Downscale to Claude's sweet spot (~1568px long edge) and JPEG-encode. */
export async function prepareImage(uri: string, width: number, height: number) {
  const scale = Math.min(1, 1568 / Math.max(width, height));
  const ctx = ImageManipulator.manipulate(uri);
  if (scale < 1) ctx.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  return { data: out.base64 ?? '', mediaType: 'image/jpeg' as const };
}

export const countShelf = (ctx: Ctx, image: { data: string; mediaType: 'image/jpeg' }) =>
  post<ShelfResult>('/v1/shelf-count', ctx, { image });

export const readInvoice = (ctx: Ctx, image: { data: string; mediaType: 'image/jpeg' }) =>
  post<InvoiceResult>('/v1/invoice', ctx, { image });

export const parseVoice = (ctx: Ctx, transcript: string) => post<VoiceResult>('/v1/voice', ctx, { transcript });

export function aiErrorMessage(t: (k: MessageKey) => string, err: unknown): string {
  if (err instanceof AiError) {
    if (err.code === 'quota_exceeded') return t('plan.quota');
    if (err.code === 'offline') return t('common.offline');
  }
  return t('common.error');
}

export interface SnapshotItem {
  id: string;
  name: string;
  variant: string | null;
  unit: string;
  quantity: number;
  dailyUsage: number;
  daysLeft: number | null;
  suggestedOrder: number;
  expiringSoon: string | null;
  wasteRisk: number;
  unitCost: number | null;
  supplier: string | null;
}

export interface AssistantResult {
  answer: string;
  actions: { matchedItemId: string | null; name: string; kind: 'in' | 'out' | 'count'; quantity: number }[];
  followUps: string[];
}

export const askAssistant = (
  ctx: Omit<Ctx, 'knownItems'>,
  body: {
    shopName: string;
    today: string;
    snapshot: SnapshotItem[];
    history: { role: 'user' | 'assistant'; text: string }[];
    question: string;
  },
) => post<AssistantResult>('/v1/assistant', { ...ctx, knownItems: [] }, body);

/** Show an AI failure; running out of quota offers the upgrade screen. */
export function alertAiError(t: (k: MessageKey) => string, err: unknown): void {
  if (err instanceof AiError && err.code === 'quota_exceeded') {
    alertQuota(t);
    return;
  }
  Alert.alert(aiErrorMessage(t, err));
}

export function alertQuota(t: (k: MessageKey) => string): void {
  Alert.alert(t('plan.quota'), undefined, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('paywall.upgrade'), onPress: () => router.push('/paywall') },
  ]);
}

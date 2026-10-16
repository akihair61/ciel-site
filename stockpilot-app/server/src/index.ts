import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import type { z } from 'zod';

import { AiRefusedError, DEFAULT_MODEL, assistant, countShelf, parseVoice, readInvoice } from './claude';
import { MemoryStore, consume, type QuotaStore } from './quota';
import { AssistantRequest, InvoiceRequest, ShelfRequest, VoiceRequest } from './schemas';

export interface Env {
  ANTHROPIC_API_KEY: string;
  /** Shared key baked into the app build; filters casual abuse, not a real secret. */
  APP_KEY: string;
  CLAUDE_MODEL?: string;
  REVENUECAT_WEBHOOK_SECRET?: string;
  QUOTA?: QuotaStore;
}

const memory = new MemoryStore();
const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true }));

function handler<S extends z.ZodType, R>(
  schema: S,
  fn: (client: Anthropic, model: string, req: z.infer<S>) => Promise<R>,
) {
  return async (c: import('hono').Context<{ Bindings: Env }>) => {
    if (c.req.header('x-app-key') !== c.env.APP_KEY) return c.json({ error: 'unauthorized' }, 401);
    const deviceId = c.req.header('x-device-id');
    if (!deviceId || deviceId.length > 64) return c.json({ error: 'missing_device' }, 400);

    const parsed = schema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues.slice(0, 5) }, 400);

    const store = c.env.QUOTA ?? memory;
    // Plans are written by the RevenueCat webhook, never trusted from the client.
    const plan = (await store.get(`plan:${deviceId}`)) ?? 'free';
    if (!(await consume(store, deviceId, plan))) return c.json({ error: 'quota_exceeded', plan }, 402);

    try {
      const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });
      return c.json(await fn(client, c.env.CLAUDE_MODEL || DEFAULT_MODEL, parsed.data));
    } catch (err) {
      if (err instanceof AiRefusedError) return c.json({ error: 'refused' }, 422);
      if (err instanceof Anthropic.RateLimitError) return c.json({ error: 'busy' }, 503);
      if (err instanceof Anthropic.APIError) {
        console.error('anthropic error', err.status, err.message);
        return c.json({ error: 'ai_unavailable' }, 502);
      }
      console.error(err);
      return c.json({ error: 'internal' }, 500);
    }
  };
}

app.post('/v1/shelf-count', handler(ShelfRequest, countShelf));
app.post('/v1/invoice', handler(InvoiceRequest, readInvoice));
app.post('/v1/voice', handler(VoiceRequest, parseVoice));
app.post('/v1/assistant', handler(AssistantRequest, assistant));

/**
 * RevenueCat webhook: keeps the device's plan in sync with its subscription.
 * The app sets RevenueCat's appUserID to the same device id it sends here.
 */
app.post('/v1/webhooks/revenuecat', async (c) => {
  const secret = c.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret || c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'unauthorized' }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    event?: { app_user_id?: string; type?: string; entitlement_ids?: string[] | null };
  } | null;
  const event = body?.event;
  if (!event?.app_user_id) return c.json({ ok: true });

  const store = c.env.QUOTA ?? memory;
  const ended = event.type === 'EXPIRATION';
  const entitlements = event.entitlement_ids ?? [];
  const plan = ended ? 'free' : entitlements.includes('business') ? 'business' : entitlements.includes('pro') ? 'pro' : null;
  if (plan) await store.put(`plan:${event.app_user_id}`, plan);
  return c.json({ ok: true });
});

export default app;

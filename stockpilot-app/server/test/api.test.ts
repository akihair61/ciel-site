import { afterEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { MemoryStore } from '../src/quota';

const knownItems = [{ id: 'item-1', name: 'Shampoo 1L', unit: 'bottle', variant: null }];

function env() {
  return { ANTHROPIC_API_KEY: 'test', APP_KEY: 'k', QUOTA: new MemoryStore() };
}

function post(path: string, body: unknown, e = env(), headers: Record<string, string> = {}) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-key': 'k', 'x-device-id': 'dev-1', ...headers },
      body: JSON.stringify(body),
    },
    e,
  );
}

function fakeClaude(json: unknown) {
  const calls: any[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [{ type: 'text', text: JSON.stringify(json) }],
          stop_reason: 'end_turn',
          stop_details: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('AI API', () => {
  it('rejects a wrong app key', async () => {
    const res = await post('/v1/voice', {}, env(), { 'x-app-key': 'nope' });
    expect(res.status).toBe(401);
  });

  it('validates the body', async () => {
    const res = await post('/v1/voice', { transcript: '' });
    expect(res.status).toBe(400);
  });

  it('parses voice into operations and drops invented ids', async () => {
    const calls = fakeClaude({
      operations: [
        { matchedItemId: 'item-1', name: 'Shampoo 1L', kind: 'out', quantity: 3 },
        { matchedItemId: 'made-up', name: 'Towel', kind: 'in', quantity: 10 },
      ],
      clarification: null,
    });
    const res = await post('/v1/voice', {
      locale: 'ja',
      industry: 'salon',
      knownItems,
      transcript: 'シャンプー3本使った、タオル10枚入荷',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.operations[0].matchedItemId).toBe('item-1');
    expect(body.operations[1].matchedItemId).toBeNull();

    const sent = calls[0];
    expect(sent.model).toBe('claude-opus-5-5');
    expect(sent.fallbacks).toBe('default');
    expect(sent.output_config.effort).toBe('low');
    expect(sent.output_config.format.type).toBe('json_schema');
    expect(sent.thinking).toBeUndefined();
  });

  it('answers assistant questions with history and validated actions', async () => {
    const calls = fakeClaude({
      answer: 'Order 6 bottles of shampoo today.',
      actions: [{ matchedItemId: 'ghost', name: 'X', kind: 'in', quantity: 1 }],
      followUps: ['a', 'b', 'c', 'd'],
    });
    const res = await post('/v1/assistant', {
      locale: 'en',
      industry: 'salon',
      shopName: 'CIEL',
      today: '2026-10-16',
      snapshot: [
        {
          id: 'item-1', name: 'Shampoo 1L', variant: null, unit: 'bottle', quantity: 2, dailyUsage: 0.5,
          daysLeft: 4, suggestedOrder: 6, expiringSoon: null, wasteRisk: 0, unitCost: 12, supplier: 'Milbon',
        },
      ],
      history: [
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: 'hello' },
      ],
      question: 'What should I order?',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.actions[0].matchedItemId).toBeNull();
    expect(body.followUps).toHaveLength(3);
    const sent = calls[0];
    expect(sent.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('enforces the free monthly quota', async () => {
    fakeClaude({ operations: [], clarification: null });
    const e = env();
    const body = { locale: 'en', industry: 'food', knownItems, transcript: 'used 2kg rice' };
    for (let i = 0; i < 20; i++) expect((await post('/v1/voice', body, e)).status).toBe(200);
    expect((await post('/v1/voice', body, e)).status).toBe(402);
  });

  it('upgrades a device through the RevenueCat webhook', async () => {
    const e = { ...env(), REVENUECAT_WEBHOOK_SECRET: 's' };
    const res = await app.request(
      '/v1/webhooks/revenuecat',
      {
        method: 'POST',
        headers: { authorization: 'Bearer s', 'content-type': 'application/json' },
        body: JSON.stringify({ event: { app_user_id: 'dev-1', type: 'INITIAL_PURCHASE', entitlement_ids: ['pro'] } }),
      },
      e,
    );
    expect(res.status).toBe(200);
    expect(await e.QUOTA.get('plan:dev-1')).toBe('pro');
  });
});

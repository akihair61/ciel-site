import { describe, expect, it } from 'vitest';

import { dailySeries, forecast, smoothedRate } from '../src/lib/forecast';
import { consumeFefo } from '../src/lib/lots';
import { PLANS, canAddItem, canUseAi } from '../src/lib/plans';

const now = new Date('2026-10-16T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

function steady(perDay: number, days: number) {
  return Array.from({ length: days }, (_, i) => ({ at: daysAgo(i), quantity: perDay }));
}

const base = { reorderPoint: 0, leadTimeDays: 3, reviewDays: 7, expiryWarnDays: 7, lots: [], now };

describe('forecast', () => {
  it('buckets usage per day, oldest first', () => {
    const s = dailySeries([{ at: daysAgo(2), quantity: 4 }, { at: daysAgo(0), quantity: 1 }], now);
    expect(s).toEqual([4, 0, 1]);
  });

  it('smooths a steady series to its rate', () => {
    expect(smoothedRate([2, 2, 2, 2])).toBeCloseTo(2);
  });

  it('is ok with plenty of stock', () => {
    const f = forecast({ ...base, quantity: 100, outflows: steady(2, 14) });
    expect(f.status).toBe('ok');
    expect(f.daysLeft).toBeCloseTo(50);
    expect(f.suggestedOrder).toBe(0);
    expect(f.confidence).toBe('normal');
  });

  it('flags critical inside the lead time and orders enough to cover lead + review', () => {
    const f = forecast({ ...base, quantity: 4, outflows: steady(2, 14) });
    expect(f.status).toBe('critical');
    // 2/day * (3 + 7) days = 20, minus 4 on hand, no variance -> 16
    expect(f.suggestedOrder).toBe(16);
    expect(f.stockoutDate).toBe('2026-10-18');
  });

  it('learns a reorder point when the owner left it unset', () => {
    const f = forecast({ ...base, quantity: 30, outflows: steady(2, 14) });
    expect(f.autoReorderPoint).toBe(true);
    expect(f.reorderPoint).toBe(6);
  });

  it('respects an explicit reorder point', () => {
    const f = forecast({ ...base, reorderPoint: 40, quantity: 30, outflows: steady(2, 14) });
    expect(f.autoReorderPoint).toBe(false);
    expect(f.status).toBe('critical');
  });

  it('marks out of stock and tops up items with no history', () => {
    const f = forecast({ ...base, reorderPoint: 5, quantity: 0, outflows: [] });
    expect(f.status).toBe('out');
    expect(f.suggestedOrder).toBe(10);
    expect(f.daysLeft).toBeNull();
    expect(f.confidence).toBe('low');
  });

  it('estimates waste from lots that expire before they can be used', () => {
    const f = forecast({
      ...base,
      quantity: 20,
      outflows: steady(1, 14),
      lots: [
        { quantity: 10, expiresOn: '2026-10-20' }, // 4 days at 1/day -> 6 wasted
        { quantity: 10, expiresOn: '2026-12-31' },
      ],
    });
    expect(f.wasteRisk).toBeCloseTo(6);
    expect(f.expiringSoon).toEqual({ expiresOn: '2026-10-20', quantity: 10 });
  });
});

describe('FEFO lots', () => {
  const lot = (id: string, quantity: number, expiresOn: string | null, receivedAt = '2026-10-01') => ({
    id, itemId: 'x', quantity, expiresOn, receivedAt,
  });

  it('uses the earliest expiry first, undated last', () => {
    const { changes, shortfall } = consumeFefo(
      [lot('undated', 5, null), lot('late', 5, '2026-12-01'), lot('early', 5, '2026-10-20')],
      8,
    );
    expect(changes).toEqual([
      { id: 'early', quantity: 0 },
      { id: 'late', quantity: 2 },
    ]);
    expect(shortfall).toBe(0);
  });

  it('reports a shortfall', () => {
    expect(consumeFefo([lot('a', 2, null)], 5).shortfall).toBe(3);
  });
});

describe('plans', () => {
  it('limits the free tier', () => {
    expect(canAddItem(PLANS.free, 99)).toBe(true);
    expect(canAddItem(PLANS.free, 100)).toBe(false);
    expect(canAddItem(PLANS.pro, 10_000)).toBe(true);
    expect(canUseAi(PLANS.free, 20)).toBe(false);
  });
});

import { toCsv } from '../src/lib/csv';

describe('csv', () => {
  it('escapes quotes, commas and newlines and adds a BOM', () => {
    const out = toCsv([['name', 'qty'], ['Shampoo, 1L', 3], ['He said "hi"\nok', null]]);
    expect(out).toBe('﻿name,qty\r\n"Shampoo, 1L",3\r\n"He said ""hi""\nok",\r\n');
  });
});

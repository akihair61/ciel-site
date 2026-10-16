/**
 * Demand forecasting and reorder suggestions. Pure functions so they run
 * instantly on-device and are easy to test.
 */

export type StockStatus = 'out' | 'critical' | 'low' | 'ok';

export interface Outflow {
  /** ISO timestamp of a stock decrease. */
  at: string;
  quantity: number;
}

export interface ForecastLot {
  quantity: number;
  expiresOn: string | null;
}

export interface ForecastInput {
  quantity: number;
  reorderPoint: number;
  leadTimeDays: number;
  reviewDays: number;
  expiryWarnDays: number;
  outflows: Outflow[];
  lots: ForecastLot[];
  now: Date;
}

export interface Forecast {
  status: StockStatus;
  /** Smoothed units used per day. */
  dailyUsage: number;
  /** Days until stock runs out at the current pace; null when there is no usage. */
  daysLeft: number | null;
  stockoutDate: string | null;
  suggestedOrder: number;
  /** Quantity likely to expire before it can be used. */
  wasteRisk: number;
  /** Earliest expiry within the warning window. */
  expiringSoon: { expiresOn: string; quantity: number } | null;
  /** 'low' when there are fewer than 7 days of history. */
  confidence: 'low' | 'normal';
  /** Reorder point actually used: the owner's, or learned from usage when unset. */
  reorderPoint: number;
  autoReorderPoint: boolean;
}

const WINDOW_DAYS = 28;
const ALPHA = 0.25;
const SERVICE_Z = 1.65; // ~95% service level
const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function dailySeries(outflows: Outflow[], now: Date): number[] {
  if (outflows.length === 0) return [];
  const today = startOfDay(now);
  const first = Math.min(...outflows.map((o) => startOfDay(new Date(o.at))));
  const span = Math.min(WINDOW_DAYS, Math.floor((today - first) / DAY_MS) + 1);
  const series = new Array<number>(span).fill(0);
  for (const o of outflows) {
    const index = span - 1 - Math.floor((today - startOfDay(new Date(o.at))) / DAY_MS);
    if (index >= 0 && index < span) series[index] += Math.abs(o.quantity);
  }
  return series;
}

export function smoothedRate(series: number[]): number {
  if (series.length === 0) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  let ewma = mean;
  for (const v of series) ewma = ALPHA * v + (1 - ALPHA) * ewma;
  // Blend so a single busy day doesn't swing the forecast too far.
  return 0.5 * ewma + 0.5 * mean;
}

function stdDev(series: number[]): number {
  if (series.length < 2) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((a, v) => a + (v - mean) ** 2, 0) / (series.length - 1);
  return Math.sqrt(variance);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function roundUp(n: number): number {
  return Math.max(0, Math.ceil(n - 1e-9));
}

export function forecast(input: ForecastInput): Forecast {
  const series = dailySeries(input.outflows, input.now);
  const rate = smoothedRate(series);
  const sigma = stdDev(series);
  const qty = Math.max(0, input.quantity);
  const today = startOfDay(input.now);

  const safety = SERVICE_Z * sigma * Math.sqrt(Math.max(1, input.leadTimeDays));
  // Owners rarely set reorder points; learn one from usage when it's unset.
  const autoReorderPoint = input.reorderPoint <= 0 && rate > 0;
  const reorderPoint = autoReorderPoint
    ? Math.ceil(rate * input.leadTimeDays + safety)
    : Math.max(0, input.reorderPoint);

  const daysLeft = rate > 0 ? qty / rate : null;
  const stockoutDate = daysLeft === null ? null : isoDate(today + Math.floor(daysLeft) * DAY_MS);

  let status: StockStatus = 'ok';
  if (qty <= 0) status = 'out';
  else if (qty <= reorderPoint || (daysLeft !== null && daysLeft <= input.leadTimeDays)) status = 'critical';
  else if (daysLeft !== null && daysLeft <= input.leadTimeDays + input.reviewDays) status = 'low';

  let suggestedOrder = 0;
  if (status !== 'ok') {
    if (rate > 0) {
      const target = rate * (input.leadTimeDays + input.reviewDays) + safety;
      suggestedOrder = roundUp(Math.max(target, reorderPoint + 1) - qty);
    } else {
      // No usage history yet: top up to twice the reorder point.
      suggestedOrder = roundUp(Math.max(reorderPoint * 2, 1) - qty);
    }
  }

  // Walk lots first-expiring-first and estimate what expires unused.
  const dated = input.lots
    .filter((l): l is { quantity: number; expiresOn: string } => !!l.expiresOn && l.quantity > 0)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
  let consumedBefore = 0;
  let wasteRisk = 0;
  let expiringSoon: Forecast['expiringSoon'] = null;
  for (const lot of dated) {
    const expiry = Date.parse(lot.expiresOn + 'T00:00:00Z');
    const daysToExpiry = Math.max(0, (expiry - today) / DAY_MS);
    const usableByExpiry = rate * daysToExpiry;
    const usedFromLot = Math.min(lot.quantity, Math.max(0, usableByExpiry - consumedBefore));
    wasteRisk += lot.quantity - usedFromLot;
    consumedBefore += lot.quantity;
    if (!expiringSoon && daysToExpiry <= input.expiryWarnDays) {
      expiringSoon = { expiresOn: lot.expiresOn, quantity: lot.quantity };
    }
  }

  return {
    status,
    dailyUsage: rate,
    daysLeft,
    stockoutDate,
    suggestedOrder,
    wasteRisk: Math.round(wasteRisk * 100) / 100,
    expiringSoon,
    confidence: series.length >= 7 ? 'normal' : 'low',
    reorderPoint,
    autoReorderPoint,
  };
}

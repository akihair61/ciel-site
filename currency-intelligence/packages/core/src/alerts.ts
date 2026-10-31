/**
 * Rate alerts (F06). Pure evaluation: the app feeds the current quote per pair and the clock; this decides which
 * alerts fire, honouring expiry and a per-alert cooldown, and returns the updated alerts plus log entries.
 *
 * Honesty rules carried by the data: every fire records the rate's source, receivedAt and observedAt (which may be
 * null), and the UI must say that alerts are only checked while the app is open and rates refresh periodically.
 */
import { cmpDec, parseDec } from "./dec.ts";
import type { RateQuote } from "./rates.ts";

export type AlertDirection = "above" | "below";

export interface RateAlert {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Fire when 1 from = rate to goes above / below this decimal string. */
  readonly threshold: string;
  readonly direction: AlertDirection;
  readonly createdAt: string; // ISO
  readonly expiresAt: string | null; // ISO or null = never
  readonly cooldownMs: number; // minimum gap between two fires of the same alert
  readonly active: boolean;
  readonly lastFiredAt: string | null;
  readonly fireCount: number;
  readonly note?: string;
}

export interface AlertFire {
  readonly id: string;
  readonly alertId: string;
  readonly at: string;
  readonly from: string;
  readonly to: string;
  readonly rate: string;
  readonly threshold: string;
  readonly direction: AlertDirection;
  readonly source: string;
  readonly observedAt: string | null;
  readonly receivedAt: string;
}

export interface AlertEvaluation {
  readonly alerts: readonly RateAlert[];
  readonly fires: readonly AlertFire[];
  /** Alerts whose expiry passed during this evaluation (they are returned with active=false). */
  readonly expired: readonly string[];
}

export function alertStatus(a: RateAlert, nowMs: number): "active" | "expired" | "paused" {
  if (a.expiresAt && Date.parse(a.expiresAt) <= nowMs) return "expired";
  if (!a.active) return "paused";
  return "active";
}

/** True when the quote satisfies the alert's condition (inclusive). */
export function conditionMet(a: RateAlert, rate: string): boolean {
  const c = cmpDec(parseDec(rate), parseDec(a.threshold));
  return a.direction === "above" ? c >= 0 : c <= 0;
}

export function evaluateAlerts(
  alerts: readonly RateAlert[],
  quoteFor: (from: string, to: string) => RateQuote | null,
  nowMs: number,
  makeId: () => string = () => Math.random().toString(36).slice(2, 10),
): AlertEvaluation {
  const fires: AlertFire[] = [];
  const expired: string[] = [];
  const now = new Date(nowMs).toISOString();
  const out = alerts.map((a) => {
    if (!a.active) return a;
    if (a.expiresAt && Date.parse(a.expiresAt) <= nowMs) {
      expired.push(a.id);
      return { ...a, active: false };
    }
    const q = quoteFor(a.from, a.to);
    if (!q) return a;
    if (!conditionMet(a, q.rate)) return a;
    if (a.lastFiredAt && nowMs - Date.parse(a.lastFiredAt) < a.cooldownMs) return a;
    fires.push({ id: makeId(), alertId: a.id, at: now, from: a.from, to: a.to, rate: q.rate, threshold: a.threshold, direction: a.direction, source: q.source, observedAt: q.observedAt, receivedAt: q.receivedAt });
    return { ...a, lastFiredAt: now, fireCount: a.fireCount + 1 };
  });
  return { alerts: out, fires, expired };
}

export function validateAlertInput(input: { from: string; to: string; threshold: string; direction: AlertDirection; cooldownMs: number; expiresAt: string | null }): string | null {
  if (input.from === input.to) return "from and to must differ";
  let t;
  try { t = parseDec(input.threshold); } catch { return "threshold is not a decimal"; }
  if (t.m <= 0n) return "threshold must be > 0";
  if (!Number.isFinite(input.cooldownMs) || input.cooldownMs < 0) return "cooldown must be ≥ 0";
  if (input.expiresAt !== null && Number.isNaN(Date.parse(input.expiresAt))) return "expiry is not a date";
  return null;
}

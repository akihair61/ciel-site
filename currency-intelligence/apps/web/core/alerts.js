/**
 * Rate alerts (F06). Pure evaluation: the app feeds the current quote per pair and the clock; this decides which
 * alerts fire, honouring expiry and a per-alert cooldown, and returns the updated alerts plus log entries.
 *
 * Honesty rules carried by the data: every fire records the rate's source, receivedAt and observedAt (which may be
 * null), and the UI must say that alerts are only checked while the app is open and rates refresh periodically.
 */
import { cmpDec, parseDec } from "./dec.js";
export function alertStatus(a, nowMs) {
    if (a.expiresAt && Date.parse(a.expiresAt) <= nowMs)
        return "expired";
    if (!a.active)
        return "paused";
    return "active";
}
/** True when the quote satisfies the alert's condition (inclusive). */
export function conditionMet(a, rate) {
    const c = cmpDec(parseDec(rate), parseDec(a.threshold));
    return a.direction === "above" ? c >= 0 : c <= 0;
}
export function evaluateAlerts(alerts, quoteFor, nowMs, makeId = () => Math.random().toString(36).slice(2, 10)) {
    const fires = [];
    const expired = [];
    const now = new Date(nowMs).toISOString();
    const out = alerts.map((a) => {
        if (!a.active)
            return a;
        if (a.expiresAt && Date.parse(a.expiresAt) <= nowMs) {
            expired.push(a.id);
            return { ...a, active: false };
        }
        const q = quoteFor(a.from, a.to);
        if (!q)
            return a;
        if (!conditionMet(a, q.rate))
            return a;
        if (a.lastFiredAt && nowMs - Date.parse(a.lastFiredAt) < a.cooldownMs)
            return a;
        fires.push({ id: makeId(), alertId: a.id, at: now, from: a.from, to: a.to, rate: q.rate, threshold: a.threshold, direction: a.direction, source: q.source, observedAt: q.observedAt, receivedAt: q.receivedAt });
        return { ...a, lastFiredAt: now, fireCount: a.fireCount + 1 };
    });
    return { alerts: out, fires, expired };
}
export function validateAlertInput(input) {
    if (input.from === input.to)
        return "from and to must differ";
    let t;
    try {
        t = parseDec(input.threshold);
    }
    catch {
        return "threshold is not a decimal";
    }
    if (t.m <= 0n)
        return "threshold must be > 0";
    if (!Number.isFinite(input.cooldownMs) || input.cooldownMs < 0)
        return "cooldown must be ≥ 0";
    if (input.expiresAt !== null && Number.isNaN(Date.parse(input.expiresAt)))
        return "expiry is not a date";
    return null;
}
//# sourceMappingURL=alerts.js.map
import { cmpDec, decToShortString, divDec, mulDec, parseDec } from "./dec.js";
import { currency } from "./currencies.js";
export class RateError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "RateError";
        this.code = code;
    }
}
/** Significant fraction digits kept for derived (inverted / crossed) rates. */
export const DERIVED_RATE_FRACTION_DIGITS = 12;
export function parseIso(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t))
        throw new RateError("RATE_TIME", `invalid timestamp: ${iso}`);
    return t;
}
export function validateQuote(q) {
    currency(q.base);
    currency(q.quote);
    if (q.base === q.quote)
        throw new RateError("RATE_SAME_CURRENCY", `base and quote are both ${q.base}`);
    const r = parseDec(q.rate);
    if (r.m <= 0n)
        throw new RateError("RATE_NON_POSITIVE", `rate must be > 0, got ${q.rate}`);
    if (q.observedAt !== null)
        parseIso(q.observedAt);
    parseIso(q.receivedAt);
    if (q.expiresAt)
        parseIso(q.expiresAt);
    if (q.bid && q.ask && cmpDec(parseDec(q.bid), parseDec(q.ask)) > 0) {
        throw new RateError("RATE_BID_OVER_ASK", "bid is above ask");
    }
    return q;
}
/**
 * fresh   : age ≤ ttl and not past expiresAt
 * stale   : age > ttl, still usable with a warning
 * expired : past expiresAt (provider says do not use) — UI must refuse to call it a rate
 */
export function staleness(q, nowMs, ttlMs) {
    const basis = q.observedAt === null ? "receivedAt" : "observedAt";
    const ageMs = Math.max(0, nowMs - parseIso(q.observedAt ?? q.receivedAt));
    if (q.expiresAt && nowMs > parseIso(q.expiresAt))
        return { status: "expired", ageMs, ttlMs, basis };
    return { status: ageMs <= ttlMs ? "fresh" : "stale", ageMs, ttlMs, basis };
}
/** Time the quote's age should be measured from: observedAt when known, else receivedAt. */
export function quoteTimeMs(q) {
    return parseIso(q.observedAt ?? q.receivedAt);
}
function invertDec(d) {
    return decToShortString(divDec({ m: 1n, e: 0 }, d, DERIVED_RATE_FRACTION_DIGITS, "HALF_EVEN"));
}
/** quote→base from base→quote. Bid/ask swap and invert. */
export function invert(q) {
    validateQuote(q);
    const out = {
        quoteId: `${q.quoteId}:inv`,
        base: q.quote,
        quote: q.base,
        rate: invertDec(parseDec(q.rate)),
        bid: q.ask ? invertDec(parseDec(q.ask)) : undefined,
        ask: q.bid ? invertDec(parseDec(q.bid)) : undefined,
        mid: q.mid ? invertDec(parseDec(q.mid)) : undefined,
        source: q.source,
        observedAt: q.observedAt,
        receivedAt: q.receivedAt,
        expiresAt: q.expiresAt,
        rateKind: q.rateKind === "bid" ? "ask" : q.rateKind === "ask" ? "bid" : q.rateKind,
        confidence: q.confidence,
        jurisdiction: q.jurisdiction,
        granularity: q.granularity,
        derivedFrom: [q.quoteId],
        notes: [...(q.notes ?? []), "inverted"],
    };
    return out;
}
/**
 * Cross rate X→Y from two quotes sharing a common base C: C→X and C→Y.
 * rate(X→Y) = rate(C→Y) / rate(C→X).
 */
export function cross(cToX, cToY, opts) {
    validateQuote(cToX);
    validateQuote(cToY);
    if (cToX.base !== cToY.base)
        throw new RateError("RATE_CROSS_BASE", `bases differ: ${cToX.base} vs ${cToY.base}`);
    if (cToX.quote === cToY.quote)
        throw new RateError("RATE_SAME_CURRENCY", "cannot cross a currency with itself");
    const timeKnown = cToX.observedAt !== null && cToY.observedAt !== null;
    const tX = parseIso(cToX.observedAt ?? cToX.receivedAt);
    const tY = parseIso(cToY.observedAt ?? cToY.receivedAt);
    const skew = Math.abs(tX - tY);
    const outOfTolerance = !timeKnown || skew > opts.toleranceMs;
    const notes = [`cross via ${cToX.base}`];
    if (!timeKnown)
        notes.push("observation time unknown for at least one leg; marked estimated");
    else if (outOfTolerance)
        notes.push(`observation skew ${skew}ms exceeds tolerance ${opts.toleranceMs}ms`);
    const rate = decToShortString(divDec(parseDec(cToY.rate), parseDec(cToX.rate), DERIVED_RATE_FRACTION_DIGITS, "HALF_EVEN"));
    const kinds = new Set([cToX.rateKind, cToY.rateKind]);
    const rateKind = kinds.size === 1 ? cToX.rateKind : "indicative";
    const confidence = outOfTolerance || cToX.confidence === "estimated" || cToY.confidence === "estimated" ? "estimated" : "confirmed";
    return {
        quoteId: `${cToX.quoteId}x${cToY.quoteId}`,
        base: cToX.quote,
        quote: cToY.quote,
        rate,
        source: cToX.source === cToY.source ? cToX.source : `${cToX.source}+${cToY.source}`,
        observedAt: timeKnown ? new Date(Math.min(tX, tY)).toISOString() : null,
        receivedAt: new Date(Math.max(parseIso(cToX.receivedAt), parseIso(cToY.receivedAt))).toISOString(),
        expiresAt: earliest(cToX.expiresAt, cToY.expiresAt),
        rateKind,
        confidence,
        granularity: cToX.granularity === cToY.granularity ? cToX.granularity : "daily",
        derivedFrom: [cToX.quoteId, cToY.quoteId],
        notes,
    };
}
function earliest(a, b) {
    if (!a)
        return b;
    if (!b)
        return a;
    return parseIso(a) <= parseIso(b) ? a : b;
}
/**
 * Rate the user actually realized: paid `paid` (base) and received `received` (quote).
 * This is the "my rate" concept: all later conversions can use it instead of a market mid.
 */
export function realizedRate(paid, received, meta) {
    if (paid.m <= 0n || received.m <= 0n)
        throw new RateError("RATE_NON_POSITIVE", "paid and received must be > 0");
    return validateQuote({
        quoteId: `user:${meta.base}${meta.quote}:${meta.at}`,
        base: meta.base,
        quote: meta.quote,
        rate: decToShortString(divDec(received, paid, DERIVED_RATE_FRACTION_DIGITS, "HALF_EVEN")),
        source: "user",
        observedAt: meta.at,
        receivedAt: meta.receivedAt,
        rateKind: "user_realized",
        confidence: "confirmed",
        notes: ["derived from the user's own exchange receipt"],
    });
}
/** (market - realized) / market, as a decimal string percent with 2 fraction digits. Positive = user got less than mid. */
export function spreadPercent(market, realized) {
    if (market.base !== realized.base || market.quote !== realized.quote) {
        throw new RateError("RATE_PAIR_MISMATCH", "quotes are for different pairs");
    }
    const m = parseDec(market.rate);
    const r = parseDec(realized.rate);
    const diff = { m: m.m * 10n ** BigInt(r.e) - r.m * 10n ** BigInt(m.e), e: m.e + r.e };
    const ratio = divDec(mulDec(diff, { m: 100n, e: 0 }), m, 2, "HALF_EVEN");
    return decToShortString(ratio);
}
//# sourceMappingURL=rates.js.map
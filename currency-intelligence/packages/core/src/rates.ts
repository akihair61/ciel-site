import { type Dec, cmpDec, decToShortString, divDec, mulDec, parseDec } from "./dec.ts";
import { currency } from "./currencies.ts";

/**
 * What kind of rate this is. A market mid is never the same thing as what a
 * shop or a card applies; the kind must always travel with the number.
 */
export type RateKind =
  | "mid" // market midpoint
  | "bid" // provider buys base
  | "ask" // provider sells base
  | "indicative" // reference / daily (ECB-style). Never "live".
  | "cash_buy" // shop buys base for cash
  | "cash_sell" // shop sells base for cash
  | "card" // card network rate
  | "atm"
  | "user_realized"; // what the user actually got (receipt-derived)

export type Confidence = "confirmed" | "estimated";

export interface RateQuote {
  readonly quoteId: string;
  readonly base: string; // 1 unit of base ...
  readonly quote: string; // ... equals `rate` units of quote
  readonly rate: string; // decimal string
  readonly bid?: string;
  readonly ask?: string;
  readonly mid?: string;
  readonly source: string; // provider id, e.g. "frankfurter", "open-er-api", "user"
  readonly observedAt: string; // ISO 8601 UTC, when the provider says the rate was valid
  readonly receivedAt: string; // ISO 8601 UTC, when we got it
  readonly expiresAt?: string; // ISO 8601 UTC
  readonly rateKind: RateKind;
  readonly confidence: Confidence;
  readonly jurisdiction?: string; // ISO 3166-1 alpha-2 when the rate is location-bound
  readonly granularity?: "live" | "intraday" | "daily";
  /** Derivation trail: inverted / crossed quotes list their parents here. */
  readonly derivedFrom?: readonly string[];
  readonly notes?: readonly string[];
}

export class RateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RateError";
    this.code = code;
  }
}

/** Significant fraction digits kept for derived (inverted / crossed) rates. */
export const DERIVED_RATE_FRACTION_DIGITS = 12;

export function parseIso(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new RateError("RATE_TIME", `invalid timestamp: ${iso}`);
  return t;
}

export function validateQuote(q: RateQuote): RateQuote {
  currency(q.base);
  currency(q.quote);
  if (q.base === q.quote) throw new RateError("RATE_SAME_CURRENCY", `base and quote are both ${q.base}`);
  const r = parseDec(q.rate);
  if (r.m <= 0n) throw new RateError("RATE_NON_POSITIVE", `rate must be > 0, got ${q.rate}`);
  parseIso(q.observedAt);
  parseIso(q.receivedAt);
  if (q.expiresAt) parseIso(q.expiresAt);
  if (q.bid && q.ask && cmpDec(parseDec(q.bid), parseDec(q.ask)) > 0) {
    throw new RateError("RATE_BID_OVER_ASK", "bid is above ask");
  }
  return q;
}

export type Staleness = "fresh" | "stale" | "expired";

export interface StalenessReport {
  readonly status: Staleness;
  readonly ageMs: number;
  readonly ttlMs: number;
}

/**
 * fresh   : age ≤ ttl and not past expiresAt
 * stale   : age > ttl, still usable with a warning
 * expired : past expiresAt (provider says do not use) — UI must refuse to call it a rate
 */
export function staleness(q: RateQuote, nowMs: number, ttlMs: number): StalenessReport {
  const ageMs = Math.max(0, nowMs - parseIso(q.observedAt));
  if (q.expiresAt && nowMs > parseIso(q.expiresAt)) return { status: "expired", ageMs, ttlMs };
  return { status: ageMs <= ttlMs ? "fresh" : "stale", ageMs, ttlMs };
}

function invertDec(d: Dec): string {
  return decToShortString(divDec({ m: 1n, e: 0 }, d, DERIVED_RATE_FRACTION_DIGITS, "HALF_EVEN"));
}

/** quote→base from base→quote. Bid/ask swap and invert. */
export function invert(q: RateQuote): RateQuote {
  validateQuote(q);
  const out: RateQuote = {
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

export interface CrossOptions {
  /** Max allowed |observedAt(a) - observedAt(b)|. Beyond it the cross is marked estimated. */
  readonly toleranceMs: number;
}

/**
 * Cross rate X→Y from two quotes sharing a common base C: C→X and C→Y.
 * rate(X→Y) = rate(C→Y) / rate(C→X).
 */
export function cross(cToX: RateQuote, cToY: RateQuote, opts: CrossOptions): RateQuote {
  validateQuote(cToX);
  validateQuote(cToY);
  if (cToX.base !== cToY.base) throw new RateError("RATE_CROSS_BASE", `bases differ: ${cToX.base} vs ${cToY.base}`);
  if (cToX.quote === cToY.quote) throw new RateError("RATE_SAME_CURRENCY", "cannot cross a currency with itself");
  const tX = parseIso(cToX.observedAt);
  const tY = parseIso(cToY.observedAt);
  const skew = Math.abs(tX - tY);
  const outOfTolerance = skew > opts.toleranceMs;
  const notes: string[] = [`cross via ${cToX.base}`];
  if (outOfTolerance) notes.push(`observation skew ${skew}ms exceeds tolerance ${opts.toleranceMs}ms`);
  const rate = decToShortString(divDec(parseDec(cToY.rate), parseDec(cToX.rate), DERIVED_RATE_FRACTION_DIGITS, "HALF_EVEN"));
  const kinds = new Set<RateKind>([cToX.rateKind, cToY.rateKind]);
  const rateKind: RateKind = kinds.size === 1 ? cToX.rateKind : "indicative";
  const confidence: Confidence =
    outOfTolerance || cToX.confidence === "estimated" || cToY.confidence === "estimated" ? "estimated" : "confirmed";
  return {
    quoteId: `${cToX.quoteId}x${cToY.quoteId}`,
    base: cToX.quote,
    quote: cToY.quote,
    rate,
    source: cToX.source === cToY.source ? cToX.source : `${cToX.source}+${cToY.source}`,
    observedAt: new Date(Math.min(tX, tY)).toISOString(),
    receivedAt: new Date(Math.max(parseIso(cToX.receivedAt), parseIso(cToY.receivedAt))).toISOString(),
    expiresAt: earliest(cToX.expiresAt, cToY.expiresAt),
    rateKind,
    confidence,
    granularity: cToX.granularity === cToY.granularity ? cToX.granularity : "daily",
    derivedFrom: [cToX.quoteId, cToY.quoteId],
    notes,
  };
}

function earliest(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return parseIso(a) <= parseIso(b) ? a : b;
}

/**
 * Rate the user actually realized: paid `paid` (base) and received `received` (quote).
 * This is the "my rate" concept: all later conversions can use it instead of a market mid.
 */
export function realizedRate(paid: Dec, received: Dec, meta: { base: string; quote: string; at: string; receivedAt: string }): RateQuote {
  if (paid.m <= 0n || received.m <= 0n) throw new RateError("RATE_NON_POSITIVE", "paid and received must be > 0");
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
export function spreadPercent(market: RateQuote, realized: RateQuote): string {
  if (market.base !== realized.base || market.quote !== realized.quote) {
    throw new RateError("RATE_PAIR_MISMATCH", "quotes are for different pairs");
  }
  const m = parseDec(market.rate);
  const r = parseDec(realized.rate);
  const diff = { m: m.m * 10n ** BigInt(r.e) - r.m * 10n ** BigInt(m.e), e: m.e + r.e };
  const ratio = divDec(mulDec(diff, { m: 100n, e: 0 }), m, 2, "HALF_EVEN");
  return decToShortString(ratio);
}

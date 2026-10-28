import { test } from "node:test";
import assert from "node:assert/strict";
import { type RateQuote, cross, invert, realizedRate, spreadPercent, staleness, validateQuote, RateError } from "../src/rates.ts";
import { parseDec } from "../src/dec.ts";
import { Money } from "../src/money.ts";
import { convert } from "../src/convert.ts";

const T0 = "2026-10-27T09:00:00Z";
const q = (base: string, quote: string, rate: string, extra: Partial<RateQuote> = {}): RateQuote => ({
  quoteId: `t:${base}${quote}`,
  base,
  quote,
  rate,
  source: "test",
  observedAt: T0,
  receivedAt: T0,
  rateKind: "mid",
  confidence: "confirmed",
  ...extra,
});

test("validateQuote rejects bad quotes", () => {
  assert.throws(() => validateQuote(q("JPY", "JPY", "1")), (e: unknown) => e instanceof RateError && e.code === "RATE_SAME_CURRENCY");
  assert.throws(() => validateQuote(q("JPY", "THB", "0")), RateError);
  assert.throws(() => validateQuote(q("JPY", "THB", "-1")), RateError);
  assert.throws(() => validateQuote(q("JPY", "THB", "0.22", { bid: "0.23", ask: "0.22" })), (e: unknown) => e instanceof RateError && e.code === "RATE_BID_OVER_ASK");
  assert.throws(() => validateQuote(q("JPY", "THB", "0.22", { observedAt: "yesterday" })), RateError);
});

test("staleness: fresh / stale / expired", () => {
  const quote = q("JPY", "THB", "0.22", { expiresAt: "2026-10-28T09:00:00Z" });
  const t = Date.parse(T0);
  assert.equal(staleness(quote, t + 1000, 60_000).status, "fresh");
  assert.equal(staleness(quote, t + 120_000, 60_000).status, "stale");
  assert.equal(staleness(quote, Date.parse("2026-10-28T09:00:01Z"), 60_000).status, "expired");
});

test("invert swaps pair and bid/ask, inverse of inverse ≈ identity", () => {
  const inv = invert(q("USD", "JPY", "150", { bid: "149.9", ask: "150.1" }));
  assert.equal(inv.base, "JPY");
  assert.equal(inv.quote, "USD");
  assert.equal(inv.rate, "0.006666666667");
  assert.equal(inv.bid, "0.006662225183"); // 1/150.1
  assert.equal(inv.ask, "0.006671114076"); // 1/149.9
  assert.deepEqual(inv.derivedFrom, ["t:USDJPY"]);
  const back = invert(inv);
  // 150 ± rounding of 12 fraction digits
  assert.equal(back.rate.startsWith("149.99999999") || back.rate === "150", true);
});

test("cross rate via common base with time-skew policy", () => {
  const usdJpy = q("USD", "JPY", "150");
  const usdThb = q("USD", "THB", "33.5");
  const x = cross(usdJpy, usdThb, { toleranceMs: 60_000 });
  assert.equal(x.base, "JPY");
  assert.equal(x.quote, "THB");
  assert.equal(x.rate, "0.223333333333");
  assert.equal(x.confidence, "confirmed");
  const late = q("USD", "THB", "33.5", { observedAt: "2026-10-27T10:00:00Z" });
  const y = cross(usdJpy, late, { toleranceMs: 60_000 });
  assert.equal(y.confidence, "estimated");
  assert.match(y.notes!.join(" "), /skew/);
  assert.throws(() => cross(usdJpy, q("EUR", "THB", "36"), { toleranceMs: 1 }), RateError);
});

test("realized rate from a receipt and spread vs market", () => {
  const mine = realizedRate(parseDec("100000"), parseDec("22500"), { base: "JPY", quote: "THB", at: T0, receivedAt: T0 });
  assert.equal(mine.rate, "0.225");
  assert.equal(mine.rateKind, "user_realized");
  const market = q("JPY", "THB", "0.2300");
  assert.equal(spreadPercent(market, mine), "2.17"); // (0.23-0.225)/0.23
  const better = realizedRate(parseDec("100000"), parseDec("23500"), { base: "JPY", quote: "THB", at: T0, receivedAt: T0 });
  assert.equal(spreadPercent(market, better), "-2.17");
});

test("convert: gross, fees, net, rounding recorded", () => {
  const r = convert(Money.of("350", "THB"), q("THB", "JPY", "4.4642"), { rounding: "HALF_EVEN" });
  assert.equal(r.convertedAmount.toDecimalString(), "1562"); // 1562.47 → 1562
  assert.equal(r.roundingMode, "HALF_EVEN");
  assert.equal(r.estimated, false);
  assert.equal(r.netAmount.equals(r.convertedAmount), true);

  const card = convert(Money.of("350", "THB"), q("THB", "JPY", "4.4642"), {
    rounding: "HALF_UP",
    fees: { percentageFee: "1.6", confidence: "confirmed" },
  });
  assert.equal(card.percentageFee.toDecimalString(), "25"); // 1562 * 1.6% = 24.99 → 25
  assert.equal(card.totalCost.toDecimalString(), "25");
  assert.equal(card.netAmount.toDecimalString(), "1537");

  const atm = convert(Money.of("10000", "JPY"), q("JPY", "THB", "0.225"), {
    rounding: "HALF_EVEN",
    fees: { fixedFee: Money.of("220.00", "THB"), spreadPercent: "0.5" },
  });
  assert.equal(atm.convertedAmount.toDecimalString(), "2250.00");
  assert.equal(atm.spread.toDecimalString(), "11.25");
  assert.equal(atm.fixedFee.toDecimalString(), "220.00");
  assert.equal(atm.netAmount.toDecimalString(), "2018.75");
  assert.equal(atm.estimated, true); // fee confidence not confirmed
});

test("convert rejects mismatched base and negative amounts", () => {
  assert.throws(() => convert(Money.of("1", "JPY"), q("THB", "JPY", "4.4"), { rounding: "HALF_UP" }));
  assert.throws(() => convert(Money.of("-1", "JPY"), q("JPY", "THB", "0.22"), { rounding: "HALF_UP" }));
});

test("property: A→B→A round trip error stays within 1 minor unit of B's scale effect", () => {
  const fwd = q("JPY", "THB", "0.2233");
  const back = invert(fwd);
  for (let yen = 1; yen <= 5000; yen += 37) {
    const a = Money.of(String(yen), "JPY");
    const b = convert(a, fwd, { rounding: "HALF_EVEN" }).convertedAmount;
    const a2 = convert(b, back, { rounding: "HALF_EVEN" }).convertedAmount;
    const diff = a2.subtract(a).abs();
    // one THB satang ≈ 0.045 JPY, so after rounding both ways the drift is ≤ 1 JPY
    assert.ok(diff.minor <= 1n, `round trip drift ${diff.toString()} for ${a.toString()}`);
  }
});

test("observedAt may be null: age falls back to receivedAt, cross is marked estimated (Q-02)", () => {
  const unknown: RateQuote = { ...q("USD", "JPY", "150"), observedAt: null, receivedAt: "2026-10-28T03:00:00Z", quoteId: "cb:USDJPY" };
  validateQuote(unknown);
  const s = staleness(unknown, Date.parse("2026-10-28T03:00:30Z"), 45_000);
  assert.equal(s.basis, "receivedAt");
  assert.equal(s.status, "fresh");
  assert.equal(s.ageMs, 30_000);
  const known = q("USD", "THB", "33.5", { observedAt: "2026-10-28T03:00:00Z", receivedAt: "2026-10-28T03:00:00Z", confidence: "confirmed" });
  const x = cross(unknown, known, { toleranceMs: 60_000 });
  assert.equal(x.observedAt, null);
  assert.equal(x.confidence, "estimated");
  assert.ok(x.notes!.some((n) => /observation time unknown/.test(n)));
  assert.equal(invert(unknown).observedAt, null);
});

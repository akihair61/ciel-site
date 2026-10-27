import { test } from "node:test";
import assert from "node:assert/strict";
import { Money, MoneyError } from "../src/money.ts";
import { currency } from "../src/currencies.ts";

test("currency scale from ISO 4217: JPY 0, THB 2, KWD 3", () => {
  assert.equal(currency("JPY").scale, 0);
  assert.equal(currency("THB").scale, 2);
  assert.equal(currency("KWD").scale, 3);
  assert.throws(() => currency("XXX"));
});

test("Money.of respects scale and refuses implicit rounding", () => {
  assert.equal(Money.of("1500", "JPY").minor, 1500n);
  assert.equal(Money.of("12.34", "THB").minor, 1234n);
  assert.equal(Money.of("1.234", "KWD").minor, 1234n);
  assert.throws(() => Money.of("1.5", "JPY"), (e: unknown) => e instanceof MoneyError && e.code === "MONEY_PRECISION");
  assert.throws(() => Money.of("1.234", "THB"), MoneyError);
  assert.equal(Money.of("1.234", "THB", "HALF_UP").toDecimalString(), "1.23");
  assert.equal(Money.of("1.235", "THB", "HALF_EVEN").toDecimalString(), "1.24");
});

test("arithmetic, currency mismatch, overflow", () => {
  const a = Money.of("100.10", "THB");
  const b = Money.of("0.90", "THB");
  assert.equal(a.add(b).toDecimalString(), "101.00");
  assert.equal(a.subtract(b).toDecimalString(), "99.20");
  assert.throws(() => a.add(Money.of("1", "JPY")), (e: unknown) => e instanceof MoneyError && e.code === "MONEY_CURRENCY_MISMATCH");
  assert.throws(() => Money.fromMinor(10n ** 25n, "JPY"), (e: unknown) => e instanceof MoneyError && e.code === "MONEY_OVERFLOW");
});

test("multiply / divide / percent use explicit rounding", () => {
  const p = Money.of("1000", "JPY");
  assert.equal(p.multiply("0.225", "HALF_EVEN").toDecimalString(), "225");
  assert.equal(p.multiply("0.2255", "HALF_EVEN").toDecimalString(), "226"); // 225.5 → even 226
  assert.equal(p.multiply("0.2245", "HALF_EVEN").toDecimalString(), "224"); // 224.5 → even 224
  assert.equal(Money.of("100.00", "THB").percent("1.6", "HALF_UP").toDecimalString(), "1.60");
  assert.equal(Money.of("33.33", "THB").divide("3", "HALF_UP").toDecimalString(), "11.11");
});

test("allocate: sum invariant and deterministic remainder placement", () => {
  const m = Money.of("100", "JPY");
  const parts = m.allocate([1, 1, 1]);
  assert.deepEqual(parts.map((x) => x.minor), [34n, 33n, 33n]);
  assert.equal(Money.sum(parts).minor, 100n);
  const w = Money.of("10.00", "THB").allocate([2, 1, 1]);
  assert.deepEqual(w.map((x) => x.toDecimalString()), ["5.00", "2.50", "2.50"]);
  const neg = Money.of("-100", "JPY").allocate([1, 1, 1]);
  assert.deepEqual(neg.map((x) => x.minor), [-34n, -33n, -33n]);
});

test("property: allocate always sums to total for random inputs", () => {
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let i = 0; i < 500; i++) {
    const total = Money.fromMinor(BigInt(rnd() % 1_000_000), "THB");
    const n = 1 + (rnd() % 7);
    const weights = Array.from({ length: n }, () => rnd() % 5);
    if (weights.every((w) => w === 0)) weights[0] = 1;
    const parts = total.allocate(weights);
    assert.equal(Money.sum(parts, "THB").minor, total.minor);
    assert.equal(parts.length, n);
  }
});

test("cash rounding step (CHF 0.05)", () => {
  assert.equal(Money.of("10.02", "CHF").roundToCash().toDecimalString(), "10.00");
  assert.equal(Money.of("10.03", "CHF").roundToCash().toDecimalString(), "10.05");
  assert.equal(Money.of("10.03", "THB").roundToCash().toDecimalString(), "10.03");
});

test("format uses Intl with a decimal string and currency scale", () => {
  assert.equal(Money.of("1234", "JPY").format("ja-JP"), "￥1,234");
  assert.equal(Money.of("1234.5", "THB", "DOWN").format("en-US"), "฿1,234.50");
  assert.equal(Money.of("1.234", "KWD").format("en-US").endsWith("1.234"), true);
});

test("JSON round trip", () => {
  const m = Money.of("99.90", "THB");
  assert.deepEqual(m.toJSON(), { currency: "THB", amount: "99.90" });
  assert.equal(Money.fromJSON(m.toJSON()).equals(m), true);
});

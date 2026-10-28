import { test } from "node:test";
import assert from "node:assert/strict";
import { Money } from "../src/money.ts";
import { type PaymentOption, comparePayments } from "../src/compare.ts";
import { settle, splitByWeight, splitEqual, splitExact } from "../src/split.ts";

const jpy = (s: string) => Money.of(s, "JPY");

const base: Omit<PaymentOption, "id" | "label" | "kind"> = {
  convertedPrincipal: jpy("1562"),
  knownFees: [],
  estimatedFees: [],
  evidence: ["test"],
};

test("comparePayments ranks by netCost when everything is known", () => {
  const r = comparePayments([
    { ...base, id: "cash", label: "現金", kind: "cash", convertedPrincipal: jpy("1600"), travelCost: jpy("0") },
    { ...base, id: "cardA", label: "カードA", kind: "card", knownFees: [jpy("25")], rewardValue: jpy("16") },
    { ...base, id: "cardB", label: "カードB", kind: "card", knownFees: [jpy("34")] },
  ]);
  assert.equal(r.ranking, "ranked");
  assert.equal(r.cheapestExpected?.option.id, "cardA");
  assert.equal(r.cheapestExpected?.netCost.toDecimalString(), "1571");
  assert.deepEqual(
    r.scored.map((s) => s.option.id),
    ["cardA", "cardB", "cash"],
  );
  assert.equal(r.highestReward?.option.id, "cardA");
  assert.deepEqual(r.needsCash.map((s) => s.option.id), ["cash"]);
});

test("a material unknown makes the ranking undetermined; mostCertain still answers", () => {
  const r = comparePayments([
    { ...base, id: "cash", label: "現金", kind: "cash", convertedPrincipal: jpy("1600") },
    {
      ...base,
      id: "card",
      label: "カード",
      kind: "card",
      estimatedFees: [jpy("25")],
      unknowns: [{ name: "issuer foreign fee", material: true }],
    },
  ]);
  assert.equal(r.ranking, "undetermined");
  assert.equal(r.cheapestExpected, undefined);
  assert.equal(r.mostCertain?.option.id, "cash");
  assert.equal(r.scored[0].option.id, "card"); // still sorted, but UI must not call it cheapest
});

test("splitEqual / splitByWeight invariants", () => {
  const ps = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const eq = splitEqual(jpy("1000"), ps);
  assert.deepEqual(eq.shares.map((s) => s.amount.minor), [334n, 333n, 333n]);
  assert.deepEqual(eq.roundingAbsorbedBy, ["a"]);
  const w = splitByWeight(Money.of("100.00", "THB"), ps, [1, 1, 2]);
  assert.deepEqual(w.shares.map((s) => s.amount.toDecimalString()), ["25.00", "25.00", "50.00"]);
  assert.throws(() => splitExact(jpy("100"), [{ participantId: "a", amount: jpy("60") }, { participantId: "b", amount: jpy("30") }]));
});

test("settle produces transfers that zero every balance", () => {
  const ps = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const { shares } = splitEqual(jpy("3000"), ps);
  const transfers = settle(shares, [{ payerId: "a", amount: jpy("3000") }]);
  assert.deepEqual(
    transfers.map((t) => [t.from, t.to, t.amount.minor]),
    [
      ["b", "a", 1000n],
      ["c", "a", 1000n],
    ],
  );
  // balances after transfers
  const bal = new Map<string, bigint>();
  for (const s of shares) bal.set(s.participantId, (bal.get(s.participantId) ?? 0n) - s.amount.minor);
  bal.set("a", (bal.get("a") ?? 0n) + 3000n);
  for (const t of transfers) {
    bal.set(t.from, bal.get(t.from)! + t.amount.minor);
    bal.set(t.to, bal.get(t.to)! - t.amount.minor);
  }
  for (const v of bal.values()) assert.equal(v, 0n);
});

test("settle: proposal reduces transfers (≤ debtors + creditors − 1), balances net to zero, never claimed minimal", () => {
  const ccy = "THB";
  const shares = ["A", "B", "C", "D", "E"].map((id, i) => ({ participantId: id, amount: Money.of(String(100 + i * 37) + ".25", ccy) }));
  const total = Money.sum(shares.map((s) => s.amount), ccy);
  const payments = [{ payerId: "A", amount: total.subtract(Money.of("50", ccy)) }, { payerId: "C", amount: Money.of("50", ccy) }];
  const transfers = settle(shares, payments);
  const net = new Map<string, bigint>();
  for (const s of shares) net.set(s.participantId, (net.get(s.participantId) ?? 0n) - s.amount.minor);
  for (const p of payments) net.set(p.payerId, (net.get(p.payerId) ?? 0n) + p.amount.minor);
  for (const t of transfers) { net.set(t.from, net.get(t.from)! + t.amount.minor); net.set(t.to, net.get(t.to)! - t.amount.minor); assert.ok(t.amount.isPositive()); }
  for (const [, v] of net) assert.equal(v, 0n);
  const debtors = [...net.keys()].filter((k) => shares.find((s) => s.participantId === k)!.amount.minor > (payments.find((p) => p.payerId === k)?.amount.minor ?? 0n)).length;
  const creditors = shares.length - debtors;
  assert.ok(transfers.length <= debtors + creditors - 1);
  assert.deepEqual(settle(shares, payments), transfers); // deterministic
});

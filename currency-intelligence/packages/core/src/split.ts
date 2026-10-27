import { Money, MoneyError } from "./money.ts";

export interface Participant {
  readonly id: string;
}

export interface Share {
  readonly participantId: string;
  readonly amount: Money;
}

export interface SplitResult {
  readonly total: Money;
  readonly shares: readonly Share[];
  /** Participants who absorbed one extra minor unit from rounding, in order. */
  readonly roundingAbsorbedBy: readonly string[];
}

function finish(total: Money, participants: readonly Participant[], amounts: Money[], ideal: readonly bigint[] | null): SplitResult {
  const shares = participants.map((p, i) => ({ participantId: p.id, amount: amounts[i] }));
  const absorbed: string[] = [];
  if (ideal) {
    amounts.forEach((m, i) => {
      if (m.minor > ideal[i]) absorbed.push(participants[i].id);
    });
  }
  const sum = Money.sum(amounts, total.currency);
  if (!sum.equals(total)) throw new MoneyError("SPLIT_INVARIANT", "shares do not sum to total");
  return { total, shares, roundingAbsorbedBy: absorbed };
}

/** Equal split; the first participants (stable order) absorb the remainder. */
export function splitEqual(total: Money, participants: readonly Participant[]): SplitResult {
  if (participants.length === 0) throw new MoneyError("SPLIT_EMPTY", "no participants");
  const weights = participants.map(() => 1n);
  const amounts = total.allocate(weights);
  const n = BigInt(participants.length);
  const floor = total.minor / n;
  return finish(total, participants, amounts, participants.map(() => floor));
}

/** Split by weights (e.g. 2:1:1). Largest remainder, ties to earlier participants. */
export function splitByWeight(total: Money, participants: readonly Participant[], weights: readonly number[]): SplitResult {
  if (participants.length !== weights.length) throw new MoneyError("SPLIT_WEIGHTS", "weights must match participants");
  const amounts = total.allocate(weights);
  const w = weights.map(BigInt);
  const tw = w.reduce((a, b) => a + b, 0n);
  const ideal = w.map((x) => (total.minor * x) / tw);
  return finish(total, participants, amounts, ideal);
}

/** Exact shares supplied by the user; they must sum to total. */
export function splitExact(total: Money, shares: readonly Share[]): SplitResult {
  const sum = Money.sum(
    shares.map((s) => s.amount),
    total.currency,
  );
  if (!sum.equals(total)) {
    throw new MoneyError("SPLIT_EXACT_MISMATCH", `shares sum to ${sum.toString()} but total is ${total.toString()}`);
  }
  return {
    total,
    shares,
    roundingAbsorbedBy: [],
  };
}

export interface Payment {
  readonly payerId: string;
  readonly amount: Money;
}

export interface Transfer {
  readonly from: string;
  readonly to: string;
  readonly amount: Money;
}

/**
 * Settle a set of payments against the agreed shares with the minimum-ish
 * number of transfers (greedy largest debtor → largest creditor). Deterministic.
 */
export function settle(shares: readonly Share[], payments: readonly Payment[]): Transfer[] {
  if (shares.length === 0) return [];
  const ccy = shares[0].amount.currency;
  const balance = new Map<string, bigint>();
  for (const s of shares) balance.set(s.participantId, (balance.get(s.participantId) ?? 0n) - s.amount.minor);
  for (const p of payments) {
    if (p.amount.currency !== ccy) throw new MoneyError("SETTLE_CURRENCY", "payments must be in the share currency");
    balance.set(p.payerId, (balance.get(p.payerId) ?? 0n) + p.amount.minor);
  }
  const debtors = [...balance].filter(([, b]) => b < 0n).map(([id, b]) => ({ id, owe: -b }));
  const creditors = [...balance].filter(([, b]) => b > 0n).map(([id, b]) => ({ id, due: b }));
  const byAmountThenId = <T extends { id: string }>(a: T & { v: bigint }, b: T & { v: bigint }) => (a.v === b.v ? (a.id < b.id ? -1 : 1) : a.v > b.v ? -1 : 1);
  const D = debtors.map((d) => ({ id: d.id, v: d.owe })).sort(byAmountThenId);
  const C = creditors.map((c) => ({ id: c.id, v: c.due })).sort(byAmountThenId);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < D.length && j < C.length) {
    const amt = D[i].v < C[j].v ? D[i].v : C[j].v;
    out.push({ from: D[i].id, to: C[j].id, amount: Money.fromMinor(amt, ccy) });
    D[i].v -= amt;
    C[j].v -= amt;
    if (D[i].v === 0n) i++;
    if (C[j].v === 0n) j++;
  }
  return out;
}

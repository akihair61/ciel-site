import { Money, MoneyError } from "./money.js";
function finish(total, participants, amounts, ideal) {
    const shares = participants.map((p, i) => ({ participantId: p.id, amount: amounts[i] }));
    const absorbed = [];
    if (ideal) {
        amounts.forEach((m, i) => {
            if (m.minor > ideal[i])
                absorbed.push(participants[i].id);
        });
    }
    const sum = Money.sum(amounts, total.currency);
    if (!sum.equals(total))
        throw new MoneyError("SPLIT_INVARIANT", "shares do not sum to total");
    return { total, shares, roundingAbsorbedBy: absorbed };
}
/** Equal split; the first participants (stable order) absorb the remainder. */
export function splitEqual(total, participants) {
    if (participants.length === 0)
        throw new MoneyError("SPLIT_EMPTY", "no participants");
    const weights = participants.map(() => 1n);
    const amounts = total.allocate(weights);
    const n = BigInt(participants.length);
    const floor = total.minor / n;
    return finish(total, participants, amounts, participants.map(() => floor));
}
/** Split by weights (e.g. 2:1:1). Largest remainder, ties to earlier participants. */
export function splitByWeight(total, participants, weights) {
    if (participants.length !== weights.length)
        throw new MoneyError("SPLIT_WEIGHTS", "weights must match participants");
    const amounts = total.allocate(weights);
    const w = weights.map(BigInt);
    const tw = w.reduce((a, b) => a + b, 0n);
    const ideal = w.map((x) => (total.minor * x) / tw);
    return finish(total, participants, amounts, ideal);
}
/** Exact shares supplied by the user; they must sum to total. */
export function splitExact(total, shares) {
    const sum = Money.sum(shares.map((s) => s.amount), total.currency);
    if (!sum.equals(total)) {
        throw new MoneyError("SPLIT_EXACT_MISMATCH", `shares sum to ${sum.toString()} but total is ${total.toString()}`);
    }
    return {
        total,
        shares,
        roundingAbsorbedBy: [],
    };
}
/**
 * Propose transfers that settle the payments against the agreed shares.
 *
 * Greedy: largest debtor pays largest creditor, repeat. This *reduces* the
 * number of transfers (never more than debtors + creditors − 1) but is NOT
 * guaranteed to be the theoretical minimum, which is NP-hard in general.
 * UI wording must therefore be "精算回数を減らす提案", never "最少回数".
 * Deterministic: ties broken by participant id.
 */
export function settle(shares, payments) {
    if (shares.length === 0)
        return [];
    const ccy = shares[0].amount.currency;
    const balance = new Map();
    for (const s of shares)
        balance.set(s.participantId, (balance.get(s.participantId) ?? 0n) - s.amount.minor);
    for (const p of payments) {
        if (p.amount.currency !== ccy)
            throw new MoneyError("SETTLE_CURRENCY", "payments must be in the share currency");
        balance.set(p.payerId, (balance.get(p.payerId) ?? 0n) + p.amount.minor);
    }
    const debtors = [...balance].filter(([, b]) => b < 0n).map(([id, b]) => ({ id, owe: -b }));
    const creditors = [...balance].filter(([, b]) => b > 0n).map(([id, b]) => ({ id, due: b }));
    const byAmountThenId = (a, b) => (a.v === b.v ? (a.id < b.id ? -1 : 1) : a.v > b.v ? -1 : 1);
    const D = debtors.map((d) => ({ id: d.id, v: d.owe })).sort(byAmountThenId);
    const C = creditors.map((c) => ({ id: c.id, v: c.due })).sort(byAmountThenId);
    const out = [];
    let i = 0;
    let j = 0;
    while (i < D.length && j < C.length) {
        const amt = D[i].v < C[j].v ? D[i].v : C[j].v;
        out.push({ from: D[i].id, to: C[j].id, amount: Money.fromMinor(amt, ccy) });
        D[i].v -= amt;
        C[j].v -= amt;
        if (D[i].v === 0n)
            i++;
        if (C[j].v === 0n)
            j++;
    }
    return out;
}
//# sourceMappingURL=split.js.map
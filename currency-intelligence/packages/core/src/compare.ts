import { Money, MoneyError } from "./money.ts";

export type PaymentKind = "cash" | "card" | "wallet" | "atm";

export interface UnknownFactor {
  readonly name: string; // e.g. "issuer foreign fee", "reward point value"
  /** Material unknowns block a definitive ranking. */
  readonly material: boolean;
}

/**
 * One way to pay a given price. All money fields are in the evaluation
 * currency chosen by the user (never silently in the merchant's currency).
 */
export interface PaymentOption {
  readonly id: string;
  readonly label: string;
  readonly kind: PaymentKind;
  /** Price converted at the option's own rate (cash shop rate, card network rate, ...). */
  readonly convertedPrincipal: Money;
  readonly knownFees: readonly Money[];
  readonly estimatedFees: readonly Money[];
  readonly travelCost?: Money; // getting to the exchange booth / ATM
  readonly rewardValue?: Money; // cashback / points at the user's valuation
  readonly unknowns?: readonly UnknownFactor[];
  readonly evidence: readonly string[]; // sources, terms dates, assumptions
  readonly rateObservedAt?: string;
  readonly termsVersion?: string;
}

export interface ScoredOption {
  readonly option: PaymentOption;
  readonly netCost: Money;
  /** convertedPrincipal + knownFees only. What is certain. */
  readonly confirmedCost: Money;
  readonly estimatedPortion: Money; // estimatedFees + travel + reward (anything not confirmed)
  readonly hasMaterialUnknowns: boolean;
  readonly unknownCount: number;
}

export interface ComparisonResult {
  readonly currency: string;
  readonly scored: readonly ScoredOption[]; // sorted by netCost ascending
  /** "ranked" when no material unknowns exist; otherwise "undetermined" and the UI must not say "cheapest". */
  readonly ranking: "ranked" | "undetermined";
  readonly cheapestExpected?: ScoredOption;
  readonly mostCertain?: ScoredOption;
  readonly highestReward?: ScoredOption;
  readonly needsCash: readonly ScoredOption[];
  readonly computedAt: string;
}

function sumOrZero(items: readonly Money[], ccy: string): Money {
  return Money.sum(items, ccy);
}

/** netCost = convertedPrincipal + knownFees + estimatedFees + travelCost − rewardValue */
export function scoreOption(o: PaymentOption): ScoredOption {
  const ccy = o.convertedPrincipal.currency;
  const known = sumOrZero(o.knownFees, ccy);
  const est = sumOrZero(o.estimatedFees, ccy);
  const travel = o.travelCost ?? Money.zero(ccy);
  const reward = o.rewardValue ?? Money.zero(ccy);
  for (const m of [known, est, travel, reward]) {
    if (m.currency !== ccy) throw new MoneyError("COMPARE_CURRENCY", `option ${o.id} mixes ${m.currency} with ${ccy}`);
  }
  const confirmedCost = o.convertedPrincipal.add(known);
  const estimatedPortion = est.add(travel).subtract(reward);
  const unknowns = o.unknowns ?? [];
  return {
    option: o,
    netCost: confirmedCost.add(estimatedPortion),
    confirmedCost,
    estimatedPortion,
    hasMaterialUnknowns: unknowns.some((u) => u.material),
    unknownCount: unknowns.length,
  };
}

export function comparePayments(options: readonly PaymentOption[], now: Date = new Date()): ComparisonResult {
  if (options.length === 0) throw new MoneyError("COMPARE_EMPTY", "no options to compare");
  const ccy = options[0].convertedPrincipal.currency;
  const scored = options.map(scoreOption).sort((a, b) => a.netCost.compareTo(b.netCost));
  const undetermined = scored.some((s) => s.hasMaterialUnknowns);
  const mostCertain = [...scored].sort((a, b) => {
    const ua = a.hasMaterialUnknowns ? 1 : 0;
    const ub = b.hasMaterialUnknowns ? 1 : 0;
    if (ua !== ub) return ua - ub;
    if (a.unknownCount !== b.unknownCount) return a.unknownCount - b.unknownCount;
    const ea = a.estimatedPortion.abs();
    const eb = b.estimatedPortion.abs();
    const c = ea.compareTo(eb);
    if (c !== 0) return c;
    return a.netCost.compareTo(b.netCost);
  })[0];
  const withReward = scored.filter((s) => s.option.rewardValue && s.option.rewardValue.isPositive());
  const highestReward = withReward.sort((a, b) => b.option.rewardValue!.compareTo(a.option.rewardValue!))[0];
  return {
    currency: ccy,
    scored,
    ranking: undetermined ? "undetermined" : "ranked",
    cheapestExpected: undetermined ? undefined : scored[0],
    mostCertain,
    highestReward,
    needsCash: scored.filter((s) => s.option.kind === "cash" || s.option.kind === "atm"),
    computedAt: now.toISOString(),
  };
}

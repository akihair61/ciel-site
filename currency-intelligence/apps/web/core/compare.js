import { Money, MoneyError } from "./money.js";
function sumOrZero(items, ccy) {
    return Money.sum(items, ccy);
}
/** netCost = convertedPrincipal + knownFees + estimatedFees + travelCost − rewardValue */
export function scoreOption(o) {
    const ccy = o.convertedPrincipal.currency;
    const known = sumOrZero(o.knownFees, ccy);
    const est = sumOrZero(o.estimatedFees, ccy);
    const travel = o.travelCost ?? Money.zero(ccy);
    const reward = o.rewardValue ?? Money.zero(ccy);
    for (const m of [known, est, travel, reward]) {
        if (m.currency !== ccy)
            throw new MoneyError("COMPARE_CURRENCY", `option ${o.id} mixes ${m.currency} with ${ccy}`);
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
export function comparePayments(options, now = new Date()) {
    if (options.length === 0)
        throw new MoneyError("COMPARE_EMPTY", "no options to compare");
    const ccy = options[0].convertedPrincipal.currency;
    const scored = options.map(scoreOption).sort((a, b) => a.netCost.compareTo(b.netCost));
    const undetermined = scored.some((s) => s.hasMaterialUnknowns);
    const mostCertain = [...scored].sort((a, b) => {
        const ua = a.hasMaterialUnknowns ? 1 : 0;
        const ub = b.hasMaterialUnknowns ? 1 : 0;
        if (ua !== ub)
            return ua - ub;
        if (a.unknownCount !== b.unknownCount)
            return a.unknownCount - b.unknownCount;
        const ea = a.estimatedPortion.abs();
        const eb = b.estimatedPortion.abs();
        const c = ea.compareTo(eb);
        if (c !== 0)
            return c;
        return a.netCost.compareTo(b.netCost);
    })[0];
    const withReward = scored.filter((s) => s.option.rewardValue && s.option.rewardValue.isPositive());
    const highestReward = withReward.sort((a, b) => b.option.rewardValue.compareTo(a.option.rewardValue))[0];
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
//# sourceMappingURL=compare.js.map
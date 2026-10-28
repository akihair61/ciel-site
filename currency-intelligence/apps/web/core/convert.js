import { mulDec, parseDec } from "./dec.js";
import { Money, MoneyError } from "./money.js";
import { validateQuote } from "./rates.js";
/**
 * Convert `amount` (in quote.base) to quote.quote using the quoted rate.
 * Rounding happens exactly once, on the final gross figure; fees are each
 * rounded individually (that is how issuers bill them) and summed.
 */
export function convert(amount, quote, opts) {
    validateQuote(quote);
    if (amount.currency !== quote.base) {
        throw new MoneyError("CONVERT_BASE_MISMATCH", `amount is ${amount.currency} but quote base is ${quote.base}`);
    }
    if (amount.isNegative())
        throw new MoneyError("CONVERT_NEGATIVE", "amount must not be negative");
    const assumptions = [];
    const gross = Money.fromDec(mulDec(amount.toDec(), parseDec(quote.rate)), quote.quote, opts.rounding);
    const fees = opts.fees ?? {};
    const spread = fees.spreadPercent ? gross.percent(fees.spreadPercent, opts.rounding) : Money.zero(quote.quote);
    const percentageFee = fees.percentageFee ? gross.percent(fees.percentageFee, opts.rounding) : Money.zero(quote.quote);
    let fixedFee = Money.zero(quote.quote);
    if (fees.fixedFee) {
        if (fees.fixedFee.currency !== quote.quote) {
            throw new MoneyError("CONVERT_FEE_CURRENCY", `fixed fee must be in ${quote.quote}`);
        }
        fixedFee = fees.fixedFee;
    }
    const totalCost = spread.add(percentageFee).add(fixedFee);
    if (fees.spreadPercent)
        assumptions.push(`spread ${fees.spreadPercent}% on gross`);
    if (fees.percentageFee)
        assumptions.push(`percentage fee ${fees.percentageFee}% on gross`);
    if (fees.fixedFee)
        assumptions.push(`fixed fee ${fees.fixedFee.toString()}`);
    if (quote.confidence === "estimated")
        assumptions.push("rate is estimated");
    const feesEstimated = (fees.spreadPercent || fees.percentageFee || fees.fixedFee) && fees.confidence !== "confirmed";
    if (feesEstimated)
        assumptions.push("fees are estimated");
    return {
        originalAmount: amount,
        convertedAmount: gross,
        netAmount: gross.subtract(totalCost),
        rate: quote.rate,
        quoteId: quote.quoteId,
        source: quote.source,
        rateKind: quote.rateKind,
        observedAt: quote.observedAt,
        receivedAt: quote.receivedAt,
        currencyScale: gross.scale,
        roundingMode: opts.rounding,
        spread,
        fixedFee,
        percentageFee,
        totalCost,
        estimated: quote.confidence === "estimated" || Boolean(feesEstimated),
        assumptions,
    };
}
//# sourceMappingURL=convert.js.map
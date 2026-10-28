import { type RoundingMode, mulDec, parseDec } from "./dec.ts";
import { Money, MoneyError } from "./money.ts";
import { type RateQuote, validateQuote } from "./rates.ts";

export interface FeeSpec {
  /** Provider spread applied on top of the quoted rate, percent as decimal string ("0.5" = 0.5 %). */
  readonly spreadPercent?: string;
  /** Fixed fee in the quote currency, e.g. ATM operator fee. */
  readonly fixedFee?: Money;
  /** Percentage fee on the converted amount ("1.6" = 1.6 %). */
  readonly percentageFee?: string;
  /** Whether the fee figures are confirmed (from terms) or estimated (user input / guess). */
  readonly confidence?: "confirmed" | "estimated";
}

export interface ConversionOptions {
  readonly rounding: RoundingMode;
  readonly fees?: FeeSpec;
}

export interface ConversionResult {
  readonly originalAmount: Money;
  /** Gross converted amount at the quoted rate, before any fee. */
  readonly convertedAmount: Money;
  /** convertedAmount − totalCost. What the user ends up with when fees are deducted from the converted side. */
  readonly netAmount: Money;
  readonly rate: string;
  readonly quoteId: string;
  readonly source: string;
  readonly rateKind: RateQuote["rateKind"];
  /** null when the provider published no observation time (see RateQuote.observedAt). */
  readonly observedAt: string | null;
  readonly receivedAt: string;
  readonly currencyScale: number;
  readonly roundingMode: RoundingMode;
  readonly spread: Money;
  readonly fixedFee: Money;
  readonly percentageFee: Money;
  readonly totalCost: Money;
  readonly estimated: boolean;
  readonly assumptions: readonly string[];
}

/**
 * Convert `amount` (in quote.base) to quote.quote using the quoted rate.
 * Rounding happens exactly once, on the final gross figure; fees are each
 * rounded individually (that is how issuers bill them) and summed.
 */
export function convert(amount: Money, quote: RateQuote, opts: ConversionOptions): ConversionResult {
  validateQuote(quote);
  if (amount.currency !== quote.base) {
    throw new MoneyError("CONVERT_BASE_MISMATCH", `amount is ${amount.currency} but quote base is ${quote.base}`);
  }
  if (amount.isNegative()) throw new MoneyError("CONVERT_NEGATIVE", "amount must not be negative");

  const assumptions: string[] = [];
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
  if (fees.spreadPercent) assumptions.push(`spread ${fees.spreadPercent}% on gross`);
  if (fees.percentageFee) assumptions.push(`percentage fee ${fees.percentageFee}% on gross`);
  if (fees.fixedFee) assumptions.push(`fixed fee ${fees.fixedFee.toString()}`);
  if (quote.confidence === "estimated") assumptions.push("rate is estimated");
  const feesEstimated = (fees.spreadPercent || fees.percentageFee || fees.fixedFee) && fees.confidence !== "confirmed";
  if (feesEstimated) assumptions.push("fees are estimated");

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

import {
  type Dec,
  type RoundingMode,
  decToString,
  divDec,
  losesPrecision,
  mulDec,
  parseDec,
  pow10,
  roundDiv,
  scaleTo,
} from "./dec.ts";
import { currency } from "./currencies.ts";

export class MoneyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MoneyError";
    this.code = code;
  }
}

/** Hard cap on magnitude in minor units (10^24). Guards against overflow from bad input. */
export const MAX_MINOR = 10n ** 24n;

export interface MoneyJSON {
  readonly currency: string;
  readonly amount: string; // decimal string, exact scale of the currency
}

/**
 * Immutable money value in integer minor units.
 * Two Money values are only combinable when their currency codes match.
 */
export class Money {
  readonly currency: string;
  readonly minor: bigint;
  readonly scale: number;

  private constructor(currencyCode: string, minor: bigint) {
    const meta = currency(currencyCode);
    if (minor > MAX_MINOR || minor < -MAX_MINOR) {
      throw new MoneyError("MONEY_OVERFLOW", `amount exceeds limit in ${currencyCode}`);
    }
    this.currency = meta.code;
    this.minor = minor;
    this.scale = meta.scale;
  }

  static fromMinor(minor: bigint | number, currencyCode: string): Money {
    if (typeof minor === "number") {
      if (!Number.isSafeInteger(minor)) throw new MoneyError("MONEY_MINOR", "minor units must be a safe integer");
      minor = BigInt(minor);
    }
    return new Money(currencyCode, minor);
  }

  /**
   * Parse a decimal string. Digits beyond the currency scale throw unless a
   * rounding mode is given (explicit rounding is a product rule, never implicit).
   */
  static of(amount: string, currencyCode: string, rounding?: RoundingMode): Money {
    const meta = currency(currencyCode);
    const d = parseDec(amount);
    if (losesPrecision(d, meta.scale) && !rounding) {
      throw new MoneyError("MONEY_PRECISION", `${amount} has more fraction digits than ${meta.code} allows (${meta.scale})`);
    }
    return new Money(meta.code, scaleTo(d, meta.scale, rounding ?? "DOWN").m);
  }

  static fromDec(d: Dec, currencyCode: string, rounding: RoundingMode): Money {
    const meta = currency(currencyCode);
    return new Money(meta.code, scaleTo(d, meta.scale, rounding).m);
  }

  static zero(currencyCode: string): Money {
    return new Money(currencyCode, 0n);
  }

  static sum(items: readonly Money[], currencyCode?: string): Money {
    if (items.length === 0) {
      if (!currencyCode) throw new MoneyError("MONEY_EMPTY_SUM", "sum of nothing needs a currency");
      return Money.zero(currencyCode);
    }
    return items.reduce((acc, m) => acc.add(m), Money.zero(currencyCode ?? items[0].currency));
  }

  private same(other: Money): void {
    if (other.currency !== this.currency) {
      throw new MoneyError("MONEY_CURRENCY_MISMATCH", `${this.currency} vs ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.same(other);
    return new Money(this.currency, this.minor + other.minor);
  }

  subtract(other: Money): Money {
    this.same(other);
    return new Money(this.currency, this.minor - other.minor);
  }

  negate(): Money {
    return new Money(this.currency, -this.minor);
  }

  abs(): Money {
    return this.minor < 0n ? this.negate() : this;
  }

  isZero(): boolean {
    return this.minor === 0n;
  }
  isNegative(): boolean {
    return this.minor < 0n;
  }
  isPositive(): boolean {
    return this.minor > 0n;
  }

  compareTo(other: Money): -1 | 0 | 1 {
    this.same(other);
    return this.minor === other.minor ? 0 : this.minor < other.minor ? -1 : 1;
  }

  equals(other: Money): boolean {
    return other.currency === this.currency && other.minor === this.minor;
  }

  /** Multiply by a decimal factor (string) with explicit rounding. */
  multiply(factor: string, rounding: RoundingMode): Money {
    const product = mulDec(this.toDec(), parseDec(factor));
    return Money.fromDec(product, this.currency, rounding);
  }

  /** Divide by a decimal divisor (string) with explicit rounding. */
  divide(divisor: string, rounding: RoundingMode): Money {
    const q = divDec(this.toDec(), parseDec(divisor), this.scale, rounding);
    return new Money(this.currency, q.m);
  }

  /** Percentage of this amount, e.g. percent("1.6") → 1.6 %. */
  percent(percent: string, rounding: RoundingMode): Money {
    const p = mulDec(this.toDec(), parseDec(percent));
    const q = divDec(p, { m: 100n, e: 0 }, this.scale, rounding);
    return new Money(this.currency, q.m);
  }

  /**
   * Deterministic allocation by integer weights (largest remainder method).
   * Invariant: sum(result) === this. Remainder minor units go to the earliest
   * weights with the largest fractional share; ties resolve by index order.
   */
  allocate(weights: readonly (number | bigint)[]): Money[] {
    if (weights.length === 0) throw new MoneyError("MONEY_ALLOC_EMPTY", "no weights");
    const w = weights.map((x) => (typeof x === "bigint" ? x : BigInt(x)));
    if (w.some((x) => x < 0n)) throw new MoneyError("MONEY_ALLOC_NEG", "negative weight");
    const total = w.reduce((a, b) => a + b, 0n);
    if (total === 0n) throw new MoneyError("MONEY_ALLOC_ZERO", "weights sum to zero");
    const sign = this.minor < 0n ? -1n : 1n;
    const abs = this.minor * sign;
    const base = w.map((x) => (abs * x) / total);
    const rem = w.map((x, i) => ({ i, r: (abs * x) % total }));
    let left = abs - base.reduce((a, b) => a + b, 0n);
    rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
    for (const { i } of rem) {
      if (left === 0n) break;
      base[i] += 1n;
      left -= 1n;
    }
    return base.map((x) => new Money(this.currency, x * sign));
  }

  /** Round to the currency's physical cash step (e.g. CHF 0.05). Returns self when no step applies. */
  roundToCash(rounding: RoundingMode = "HALF_UP"): Money {
    const step = currency(this.currency).cashStepMinor;
    if (!step || step <= 1) return this;
    const s = BigInt(step);
    return new Money(this.currency, roundDiv(this.minor, s, rounding) * s);
  }

  toDec(): Dec {
    return { m: this.minor, e: this.scale };
  }

  /** "1234.56" — exact, always with the currency's scale. */
  toDecimalString(): string {
    return decToString(this.toDec());
  }

  /** Locale formatting via Intl, fed with a decimal string (never a float). */
  format(locale = "ja-JP", opts: { style?: "currency" | "decimal"; symbol?: boolean } = {}): string {
    const nf = new Intl.NumberFormat(locale, {
      style: opts.style === "decimal" ? "decimal" : "currency",
      currency: this.currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: this.scale,
      maximumFractionDigits: this.scale,
    });
    // Intl.NumberFormat accepts decimal strings (ES2023 NumberFormat v3).
    return nf.format(this.toDecimalString() as unknown as number);
  }

  toJSON(): MoneyJSON {
    return { currency: this.currency, amount: this.toDecimalString() };
  }

  static fromJSON(j: MoneyJSON): Money {
    return Money.of(j.amount, j.currency);
  }

  toString(): string {
    return `${this.currency} ${this.toDecimalString()}`;
  }

  /** Minor units per major unit (10^scale). */
  static minorPerMajor(currencyCode: string): bigint {
    return pow10(currency(currencyCode).scale);
  }
}

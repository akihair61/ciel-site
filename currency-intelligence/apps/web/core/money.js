import { decToString, divDec, losesPrecision, mulDec, parseDec, pow10, roundDiv, scaleTo, } from "./dec.js";
import { currency } from "./currencies.js";
export class MoneyError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "MoneyError";
        this.code = code;
    }
}
/** Hard cap on magnitude in minor units (10^24). Guards against overflow from bad input. */
export const MAX_MINOR = 10n ** 24n;
/**
 * Immutable money value in integer minor units.
 * Two Money values are only combinable when their currency codes match.
 */
export class Money {
    currency;
    minor;
    scale;
    constructor(currencyCode, minor) {
        const meta = currency(currencyCode);
        if (minor > MAX_MINOR || minor < -MAX_MINOR) {
            throw new MoneyError("MONEY_OVERFLOW", `amount exceeds limit in ${currencyCode}`);
        }
        this.currency = meta.code;
        this.minor = minor;
        this.scale = meta.scale;
    }
    static fromMinor(minor, currencyCode) {
        if (typeof minor === "number") {
            if (!Number.isSafeInteger(minor))
                throw new MoneyError("MONEY_MINOR", "minor units must be a safe integer");
            minor = BigInt(minor);
        }
        return new Money(currencyCode, minor);
    }
    /**
     * Parse a decimal string. Digits beyond the currency scale throw unless a
     * rounding mode is given (explicit rounding is a product rule, never implicit).
     */
    static of(amount, currencyCode, rounding) {
        const meta = currency(currencyCode);
        const d = parseDec(amount);
        if (losesPrecision(d, meta.scale) && !rounding) {
            throw new MoneyError("MONEY_PRECISION", `${amount} has more fraction digits than ${meta.code} allows (${meta.scale})`);
        }
        return new Money(meta.code, scaleTo(d, meta.scale, rounding ?? "DOWN").m);
    }
    static fromDec(d, currencyCode, rounding) {
        const meta = currency(currencyCode);
        return new Money(meta.code, scaleTo(d, meta.scale, rounding).m);
    }
    static zero(currencyCode) {
        return new Money(currencyCode, 0n);
    }
    static sum(items, currencyCode) {
        if (items.length === 0) {
            if (!currencyCode)
                throw new MoneyError("MONEY_EMPTY_SUM", "sum of nothing needs a currency");
            return Money.zero(currencyCode);
        }
        return items.reduce((acc, m) => acc.add(m), Money.zero(currencyCode ?? items[0].currency));
    }
    same(other) {
        if (other.currency !== this.currency) {
            throw new MoneyError("MONEY_CURRENCY_MISMATCH", `${this.currency} vs ${other.currency}`);
        }
    }
    add(other) {
        this.same(other);
        return new Money(this.currency, this.minor + other.minor);
    }
    subtract(other) {
        this.same(other);
        return new Money(this.currency, this.minor - other.minor);
    }
    negate() {
        return new Money(this.currency, -this.minor);
    }
    abs() {
        return this.minor < 0n ? this.negate() : this;
    }
    isZero() {
        return this.minor === 0n;
    }
    isNegative() {
        return this.minor < 0n;
    }
    isPositive() {
        return this.minor > 0n;
    }
    compareTo(other) {
        this.same(other);
        return this.minor === other.minor ? 0 : this.minor < other.minor ? -1 : 1;
    }
    equals(other) {
        return other.currency === this.currency && other.minor === this.minor;
    }
    /** Multiply by a decimal factor (string) with explicit rounding. */
    multiply(factor, rounding) {
        const product = mulDec(this.toDec(), parseDec(factor));
        return Money.fromDec(product, this.currency, rounding);
    }
    /** Divide by a decimal divisor (string) with explicit rounding. */
    divide(divisor, rounding) {
        const q = divDec(this.toDec(), parseDec(divisor), this.scale, rounding);
        return new Money(this.currency, q.m);
    }
    /** Percentage of this amount, e.g. percent("1.6") → 1.6 %. */
    percent(percent, rounding) {
        const p = mulDec(this.toDec(), parseDec(percent));
        const q = divDec(p, { m: 100n, e: 0 }, this.scale, rounding);
        return new Money(this.currency, q.m);
    }
    /**
     * Deterministic allocation by integer weights (largest remainder method).
     * Invariant: sum(result) === this. Remainder minor units go to the earliest
     * weights with the largest fractional share; ties resolve by index order.
     */
    allocate(weights) {
        if (weights.length === 0)
            throw new MoneyError("MONEY_ALLOC_EMPTY", "no weights");
        const w = weights.map((x) => (typeof x === "bigint" ? x : BigInt(x)));
        if (w.some((x) => x < 0n))
            throw new MoneyError("MONEY_ALLOC_NEG", "negative weight");
        const total = w.reduce((a, b) => a + b, 0n);
        if (total === 0n)
            throw new MoneyError("MONEY_ALLOC_ZERO", "weights sum to zero");
        const sign = this.minor < 0n ? -1n : 1n;
        const abs = this.minor * sign;
        const base = w.map((x) => (abs * x) / total);
        const rem = w.map((x, i) => ({ i, r: (abs * x) % total }));
        let left = abs - base.reduce((a, b) => a + b, 0n);
        rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
        for (const { i } of rem) {
            if (left === 0n)
                break;
            base[i] += 1n;
            left -= 1n;
        }
        return base.map((x) => new Money(this.currency, x * sign));
    }
    /** Round to the currency's physical cash step (e.g. CHF 0.05). Returns self when no step applies. */
    roundToCash(rounding = "HALF_UP") {
        const step = currency(this.currency).cashStepMinor;
        if (!step || step <= 1)
            return this;
        const s = BigInt(step);
        return new Money(this.currency, roundDiv(this.minor, s, rounding) * s);
    }
    toDec() {
        return { m: this.minor, e: this.scale };
    }
    /** "1234.56" — exact, always with the currency's scale. */
    toDecimalString() {
        return decToString(this.toDec());
    }
    /** Locale formatting via Intl, fed with a decimal string (never a float). */
    format(locale = "ja-JP", opts = {}) {
        const nf = new Intl.NumberFormat(locale, {
            style: opts.style === "decimal" ? "decimal" : "currency",
            currency: this.currency,
            currencyDisplay: "narrowSymbol",
            minimumFractionDigits: this.scale,
            maximumFractionDigits: this.scale,
        });
        // Intl.NumberFormat accepts decimal strings (ES2023 NumberFormat v3).
        return nf.format(this.toDecimalString());
    }
    toJSON() {
        return { currency: this.currency, amount: this.toDecimalString() };
    }
    static fromJSON(j) {
        return Money.of(j.amount, j.currency);
    }
    toString() {
        return `${this.currency} ${this.toDecimalString()}`;
    }
    /** Minor units per major unit (10^scale). */
    static minorPerMajor(currencyCode) {
        return pow10(currency(currencyCode).scale);
    }
}
//# sourceMappingURL=money.js.map
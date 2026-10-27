export const ROUNDING_MODES = [
    "HALF_UP",
    "HALF_DOWN",
    "HALF_EVEN",
    "UP",
    "DOWN",
    "CEILING",
    "FLOOR",
];
export class DecimalError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "DecimalError";
        this.code = code;
    }
}
const DEC_RE = /^([+-]?)(\d+)(?:\.(\d+))?$/;
/** Parse "1234.5678" (no exponent, no thousands separators). */
export function parseDec(s) {
    if (typeof s !== "string")
        throw new DecimalError("DEC_TYPE", "decimal must be a string");
    const t = s.trim();
    const mt = DEC_RE.exec(t);
    if (!mt)
        throw new DecimalError("DEC_SYNTAX", `invalid decimal: "${s}"`);
    const [, sign, int, frac = ""] = mt;
    const m = BigInt(int + frac) * (sign === "-" ? -1n : 1n);
    return { m, e: frac.length };
}
/** Convert a JS number coming from an API payload into a decimal string without exponent notation. */
export function numberToDecString(n, maxFraction = 12) {
    if (!Number.isFinite(n))
        throw new DecimalError("DEC_NAN", "number is not finite");
    const fixed = n.toFixed(maxFraction);
    return trimZeros(fixed);
}
function trimZeros(s) {
    if (!s.includes("."))
        return s;
    let out = s.replace(/0+$/, "");
    if (out.endsWith("."))
        out = out.slice(0, -1);
    return out === "-0" ? "0" : out;
}
export function pow10(n) {
    if (n < 0)
        throw new DecimalError("DEC_POW", "negative power");
    return 10n ** BigInt(n);
}
/** Integer division n/d with explicit rounding. d must be non-zero. */
export function roundDiv(n, d, mode) {
    if (d === 0n)
        throw new DecimalError("DEC_DIV0", "division by zero");
    if (d < 0n) {
        n = -n;
        d = -d;
    }
    const q = n / d; // truncates toward zero
    const r = n % d;
    if (r === 0n)
        return q;
    const negative = n < 0n;
    const twice = (r < 0n ? -r : r) * 2n;
    const cmpHalf = twice === d ? 0 : twice > d ? 1 : -1;
    const awayFromZero = negative ? q - 1n : q + 1n;
    switch (mode) {
        case "DOWN":
            return q;
        case "UP":
            return awayFromZero;
        case "CEILING":
            return negative ? q : q + 1n;
        case "FLOOR":
            return negative ? q - 1n : q;
        case "HALF_UP":
            return cmpHalf >= 0 ? awayFromZero : q;
        case "HALF_DOWN":
            return cmpHalf > 0 ? awayFromZero : q;
        case "HALF_EVEN":
            if (cmpHalf > 0)
                return awayFromZero;
            if (cmpHalf < 0)
                return q;
            return q % 2n === 0n ? q : awayFromZero;
        default:
            throw new DecimalError("DEC_MODE", `unknown rounding mode ${String(mode)}`);
    }
}
/** Rescale to exactly `e` fraction digits. Rounds when reducing. */
export function scaleTo(d, e, mode) {
    if (e === d.e)
        return d;
    if (e > d.e)
        return { m: d.m * pow10(e - d.e), e };
    return { m: roundDiv(d.m, pow10(d.e - e), mode), e };
}
/** True if rescaling to `e` would lose information. */
export function losesPrecision(d, e) {
    if (e >= d.e)
        return false;
    return d.m % pow10(d.e - e) !== 0n;
}
export function addDec(a, b) {
    const e = Math.max(a.e, b.e);
    return { m: scaleTo(a, e, "DOWN").m + scaleTo(b, e, "DOWN").m, e };
}
export function subDec(a, b) {
    return addDec(a, { m: -b.m, e: b.e });
}
export function mulDec(a, b) {
    return { m: a.m * b.m, e: a.e + b.e };
}
/** a / b with the result scaled to `e` fraction digits. */
export function divDec(a, b, e, mode) {
    if (b.m === 0n)
        throw new DecimalError("DEC_DIV0", "division by zero");
    // a/b = (a.m / b.m) × 10^(b.e - a.e). Want m_res × 10^-e.
    const shift = e + b.e - a.e;
    if (shift >= 0)
        return { m: roundDiv(a.m * pow10(shift), b.m, mode), e };
    return { m: roundDiv(a.m, b.m * pow10(-shift), mode), e };
}
export function cmpDec(a, b) {
    const e = Math.max(a.e, b.e);
    const x = scaleTo(a, e, "DOWN").m;
    const y = scaleTo(b, e, "DOWN").m;
    return x === y ? 0 : x < y ? -1 : 1;
}
export function isZeroDec(d) {
    return d.m === 0n;
}
export function decToString(d) {
    const neg = d.m < 0n;
    let digits = (neg ? -d.m : d.m).toString();
    if (d.e === 0)
        return (neg ? "-" : "") + digits;
    if (digits.length <= d.e)
        digits = digits.padStart(d.e + 1, "0");
    const int = digits.slice(0, digits.length - d.e);
    const frac = digits.slice(digits.length - d.e);
    return (neg && d.m !== 0n ? "-" : "") + int + "." + frac;
}
/** Decimal string with trailing zeros removed (for rates, not for money). */
export function decToShortString(d) {
    return trimZeros(decToString(d));
}
//# sourceMappingURL=dec.js.map
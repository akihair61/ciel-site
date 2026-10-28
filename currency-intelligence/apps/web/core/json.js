export class JsonError extends Error {
    code = "JSON_SYNTAX";
    at;
    constructor(message, at) {
        super(`${message} at ${at}`);
        this.name = "JsonError";
        this.at = at;
    }
}
export function isJsonNumber(v) {
    return typeof v === "object" && v !== null && typeof v.num === "string" && Object.keys(v).length === 1;
}
/** "1.5e3" → "1500", "1.2E-3" → "0.0012", "150.12" unchanged. */
export function normaliseNumberText(t) {
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(t);
    if (!m)
        throw new JsonError(`bad number ${t}`, 0);
    const [, sign, int, frac = "", expS] = m;
    if (!expS)
        return sign + int + (frac ? "." + frac : "");
    const exp = parseInt(expS, 10);
    let digits = int + frac;
    let point = int.length + exp;
    if (point <= 0)
        digits = "0".repeat(-point + 1) + digits, point = 1;
    if (point > digits.length)
        digits = digits + "0".repeat(point - digits.length);
    let out = digits.slice(0, point) + (point < digits.length ? "." + digits.slice(point) : "");
    out = out.replace(/^0+(?=\d)/, "");
    if (out.includes("."))
        out = out.replace(/0+$/, "").replace(/\.$/, "");
    return (sign === "-" && out !== "0" ? "-" : "") + out;
}
export function parseJsonPreservingNumbers(text, opts = {}) {
    const maxBytes = opts.maxBytes ?? 4 * 1024 * 1024;
    const maxDepth = opts.maxDepth ?? 64;
    if (text.length > maxBytes)
        throw new JsonError("input too large", 0);
    let i = 0;
    const ws = () => {
        while (i < text.length && (text[i] === " " || text[i] === "\n" || text[i] === "\r" || text[i] === "\t"))
            i++;
    };
    const expect = (c) => {
        if (text[i] !== c)
            throw new JsonError(`expected ${c}`, i);
        i++;
    };
    const str = () => {
        expect('"');
        let out = "";
        while (i < text.length) {
            const c = text[i++];
            if (c === '"')
                return out;
            if (c === "\\") {
                const e = text[i++];
                if (e === "u") {
                    const hex = text.slice(i, i + 4);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex))
                        throw new JsonError("bad unicode escape", i);
                    out += String.fromCharCode(parseInt(hex, 16));
                    i += 4;
                }
                else {
                    const map = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
                    if (!(e in map))
                        throw new JsonError("bad escape", i);
                    out += map[e];
                }
            }
            else if (c < " ")
                throw new JsonError("control character in string", i);
            else
                out += c;
        }
        throw new JsonError("unterminated string", i);
    };
    const value = (depth) => {
        if (depth > maxDepth)
            throw new JsonError("too deep", i);
        ws();
        const c = text[i];
        if (c === "{") {
            i++;
            const obj = {};
            ws();
            if (text[i] === "}") {
                i++;
                return obj;
            }
            for (;;) {
                ws();
                const k = str();
                ws();
                expect(":");
                const v = value(depth + 1);
                if (k === "__proto__")
                    Object.defineProperty(obj, k, { value: v, enumerable: true, configurable: true, writable: true });
                else
                    obj[k] = v;
                ws();
                if (text[i] === ",") {
                    i++;
                    continue;
                }
                expect("}");
                return obj;
            }
        }
        if (c === "[") {
            i++;
            const arr = [];
            ws();
            if (text[i] === "]") {
                i++;
                return arr;
            }
            for (;;) {
                arr.push(value(depth + 1));
                ws();
                if (text[i] === ",") {
                    i++;
                    continue;
                }
                expect("]");
                return arr;
            }
        }
        if (c === '"')
            return str();
        if (text.startsWith("true", i))
            return (i += 4), true;
        if (text.startsWith("false", i))
            return (i += 5), false;
        if (text.startsWith("null", i))
            return (i += 4), null;
        const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
        if (!m)
            throw new JsonError("unexpected token", i);
        i += m[0].length;
        return { num: normaliseNumberText(m[0]) };
    };
    const v = value(0);
    ws();
    if (i !== text.length)
        throw new JsonError("trailing characters", i);
    return v;
}
/** Convenience: get a decimal string from a JsonValue that should be a number (JSON number or numeric string). */
export function numText(v) {
    if (isJsonNumber(v))
        return v.num;
    if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))
        return v;
    return null;
}
export function asObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v) && !isJsonNumber(v) ? v : null;
}
//# sourceMappingURL=json.js.map
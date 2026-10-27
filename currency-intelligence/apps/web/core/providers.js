import { numberToDecString } from "./dec.js";
import { isKnownCurrency } from "./currencies.js";
import { RateError, validateQuote } from "./rates.js";
/** Deterministic provider for tests and offline demos. */
export class MockRateProvider {
    id = "mock";
    description = "固定の参考レート(テスト/デモ用)";
    granularity = "daily";
    table; // quote currency → rate per 1 base
    base;
    observedAt;
    constructor(table, base, observedAt) {
        this.table = table;
        this.base = base;
        this.observedAt = observedAt;
    }
    async fetchLatest(base, symbols, opts) {
        if (base !== this.base)
            throw new RateError("PROVIDER_BASE", `mock only serves base ${this.base}`);
        const now = (opts?.now ?? new Date()).toISOString();
        return symbols
            .filter((s) => s !== base && this.table[s])
            .map((s) => validateQuote({
            quoteId: `mock:${base}${s}:${this.observedAt}`,
            base,
            quote: s,
            rate: this.table[s],
            source: this.id,
            observedAt: this.observedAt,
            receivedAt: now,
            rateKind: "indicative",
            confidence: "estimated",
            granularity: "daily",
        }));
    }
}
/**
 * Frankfurter (ECB reference rates, published once per working day).
 * These are reference rates, never tradable or "live". Terms, SLA and
 * commercial use are listed as 要検証 in docs/TECH_VALIDATION.md.
 */
export class FrankfurterProvider {
    id = "frankfurter";
    description = "ECB参考レート(1営業日1回更新、取引レートではありません)";
    granularity = "daily";
    baseUrl;
    deps;
    constructor(deps) {
        this.deps = deps;
        this.baseUrl = deps.baseUrl ?? "https://api.frankfurter.app";
    }
    async fetchLatest(base, symbols, opts) {
        const to = symbols.filter((s) => s !== base).join(",");
        const url = `${this.baseUrl}/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(to)}`;
        const res = await this.deps.fetch(url, { signal: opts?.signal });
        if (!res.ok)
            throw new RateError("PROVIDER_HTTP", `${this.id} HTTP ${res.status}`);
        const j = (await res.json());
        if (!j || typeof j !== "object" || !j.rates || j.base !== base)
            throw new RateError("PROVIDER_SHAPE", `${this.id}: unexpected payload`);
        const now = (opts?.now ?? new Date()).toISOString();
        // ECB publishes around 16:00 CET; the API exposes only the date. We record the date at 00:00Z and say so.
        const observedAt = `${j.date}T00:00:00Z`;
        return Object.entries(j.rates)
            .filter(([q]) => isKnownCurrency(q))
            .map(([q, r]) => validateQuote({
            quoteId: `${this.id}:${base}${q}:${j.date}`,
            base,
            quote: q,
            rate: numberToDecString(r),
            source: this.id,
            observedAt,
            receivedAt: now,
            rateKind: "indicative",
            confidence: "estimated",
            granularity: "daily",
            notes: ["ECB reference rate; publication time not exposed by API, dated at 00:00Z"],
        }));
    }
}
/**
 * open.er-api.com (ExchangeRate-API open endpoint). Daily, attribution required,
 * no SLA. Commercial terms are 要検証 in docs/TECH_VALIDATION.md.
 */
export class OpenErApiProvider {
    id = "open-er-api";
    description = "ExchangeRate-API 参考レート(1日1回更新、出典表示が必要)";
    granularity = "daily";
    baseUrl;
    deps;
    constructor(deps) {
        this.deps = deps;
        this.baseUrl = deps.baseUrl ?? "https://open.er-api.com/v6";
    }
    async fetchLatest(base, symbols, opts) {
        const res = await this.deps.fetch(`${this.baseUrl}/latest/${encodeURIComponent(base)}`, { signal: opts?.signal });
        if (!res.ok)
            throw new RateError("PROVIDER_HTTP", `${this.id} HTTP ${res.status}`);
        const j = (await res.json());
        if (!j || j.result !== "success" || j.base_code !== base || !j.rates)
            throw new RateError("PROVIDER_SHAPE", `${this.id}: unexpected payload`);
        const now = (opts?.now ?? new Date()).toISOString();
        const observedAt = new Date(j.time_last_update_unix * 1000).toISOString();
        const expiresAt = j.time_next_update_unix ? new Date(j.time_next_update_unix * 1000).toISOString() : undefined;
        const want = new Set(symbols);
        return Object.entries(j.rates)
            .filter(([q]) => q !== base && want.has(q) && isKnownCurrency(q))
            .map(([q, r]) => validateQuote({
            quoteId: `${this.id}:${base}${q}:${j.time_last_update_unix}`,
            base,
            quote: q,
            rate: numberToDecString(r),
            source: this.id,
            observedAt,
            receivedAt: now,
            expiresAt,
            rateKind: "indicative",
            confidence: "estimated",
            granularity: "daily",
        }));
    }
}
//# sourceMappingURL=providers.js.map
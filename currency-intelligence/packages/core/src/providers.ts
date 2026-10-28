import { asObject, numText, parseJsonPreservingNumbers, type JsonValue, JsonError } from "./json.ts";
import { isKnownCurrency } from "./currencies.ts";
import { type RateQuote, RateError, validateQuote } from "./rates.ts";

/**
 * Minimal fetch shape. Providers read the body with text() and parse it with
 * parseJsonPreservingNumbers so rates never pass through a JS double (Q-01).
 */
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Max accepted body size per provider response. */
export const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

async function readJson(id: string, res: { text(): Promise<string> }): Promise<{ [k: string]: JsonValue }> {
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    throw new RateError("PROVIDER_BODY", `${id}: could not read body: ${(e as Error).message}`);
  }
  let v: JsonValue;
  try {
    v = parseJsonPreservingNumbers(text, { maxBytes: MAX_PAYLOAD_BYTES });
  } catch (e) {
    throw new RateError("PROVIDER_JSON", `${id}: ${e instanceof JsonError ? e.message : "invalid JSON"}`);
  }
  const obj = asObject(v);
  if (!obj) throw new RateError("PROVIDER_SHAPE", `${id}: payload is not an object`);
  return obj;
}

/** Iterate a rates object, yielding [currency, decimalText] for entries that are numeric. Non-numeric entries are skipped. */
function rateEntries(rates: JsonValue | undefined): Array<[string, string]> {
  const obj = asObject(rates);
  if (!obj) return [];
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const t = numText(v);
    if (t !== null) out.push([k, t]);
  }
  return out;
}

export interface RateProvider {
  readonly id: string;
  /** Human-readable description of what the numbers mean. Shown in the UI next to the rate. */
  readonly description: string;
  readonly granularity: "live" | "intraday" | "daily";
  fetchLatest(base: string, symbols: readonly string[], opts?: { signal?: AbortSignal; now?: Date }): Promise<RateQuote[]>;
}

export interface ProviderDeps {
  readonly fetch: FetchLike;
  readonly baseUrl?: string;
}

/** Deterministic provider for tests and offline demos. */
export class MockRateProvider implements RateProvider {
  readonly id = "mock";
  readonly description = "固定の参考レート(テスト/デモ用)";
  readonly granularity = "daily" as const;
  private readonly table: Readonly<Record<string, string>>; // quote currency → rate per 1 base
  private readonly base: string;
  private readonly observedAt: string;
  constructor(table: Readonly<Record<string, string>>, base: string, observedAt: string) {
    this.table = table;
    this.base = base;
    this.observedAt = observedAt;
  }
  async fetchLatest(base: string, symbols: readonly string[], opts?: { now?: Date }): Promise<RateQuote[]> {
    if (base !== this.base) throw new RateError("PROVIDER_BASE", `mock only serves base ${this.base}`);
    const now = (opts?.now ?? new Date()).toISOString();
    return symbols
      .filter((s) => s !== base && this.table[s])
      .map((s) =>
        validateQuote({
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
        }),
      );
  }
}

/**
 * Frankfurter (ECB reference rates, published once per working day).
 * These are reference rates, never tradable or "live". Terms, SLA and
 * commercial use are listed as 要検証 in docs/TECH_VALIDATION.md.
 */
export class FrankfurterProvider implements RateProvider {
  readonly id = "frankfurter";
  readonly description = "ECB参考レート(1営業日1回更新、取引レートではありません)";
  readonly granularity = "daily" as const;
  private readonly baseUrl: string;
  private readonly deps: ProviderDeps;
  constructor(deps: ProviderDeps) {
    this.deps = deps;
    this.baseUrl = deps.baseUrl ?? "https://api.frankfurter.app";
  }
  async fetchLatest(base: string, symbols: readonly string[], opts?: { signal?: AbortSignal; now?: Date }): Promise<RateQuote[]> {
    const to = symbols.filter((s) => s !== base).join(",");
    const url = `${this.baseUrl}/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(to)}`;
    const res = await this.deps.fetch(url, { signal: opts?.signal });
    if (!res.ok) throw new RateError("PROVIDER_HTTP", `${this.id} HTTP ${res.status}`);
    const j = await readJson(this.id, res);
    const date = typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null;
    if (j.base !== base || !asObject(j.rates) || !date) throw new RateError("PROVIDER_SHAPE", `${this.id}: unexpected payload`);
    const now = (opts?.now ?? new Date()).toISOString();
    // ECB publishes around 16:00 CET; the API exposes only the date. We record the date at 00:00Z and say so.
    const observedAt = `${date}T00:00:00Z`;
    return rateEntries(j.rates)
      .filter(([q]) => q !== base && isKnownCurrency(q))
      .map(([q, r]) =>
        validateQuote({
          quoteId: `${this.id}:${base}${q}:${date}`,
          base,
          quote: q,
          rate: r,
          source: this.id,
          observedAt,
          receivedAt: now,
          rateKind: "indicative",
          confidence: "estimated",
          granularity: "daily",
          notes: ["ECB reference rate; publication time not exposed by API, dated at 00:00Z"],
        }),
      );
  }
}

/**
 * open.er-api.com (ExchangeRate-API open endpoint). Daily, attribution required,
 * no SLA. Commercial terms are 要検証 in docs/TECH_VALIDATION.md.
 */
export class OpenErApiProvider implements RateProvider {
  readonly id = "open-er-api";
  readonly description = "ExchangeRate-API 参考レート(1日1回更新、出典表示が必要)";
  readonly granularity = "daily" as const;
  private readonly baseUrl: string;
  private readonly deps: ProviderDeps;
  constructor(deps: ProviderDeps) {
    this.deps = deps;
    this.baseUrl = deps.baseUrl ?? "https://open.er-api.com/v6";
  }
  async fetchLatest(base: string, symbols: readonly string[], opts?: { signal?: AbortSignal; now?: Date }): Promise<RateQuote[]> {
    const res = await this.deps.fetch(`${this.baseUrl}/latest/${encodeURIComponent(base)}`, { signal: opts?.signal });
    if (!res.ok) throw new RateError("PROVIDER_HTTP", `${this.id} HTTP ${res.status}`);
    const j = await readJson(this.id, res);
    const lastUnix = numText(j.time_last_update_unix);
    const nextUnix = numText(j.time_next_update_unix);
    if (j.result !== "success" || j.base_code !== base || !asObject(j.rates) || lastUnix === null || !/^\d+$/.test(lastUnix)) {
      throw new RateError("PROVIDER_SHAPE", `${this.id}: unexpected payload`);
    }
    const now = (opts?.now ?? new Date()).toISOString();
    const observedAt = new Date(Number(lastUnix) * 1000).toISOString();
    const expiresAt = nextUnix !== null && /^\d+$/.test(nextUnix) ? new Date(Number(nextUnix) * 1000).toISOString() : undefined;
    const want = new Set(symbols);
    return rateEntries(j.rates)
      .filter(([q]) => q !== base && want.has(q) && isKnownCurrency(q))
      .map(([q, r]) =>
        validateQuote({
          quoteId: `${this.id}:${base}${q}:${lastUnix}`,
          base,
          quote: q,
          rate: r,
          source: this.id,
          observedAt,
          receivedAt: now,
          expiresAt,
          rateKind: "indicative",
          confidence: "estimated",
          granularity: "daily",
        }),
      );
  }
}

/**
 * Coinbase public exchange-rates endpoint (no key, CORS enabled). Fiat rates
 * refresh every few minutes. The payload carries NO observation timestamp, so
 * observedAt is null and the UI must say "取得N秒前・観測時刻不明", never "Live"
 * (spec 02 Q-02, ADR-0003). Still an indicative rate, not a tradable quote;
 * terms are 要検証 in docs/TECH_VALIDATION.md.
 */
export class CoinbaseProvider implements RateProvider {
  readonly id = "coinbase";
  readonly description = "Coinbase exchange rates (refreshed every few minutes, indicative; no observation time published)";
  readonly granularity = "intraday" as const;
  private readonly baseUrl: string;
  private readonly deps: ProviderDeps;
  constructor(deps: ProviderDeps) {
    this.deps = deps;
    this.baseUrl = deps.baseUrl ?? "https://api.coinbase.com/v2";
  }
  async fetchLatest(base: string, symbols: readonly string[], opts?: { signal?: AbortSignal; now?: Date }): Promise<RateQuote[]> {
    const res = await this.deps.fetch(`${this.baseUrl}/exchange-rates?currency=${encodeURIComponent(base)}`, { signal: opts?.signal });
    if (!res.ok) throw new RateError("PROVIDER_HTTP", `${this.id} HTTP ${res.status}`);
    const j = await readJson(this.id, res);
    const data = asObject(j.data);
    if (!data || data.currency !== base || !asObject(data.rates)) throw new RateError("PROVIDER_SHAPE", `${this.id}: unexpected payload`);
    const now = (opts?.now ?? new Date()).toISOString();
    const want = new Set(symbols);
    return rateEntries(data.rates)
      .filter(([q]) => q !== base && want.has(q) && isKnownCurrency(q))
      .map(([q, r]) =>
        validateQuote({
          quoteId: `${this.id}:${base}${q}:${now}`,
          base,
          quote: q,
          rate: r,
          source: this.id,
          observedAt: null, // the endpoint carries no timestamp; do not pretend receivedAt is one
          receivedAt: now,
          rateKind: "indicative",
          confidence: "estimated",
          granularity: "intraday",
          notes: ["Coinbase does not publish an observation time; age is measured from receivedAt"],
        }),
      );
  }
}

import { type RateProvider } from "./providers.ts";
import { type RateQuote, type Staleness, staleness } from "./rates.ts";

export interface RateStore {
  get(key: string): Promise<RateQuote[] | undefined>;
  set(key: string, quotes: RateQuote[]): Promise<void>;
}

export class MemoryRateStore implements RateStore {
  private readonly m = new Map<string, RateQuote[]>();
  async get(key: string) {
    return this.m.get(key);
  }
  async set(key: string, quotes: RateQuote[]) {
    this.m.set(key, quotes);
  }
}

export interface ResolvedRates {
  readonly quotes: readonly RateQuote[];
  /** fresh: within TTL. stale: served from cache past TTL (revalidation started). offline: fetch failed, cache served. */
  readonly status: Staleness | "offline";
  readonly ageMs: number;
  readonly source: string;
  /** Present when a background refresh was started; resolves to the new quotes or null on failure. */
  readonly revalidation: Promise<RateQuote[] | null> | null;
  readonly error?: string;
}

export interface RateCacheOptions {
  readonly ttlMs: number;
  readonly store?: RateStore;
  readonly now?: () => Date;
}

/**
 * stale-while-revalidate around a RateProvider.
 * - cache hit & fresh    → return, no network
 * - cache hit & stale    → return immediately with status "stale" and refresh in background
 * - cache miss           → await provider; on failure throw
 * - fetch failure w/ cache → return cache with status "offline"
 */
export class RateCache {
  private readonly store: RateStore;
  private readonly now: () => Date;
  private inflight = new Map<string, Promise<RateQuote[] | null>>();
  private readonly provider: RateProvider;
  private readonly opts: RateCacheOptions;
  constructor(provider: RateProvider, opts: RateCacheOptions) {
    this.provider = provider;
    this.opts = opts;
    this.store = opts.store ?? new MemoryRateStore();
    this.now = opts.now ?? (() => new Date());
  }

  private key(base: string, symbols: readonly string[]): string {
    return `${this.provider.id}|${base}|${[...symbols].sort().join(",")}`;
  }

  private refresh(key: string, base: string, symbols: readonly string[]): Promise<RateQuote[] | null> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = this.provider
      .fetchLatest(base, symbols, { now: this.now() })
      .then(async (q) => {
        await this.store.set(key, q);
        return q;
      })
      .catch(() => null)
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  async resolve(base: string, symbols: readonly string[]): Promise<ResolvedRates> {
    const key = this.key(base, symbols);
    const cached = await this.store.get(key);
    const nowMs = this.now().getTime();
    if (cached && cached.length) {
      const oldest = cached.map((q) => staleness(q, nowMs, this.opts.ttlMs)).sort((a, b) => b.ageMs - a.ageMs)[0];
      if (oldest.status === "fresh") {
        return { quotes: cached, status: "fresh", ageMs: oldest.ageMs, source: this.provider.id, revalidation: null };
      }
      return { quotes: cached, status: oldest.status, ageMs: oldest.ageMs, source: this.provider.id, revalidation: this.refresh(key, base, symbols) };
    }
    try {
      const fresh = await this.provider.fetchLatest(base, symbols, { now: this.now() });
      await this.store.set(key, fresh);
      const age = fresh.length ? Math.max(...fresh.map((q) => staleness(q, nowMs, this.opts.ttlMs).ageMs)) : 0;
      return { quotes: fresh, status: age <= this.opts.ttlMs ? "fresh" : "stale", ageMs: age, source: this.provider.id, revalidation: null };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (cached) return { quotes: cached, status: "offline", ageMs: 0, source: this.provider.id, revalidation: null, error: err };
      throw e;
    }
  }
}

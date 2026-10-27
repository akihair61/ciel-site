import {} from "./providers.js";
import { staleness } from "./rates.js";
export class MemoryRateStore {
    m = new Map();
    async get(key) {
        return this.m.get(key);
    }
    async set(key, quotes) {
        this.m.set(key, quotes);
    }
}
/**
 * stale-while-revalidate around a RateProvider.
 * - cache hit & fresh    → return, no network
 * - cache hit & stale    → return immediately with status "stale" and refresh in background
 * - cache miss           → await provider; on failure throw
 * - fetch failure w/ cache → return cache with status "offline"
 */
export class RateCache {
    store;
    now;
    inflight = new Map();
    provider;
    opts;
    constructor(provider, opts) {
        this.provider = provider;
        this.opts = opts;
        this.store = opts.store ?? new MemoryRateStore();
        this.now = opts.now ?? (() => new Date());
    }
    key(base, symbols) {
        return `${this.provider.id}|${base}|${[...symbols].sort().join(",")}`;
    }
    refresh(key, base, symbols) {
        const existing = this.inflight.get(key);
        if (existing)
            return existing;
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
    async resolve(base, symbols) {
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
        }
        catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            if (cached)
                return { quotes: cached, status: "offline", ageMs: 0, source: this.provider.id, revalidation: null, error: err };
            throw e;
        }
    }
}
//# sourceMappingURL=cache.js.map
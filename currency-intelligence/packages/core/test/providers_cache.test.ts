import { test } from "node:test";
import assert from "node:assert/strict";
import { FrankfurterProvider, MockRateProvider, OpenErApiProvider, type FetchLike } from "../src/providers.ts";
import { RateCache } from "../src/cache.ts";

const fakeFetch = (payload: unknown, ok = true, status = 200): FetchLike => async () => ({ ok, status, text: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)) });

test("FrankfurterProvider maps payload to indicative daily quotes", async () => {
  const p = new FrankfurterProvider({
    fetch: fakeFetch({ amount: 1, base: "JPY", date: "2026-10-27", rates: { THB: 0.22333, USD: 0.0066667, XYZ: 1 } }),
  });
  const quotes = await p.fetchLatest("JPY", ["THB", "USD"], { now: new Date("2026-10-27T12:00:00Z") });
  assert.equal(quotes.length, 2); // XYZ unknown is dropped
  const thb = quotes.find((q) => q.quote === "THB")!;
  assert.equal(thb.rate, "0.22333");
  assert.equal(thb.rateKind, "indicative");
  assert.equal(thb.confidence, "estimated");
  assert.equal(thb.observedAt, "2026-10-27T00:00:00Z");
  assert.equal(thb.granularity, "daily");
});

test("OpenErApiProvider maps payload incl. expiry", async () => {
  const p = new OpenErApiProvider({
    fetch: fakeFetch({ result: "success", time_last_update_unix: 1793059200, time_next_update_unix: 1793145600, base_code: "USD", rates: { JPY: 150.12, THB: 33.5, USD: 1 } }),
  });
  const quotes = await p.fetchLatest("USD", ["JPY", "THB"]);
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0].expiresAt, new Date(1793145600 * 1000).toISOString());
  await assert.rejects(new OpenErApiProvider({ fetch: fakeFetch({ result: "error" }) }).fetchLatest("USD", ["JPY"]));
  await assert.rejects(new OpenErApiProvider({ fetch: fakeFetch({}, false, 503) }).fetchLatest("USD", ["JPY"]));
});

test("RateCache: fresh hit, stale-while-revalidate, offline fallback", async () => {
  let clock = Date.parse("2026-10-27T10:00:00Z");
  const now = () => new Date(clock);
  let calls = 0;
  let fail = false;
  const provider = {
    id: "p",
    description: "",
    granularity: "daily" as const,
    async fetchLatest(base: string, symbols: readonly string[]) {
      calls++;
      if (fail) throw new Error("network down");
      return new MockRateProvider({ THB: "0.223" }, "JPY", new Date(clock).toISOString()).fetchLatest(base, symbols, { now: now() });
    },
  };
  const cache = new RateCache(provider, { ttlMs: 60 * 60 * 1000, now });

  const first = await cache.resolve("JPY", ["THB"]);
  assert.equal(first.status, "fresh");
  assert.equal(calls, 1);

  const second = await cache.resolve("JPY", ["THB"]);
  assert.equal(second.status, "fresh");
  assert.equal(calls, 1); // served from cache

  clock += 2 * 60 * 60 * 1000;
  const third = await cache.resolve("JPY", ["THB"]);
  assert.equal(third.status, "stale");
  assert.ok(third.ageMs >= 2 * 60 * 60 * 1000);
  assert.ok(third.revalidation);
  const refreshed = await third.revalidation;
  assert.equal(refreshed?.length, 1);
  assert.equal(calls, 2);

  const fourth = await cache.resolve("JPY", ["THB"]);
  assert.equal(fourth.status, "fresh"); // refreshed in background

  clock += 3 * 60 * 60 * 1000;
  fail = true;
  const fifth = await cache.resolve("JPY", ["THB"]);
  assert.equal(fifth.status, "stale");
  assert.equal(await fifth.revalidation, null); // refresh failed quietly, cache kept

  const empty = new RateCache(provider, { ttlMs: 1000, now });
  await assert.rejects(empty.resolve("JPY", ["THB"])); // no cache and network down → error surfaces
});

test("CoinbaseProvider maps the exchange-rates payload to intraday quotes", async () => {
  const { CoinbaseProvider } = await import("../src/providers.ts");
  const p = new CoinbaseProvider({ fetch: fakeFetch({ data: { currency: "USD", rates: { JPY: "150.23", THB: "33.41", BTC: "0.0000142", XYZ: "1" } } }) });
  const quotes = await p.fetchLatest("USD", ["JPY", "THB", "BTC"], { now: new Date("2026-10-28T03:00:00Z") });
  assert.equal(quotes.length, 2); // BTC is not a known fiat currency here, XYZ not requested
  const jpy = quotes.find((q) => q.quote === "JPY")!;
  assert.equal(jpy.rate, "150.23");
  assert.equal(jpy.granularity, "intraday");
  assert.equal(jpy.observedAt, null); // Coinbase publishes no observation time
  assert.equal(jpy.receivedAt, "2026-10-28T03:00:00.000Z");
  await assert.rejects(new CoinbaseProvider({ fetch: fakeFetch({ data: { currency: "EUR", rates: {} } }) }).fetchLatest("USD", ["JPY"]));
});

test("providers keep full decimal precision from the wire (Q-01)", async () => {
  const raw = '{"amount":1,"base":"USD","date":"2026-10-28","rates":{"JPY":150.123456789012345678,"THB":33.5}}';
  const [jpy] = await new FrankfurterProvider({ fetch: fakeFetch(raw) }).fetchLatest("USD", ["JPY"]);
  assert.equal(jpy.rate, "150.123456789012345678");
  assert.notEqual(String(JSON.parse(raw).rates.JPY), jpy.rate); // JSON.parse would have lost digits
  const cb = '{"data":{"currency":"USD","rates":{"JPY":"150.000000000000000001","VND":"25410.5"}}}';
  const { CoinbaseProvider } = await import("../src/providers.ts");
  const q = await new CoinbaseProvider({ fetch: fakeFetch(cb) }).fetchLatest("USD", ["JPY", "VND"]);
  assert.equal(q.find((x) => x.quote === "JPY")!.rate, "150.000000000000000001");
  // malformed bodies surface as RateError, not as a thrown SyntaxError
  await assert.rejects(new FrankfurterProvider({ fetch: fakeFetch("{not json") }).fetchLatest("USD", ["JPY"]), /PROVIDER_JSON|invalid JSON|expected|unexpected/);
});

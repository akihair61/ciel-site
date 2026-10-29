// Runs on GitHub Actions (which has outbound internet; the authoring container does not).
// 1. Calls the real rate APIs through the same provider code the app uses and records what came back.
// 2. Fetches the ISO 4217 "list one" and compares minor-unit digits with packages/core/src/currencies.ts.
// Output: docs/ci/live-check.md + docs/ci/live-check.json (committed back to the branch by the workflow).
import { writeFileSync, mkdirSync } from "node:fs";
import { CoinbaseProvider, OpenErApiProvider, FrankfurterProvider, CURRENCIES, cross, convert, Money } from "../packages/core/src/index.ts";

const out = { ranAt: new Date().toISOString(), providers: {}, history: null, iso4217: null };
const md = [`# Live check (GitHub Actions, ${out.ranAt})`, "", "Real API responses parsed by the app's own provider code (no mocks). Re-run by pushing to the branch.", ""];
const fetchLike = async (url, init) => { const r = await fetch(url, init); return { ok: r.ok, status: r.status, text: () => r.text() }; };
const symbols = [...CURRENCIES.keys()].filter((c) => c !== "USD");

for (const [name, p] of [["coinbase", new CoinbaseProvider({ fetch: fetchLike })], ["open-er-api", new OpenErApiProvider({ fetch: fetchLike })], ["frankfurter", new FrankfurterProvider({ fetch: fetchLike })]]) {
  const t0 = Date.now();
  try {
    const q = await p.fetchLatest("USD", symbols);
    const jpy = q.find((x) => x.quote === "JPY"), thb = q.find((x) => x.quote === "THB");
    const x = jpy && thb ? cross(jpy, thb, { toleranceMs: 36 * 3600e3 }) : null;
    const conv = x ? convert(Money.of("1000", "JPY"), x, { rounding: "HALF_EVEN" }).convertedAmount.toDecimalString() : null;
    out.providers[name] = { ok: true, ms: Date.now() - t0, quotes: q.length, missing: symbols.filter((s) => !q.some((x) => x.quote === s)), sample: { jpy, thb }, crossJPYTHB: x && { rate: x.rate, confidence: x.confidence, observedAt: x.observedAt, notes: x.notes }, convert1000JPY: conv };
    md.push(`## ${name}`, "", `- OK in ${Date.now() - t0} ms · ${q.length} quotes · missing: ${out.providers[name].missing.join(", ") || "none"}`,
      `- USD→JPY ${jpy?.rate} (observedAt ${jpy?.observedAt ?? "null (not published)"}, receivedAt ${jpy?.receivedAt}, kind ${jpy?.rateKind}, ${jpy?.confidence})`,
      `- USD→THB ${thb?.rate}`, `- JPY→THB cross ${x?.rate} (${x?.confidence}) → 1000 JPY = ${conv} THB`, "");
  } catch (e) {
    out.providers[name] = { ok: false, ms: Date.now() - t0, error: String(e?.message || e) };
    md.push(`## ${name}`, "", `- FAILED: ${out.providers[name].error}`, "");
  }
}

// Frankfurter daily history (the shape apps/web/app.js loadSeries() relies on)
try {
  const end = new Date(), start = new Date(end.getTime() - 30 * 864e5); const d = (x) => x.toISOString().slice(0, 10);
  const r = await fetch(`https://api.frankfurter.app/${d(start)}..${d(end)}?from=JPY&to=THB`);
  const j = await r.json();
  const dates = Object.keys(j.rates || {}).sort();
  out.history = { ok: r.ok, points: dates.length, first: dates[0], last: dates[dates.length - 1], sample: j.rates?.[dates[dates.length - 1]] };
  md.push("## frankfurter history (30 days JPY→THB)", "", `- ${dates.length} daily points from ${dates[0]} to ${dates[dates.length - 1]} (working days only) · last: ${JSON.stringify(out.history.sample)}`, "");
} catch (e) { out.history = { ok: false, error: String(e) }; md.push("## frankfurter history", "", `- FAILED: ${e}`, ""); }

// ISO 4217 list one vs currencies.ts (BLOCKERS B-07)
try {
  const r = await fetch("https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml");
  const xml = await r.text();
  const iso = new Map();
  for (const m of xml.matchAll(/<CcyNtry>([\s\S]*?)<\/CcyNtry>/g)) {
    const code = /<Ccy>(\w{3})<\/Ccy>/.exec(m[1])?.[1]; const mu = /<CcyMnrUnts>([^<]+)<\/CcyMnrUnts>/.exec(m[1])?.[1];
    if (code && mu && /^\d+$/.test(mu)) iso.set(code, Number(mu));
  }
  const mismatches = [], unknown = [];
  for (const [code, meta] of CURRENCIES) { if (!iso.has(code)) unknown.push(code); else if (iso.get(code) !== meta.scale) mismatches.push(`${code}: app ${meta.scale} vs ISO ${iso.get(code)}`); }
  out.iso4217 = { ok: r.ok, isoEntries: iso.size, checked: CURRENCIES.size, mismatches, unknown };
  md.push("## ISO 4217 list one vs currencies.ts", "", `- ${iso.size} ISO entries · ${CURRENCIES.size} app currencies checked · mismatches: ${mismatches.length ? mismatches.join("; ") : "none"} · not in ISO list: ${unknown.join(", ") || "none"}`, "");
} catch (e) { out.iso4217 = { ok: false, error: String(e) }; md.push("## ISO 4217", "", `- FAILED: ${e}`, ""); }

mkdirSync(new URL("../docs/ci/", import.meta.url), { recursive: true });
writeFileSync(new URL("../docs/ci/live-check.json", import.meta.url), JSON.stringify(out, null, 2));
writeFileSync(new URL("../docs/ci/live-check.md", import.meta.url), md.join("\n"));
console.log(md.join("\n"));
const failed = Object.values(out.providers).filter((p) => !p.ok).length;
process.exit(failed === 3 ? 1 : 0); // one provider down is a stale/fallback case the app handles; all three down means the check itself failed

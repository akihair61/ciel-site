// Currency Intelligence — web client. Money math lives in ./core (packages/core); this file renders and animates.
import {
  Money, MoneyError, CURRENCIES, currency, convert, invert, cross, realizedRate, spreadPercent,
  parseDec, RateCache, OpenErApiProvider, FrankfurterProvider, CoinbaseProvider, splitEqual, splitByWeight, settle,
} from "./core/index.js";

const SCHEMA_VERSION = 4;
const STORE_KEY = "ci.v4";
const BACKUP_KEY = "ci.v4.bak"; // previous good copy, written just before every save
const LEGACY_KEYS = ["ci.v3"]; // read once for migration; never deleted (user data)
const TTL_MS = 6 * 60 * 60 * 1000;
const CROSS_TOLERANCE_MS = 36 * 60 * 60 * 1000;
const PIVOT = "USD";
const ROUNDING = "HALF_EVEN";
const PERIOD_DAYS = { "1D": 1, "1W": 7, "1M": 30, "3M": 91, "1Y": 365 };
const LIVE_POLL_MS = 60_000;
let SERIES_DAYS = 30;
// Motion: the OS "Reduce Motion" setting is honoured by default (spec 02 Q-03, ADR-0003). The user can override it in Settings
// (S.motion = "auto" | "on" | "off"). When reduced, every sequence collapses to its final state in one short step.
const motionMq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener() {} };
const reduced = () => S.motion === "off" || (S.motion !== "on" && motionMq.matches);
function applyMotion() { document.body.classList.toggle("reduced", reduced()); }

const FLAG_CC = { JPY:"JP", THB:"TH", USD:"US", EUR:"EU", GBP:"GB", KRW:"KR", TWD:"TW", CNY:"CN", HKD:"HK", SGD:"SG", MYR:"MY", IDR:"ID", PHP:"PH", VND:"VN", LAK:"LA", KHR:"KH", MMK:"MM", INR:"IN", AUD:"AU", NZD:"NZ", CAD:"CA", CHF:"CH", SEK:"SE", NOK:"NO", DKK:"DK", CZK:"CZ", PLN:"PL", HUF:"HU", ISK:"IS", TRY:"TR", AED:"AE", SAR:"SA", KWD:"KW", BHD:"BH", OMR:"OM", JOD:"JO", MXN:"MX", BRL:"BR", CLP:"CL", ZAR:"ZA", EGP:"EG", LKR:"LK", NPR:"NP" };
const flag = (code) => { const cc = FLAG_CC[code]; return cc ? [...cc].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("") : "¤"; };
const CARD_GRAD = { JPY:"linear-gradient(135deg,#E8505B,#8E2B5A)", THB:"linear-gradient(135deg,#3F7BFF,#1D3FB8)", USD:"linear-gradient(135deg,#2E9E6B,#114D3C)", EUR:"linear-gradient(135deg,#4C6FFF,#2A2F8F)", KRW:"linear-gradient(135deg,#6B7CFF,#3B2A8F)", TWD:"linear-gradient(135deg,#1FA5B8,#154E78)", VND:"linear-gradient(135deg,#E0433C,#7A1E1E)", GBP:"linear-gradient(135deg,#5B5BD6,#1E1E5A)", AUD:"linear-gradient(135deg,#F2A541,#B8541E)", SGD:"linear-gradient(135deg,#E64C4C,#5A1E2E)" };
const COLOUR_GRAD = { navy:"linear-gradient(135deg,#2A3350,#121829 60%,#0B0F1E)", blue:"linear-gradient(135deg,#5BA7FF,#3B5BDB 55%,#2A3F9E)", light:"linear-gradient(135deg,#E9F0FF,#C9D8FF 60%,#AFC3F5)", red:"linear-gradient(135deg,#F0646E,#B82D52 60%,#7A1E3C)", green:"linear-gradient(135deg,#3FB27E,#1E7F5A 60%,#0F4D3A)" };
const grad = (c) => (S.cardColor && S.cardColor[c] && COLOUR_GRAD[S.cardColor[c]]) || CARD_GRAD[c] || COLOUR_GRAD.blue;
const cardInk = (c) => (S.cardColor && S.cardColor[c] === "light" ? "#111318" : "#fff");
const CATS = [["food","Food","var(--c-food)","🍜"],["transport","Transport","var(--c-transport)","🚕"],["shop","Shopping","var(--c-shop)","🛍️"],["stay","Stay","var(--c-stay)","🏨"],["fun","Fun","var(--c-fun)","🎟️"],["other","Other","var(--c-other)","•"]];
const catOf = (id) => CATS.find((c) => c[0] === id) || CATS[5];
const EMBEDDED = { observedAt: "2026-10-27T00:00:00Z", rates: { USD:1, JPY:150.12, THB:33.47, EUR:0.9201, GBP:0.7742, KRW:1378.5, TWD:32.18, CNY:7.18, HKD:7.79, SGD:1.336, MYR:4.42, IDR:16080, PHP:57.1, VND:25410, LAK:21900, KHR:4080, MMK:2100, INR:84.1, AUD:1.512, NZD:1.66, CAD:1.372, CHF:0.879, SEK:10.6, NOK:10.9, DKK:6.86, CZK:23.2, PLN:3.98, HUF:372, ISK:138, TRY:34.2, AED:3.6725, SAR:3.75, KWD:0.3066, BHD:0.376, OMR:0.3845, JOD:0.709, MXN:19.6, BRL:5.62, CLP:940, ZAR:17.9, EGP:48.6, LKR:299, NPR:134.6 } };

// ---------- state ----------
function defaults() { return { schemaVersion: SCHEMA_VERSION, onboarded: false, home: "JPY", sel: "THB", from: "JPY", to: "THB", balances: {}, mine: {}, history: [], ledger: [], rateCache: null, liveCache: null, ticks: {}, series: {}, cardColor: {}, period: "1M", motion: "auto", migrations: [], split: null }; }
const DEC_RE = /^-?\d+(\.\d+)?$/;
/** Shape check for stored / imported state. Returns { ok, errors }. Never throws. */
function validateState(d) {
  const errors = [];
  if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, errors: ["not an object"] };
  if (d.schemaVersion !== undefined && (typeof d.schemaVersion !== "number" || d.schemaVersion > SCHEMA_VERSION)) errors.push(`schema v${d.schemaVersion} is newer than this app (v${SCHEMA_VERSION})`);
  if (d.balances !== undefined) { if (typeof d.balances !== "object" || Array.isArray(d.balances)) errors.push("balances must be an object"); else for (const [c, v] of Object.entries(d.balances)) { if (!CURRENCIES.has(c)) errors.push(`unknown currency ${c}`); else if (typeof v !== "string" || !DEC_RE.test(v)) errors.push(`balance ${c} is not a decimal string`); } }
  for (const k of ["ledger", "history"]) if (d[k] !== undefined && (!Array.isArray(d[k]) || d[k].some((e) => !e || typeof e !== "object" || typeof e.at !== "string"))) errors.push(`${k} must be a list of entries with "at"`);
  if (Array.isArray(d.ledger)) for (const e of d.ledger) { if ((e.kind === "spend" || e.kind === "add") && (typeof e.amount !== "string" || !DEC_RE.test(e.amount) || !CURRENCIES.has(e.ccy))) { errors.push("a ledger entry has a bad amount or currency"); break; } }
  if (d.mine !== undefined && (typeof d.mine !== "object" || Array.isArray(d.mine))) errors.push("mine must be an object");
  for (const k of ["home", "sel", "from", "to"]) if (d[k] !== undefined && !CURRENCIES.has(d[k])) errors.push(`${k} is not a known currency`);
  if (d.motion !== undefined && !["auto", "on", "off"].includes(d.motion)) errors.push("motion must be auto/on/off");
  return { ok: errors.length === 0, errors };
}
/** v3 → v4: conversions made before v4 changed balances; they are kept, marked legacy, and never reinterpreted. */
function migrate(raw) {
  const d = { ...raw }; const from = typeof d.schemaVersion === "number" ? d.schemaVersion : 3;
  if (from < 4) {
    d.history = (Array.isArray(d.history) ? d.history : []).map((h) => (h && typeof h === "object" && !h.kind ? { ...h, kind: "legacy_convert" } : h));
    d.ledger = (Array.isArray(d.ledger) ? d.ledger : []).map((e) => (e && e.kind === "convert" && !e.legacy ? { ...e, legacy: true } : e));
    d.motion = d.motion || "auto";
    d.migrations = [...(Array.isArray(d.migrations) ? d.migrations : []), { from, to: 4, at: new Date().toISOString(), note: "existing conversions marked legacy (they changed balances); new Convert is a simulation" }];
    d.schemaVersion = 4;
  }
  return d;
}
function readKey(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return undefined; } } // undefined = present but unreadable
let loadNote = "";
function load() {
  const cur = readKey(STORE_KEY);
  if (cur && typeof cur === "object") return { ...defaults(), ...migrate(cur) };
  if (cur === undefined) {
    const bak = readKey(BACKUP_KEY);
    if (bak && typeof bak === "object") { loadNote = "Saved data was unreadable. Restored the last backup."; return { ...defaults(), ...migrate(bak) }; }
    loadNote = "Saved data was unreadable. Starting fresh; the old data was left in place."; return defaults();
  }
  for (const k of LEGACY_KEYS) { const old = readKey(k); if (old && typeof old === "object") { loadNote = "Upgraded your data to v4. Earlier conversions are marked legacy."; return { ...defaults(), ...migrate({ ...old, schemaVersion: 3 }) }; } }
  return defaults();
}
let saveWarned = false;
/** One JSON write per save: a multi-leg change (e.g. exchange record) lands whole or not at all. The previous copy becomes the backup first. */
function save() {
  try {
    const prev = localStorage.getItem(STORE_KEY); const next = JSON.stringify(S);
    if (prev === next) return;
    if (prev !== null) localStorage.setItem(BACKUP_KEY, prev);
    localStorage.setItem(STORE_KEY, next);
  } catch { if (!saveWarned) { saveWarned = true; toast("Could not save: storage is full or blocked"); } }
}
async function exportState() {
  const exportedAt = new Date().toISOString();
  const text = JSON.stringify({ app: "currency-intelligence", schemaVersion: SCHEMA_VERSION, exportedAt, data: S }, null, 2);
  const filename = `currency-intelligence-${exportedAt.slice(0, 10)}.json`;
  // Inside the claude.ai artifact viewer a plain download link does nothing; the viewer offers the file through its own confirmation instead.
  if (window.claude && typeof window.claude.use === "function") {
    const dl = await window.claude.use("downloads");
    if (dl) { try { await dl.save({ filename, data: text }); toast("Exported"); } catch (e) { toast(e && e.code === "declined" ? "Export cancelled" : "Export unavailable here"); } return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast("Exported");
}
async function importStateFile(file) {
  let obj; try { obj = JSON.parse(await file.text()); } catch { toast("Not a JSON file"); return; }
  const data = obj && obj.app === "currency-intelligence" && obj.data ? obj.data : obj;
  const v = validateState(data); if (!v.ok) { toast("Import rejected: " + v.errors[0]); return; }
  const mig = migrate(data);
  if (!confirm(`Replace the data on this device with this file?\n${Object.keys(mig.balances || {}).length} balances · ${(mig.ledger || []).length} transactions · ${(mig.history || []).length} conversions\nThe current data is kept as a backup.`)) return;
  S = { ...defaults(), ...mig }; save(); applyMotion(); closeSheets(); render(); toast("Imported");
}
let S = load();
if (loadNote) save(); // persist a migration or recovery right away (and create the backup slot)
const store = { async get(key) { return S.rateCache && S.rateCache.key === key ? S.rateCache.quotes : undefined; }, async set(key, quotes) { S.rateCache = { key, quotes }; save(); } };
const f = (u, i) => fetch(u, i);
const liveStore = { async get(key) { return S.liveCache && S.liveCache.key === key ? S.liveCache.quotes : undefined; }, async set(key, quotes) { S.liveCache = { key, quotes }; save(); } };
const liveProvider = new CoinbaseProvider({ fetch: f });
const providers = [liveProvider, new OpenErApiProvider({ fetch: f }), new FrankfurterProvider({ fetch: f })];
const caches = [new RateCache(liveProvider, { ttlMs: LIVE_POLL_MS * 0.75, store: liveStore }), ...providers.slice(1).map((p) => new RateCache(p, { ttlMs: TTL_MS, store }))];
let pivot = [];
let rate = { status: "loading", source: "", error: "" };

function embeddedQuotes() {
  const now = new Date().toISOString();
  return Object.entries(EMBEDDED.rates).filter(([c]) => c !== PIVOT && CURRENCIES.has(c)).map(([c, r]) => ({ quoteId: `embedded:${PIVOT}${c}:${EMBEDDED.observedAt}`, base: PIVOT, quote: c, rate: String(r), source: "embedded", observedAt: EMBEDDED.observedAt, receivedAt: now, rateKind: "indicative", confidence: "estimated", granularity: "daily", notes: ["Sample snapshot shipped with the app (not current); replaced once online"] }));
}
let lastRateShown = null; // for the tick flash
function recordTick() {
  const q = marketQuote(S.from, S.to); if (!q || q.source !== "coinbase") return;
  const key = `${S.from}/${S.to}`; const arr = S.ticks[key] || []; const t = Date.parse(q.receivedAt); // Coinbase publishes no observation time
  if (arr.length && t - arr[arr.length - 1].t < 20_000) return;
  arr.push({ t, rate: Number(q.rate) });
  const cutoff = Date.now() - 24 * 3600e3; S.ticks[key] = arr.filter((p) => p.t >= cutoff).slice(-1500); save();
}
function applyRates(quotes, source, status) {
  pivot = quotes; rate = { status, source, error: "" };
  recordTick();
  const q = marketQuote(S.from, S.to); const shown = q ? q.rate : null;
  if (lastRateShown !== null && shown !== null && shown !== lastRateShown) {
    const up = Number(shown) > Number(lastRateShown); const el = $("rateMain"); el.classList.remove("up", "down"); void el.offsetWidth; el.classList.add(up ? "up" : "down"); setTimeout(() => el.classList.remove("up", "down"), 900);
  }
  lastRateShown = shown;
  render(); if (S.period === "1D") { buildTickSeries(); renderRate(); }
}
async function loadRates(poll = false) {
  const symbols = [...CURRENCIES.keys()].filter((c) => c !== PIVOT);
  let lastErr = null;
  for (const cache of caches) {
    try {
      const r = await cache.resolve(PIVOT, symbols);
      applyRates(r.quotes, r.source, r.status);
      if (r.revalidation) { const fresh = await r.revalidation; if (fresh) applyRates(fresh, r.source, "fresh"); }
      if (!poll) loadSeries(); return;
    } catch (e) { lastErr = e; }
  }
  if (!poll || !pivot.length) { pivot = embeddedQuotes(); rate = { status: "sample", source: "embedded", error: lastErr ? String(lastErr.message || lastErr) : "" }; render(); }
}
setInterval(() => { if (document.visibilityState === "visible") loadRates(true); }, LIVE_POLL_MS);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadRates(true); });
setInterval(() => { if (rate.source === "coinbase" && !$("s-convert").hidden) renderRateSub(); }, 10_000);
function buildTickSeries() {
  const arr = S.ticks[`${S.from}/${S.to}`] || [];
  series = arr.length >= 2 ? arr.map((p) => ({ date: new Date(p.t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), rate: p.rate })) : null;
}
let series = null;
async function loadSeries() {
  SERIES_DAYS = PERIOD_DAYS[S.period] || 30;
  if (S.period === "1D") { buildTickSeries(); renderRate(); return; }
  const key = `${S.from}/${S.to}/${S.period}`; series = null; renderRate();
  const end = new Date(); const start = new Date(end.getTime() - SERIES_DAYS * 864e5); const d = (x) => x.toISOString().slice(0, 10);
  try {
    const res = await fetch(`https://api.frankfurter.app/${d(start)}..${d(end)}?from=${S.from}&to=${S.to}`);
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const pts = Object.entries(j.rates || {}).map(([date, r]) => ({ date, rate: r[S.to] })).filter((p) => typeof p.rate === "number").sort((a, b) => a.date < b.date ? -1 : 1);
    if (pts.length >= 2) { series = pts; S.series[key] = pts; save(); renderRate(); return; }
    throw new Error("empty");
  } catch {
    const local = S.series[key];
    if (local && local.length >= 2) series = local;
    else { const q = marketQuote(S.from, S.to); if (q) { const today = (q.observedAt || q.receivedAt).slice(0, 10); const arr = (S.series[key] || []).filter((p) => p.date !== today); arr.push({ date: today, rate: Number(q.rate) }); S.series[key] = arr.slice(-SERIES_DAYS); save(); series = arr.length >= 2 ? arr : null; } }
    renderRate();
  }
}

// ---------- quotes ----------
function marketQuote(base, target) {
  if (base === target) return null;
  const find = (c) => pivot.find((q) => q.quote === c);
  if (base === PIVOT) return find(target) || null;
  if (target === PIVOT) { const q = find(base); return q ? invert(q) : null; }
  const a = find(base), b = find(target);
  return a && b ? cross(a, b, { toleranceMs: CROSS_TOLERANCE_MS }) : null;
}
function quoteBetween(base, target) {
  const m = S.mine[`${base}/${target}`];
  if (m) { try { return { quote: realizedRate(parseDec(m.paid), parseDec(m.received), { base, quote: target, at: m.at, receivedAt: m.at }), mine: true }; } catch {} }
  const mk = marketQuote(base, target);
  return mk ? { quote: mk, mine: false } : null;
}
const activeQuote = () => quoteBetween(S.from, S.to);
function toCcy(m, to) { if (m.currency === to) return m; const q = quoteBetween(m.currency, to); if (!q) return null; try { return convert(m, q.quote, { rounding: ROUNDING }).convertedAmount; } catch { return null; } }

// ---------- formatting ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (m) => m.format("en-US");
function fmtNum(v, ccy) { const sc = currency(ccy).scale; return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, currencyDisplay: "narrowSymbol", minimumFractionDigits: sc, maximumFractionDigits: sc }).format(v); }
function groupDigits(s) { const [i, fr] = s.split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fr !== undefined ? "." + fr : ""); }
function rateStr(r) { const n = Number(r); return n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(5); }
function dateJa(iso) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function dateTime(iso) { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function balance(code) { const b = S.balances[code]; if (b === undefined) return null; try { return Money.of(b, code); } catch { return null; } }
function setBalance(code, m) { S.balances[code] = m.toDecimalString(); }
function parseAmt(txt, code) { const t = txt.trim().replace(/,/g, ""); if (!t) return null; try { const m = Money.of(t, code, "DOWN"); return m.isPositive() ? m : null; } catch { return null; } }
function ago(iso) { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; }
// Wording rule (spec 02 Q-02): never "Live". A rate without a published observation time says so and shows the fetch age instead.
function sourceLabel(q) { if (!q) return ""; if (q.source === "user") return "Your rate"; if (q.source === "coinbase") return `Coinbase · fetched ${ago(q.receivedAt)} · observation time not published`; if (q.source === "embedded") return `Sample rate · ${dateJa(q.observedAt)} · not current`; if (q.source === "frankfurter") return `ECB reference · daily · ${dateJa(q.observedAt)}`; return `Reference rate · daily · ${dateJa(q.observedAt)}`; }
const STATUS_TEXT = { fresh: "Fresh", stale: "Stale · older than its refresh window", offline: "Offline · last saved rate", sample: "Sample · shipped with the app, not current", loading: "Loading", error: "Unavailable" };
function statusSuffix() { return rate.status === "stale" ? " · stale" : rate.status === "offline" ? " · offline, last saved" : rate.source !== "embedded" && rate.status === "sample" ? " · sample" : ""; }
function walletCcys() { const set = new Set([...Object.keys(S.balances), S.sel]); return [...set].filter((c) => CURRENCIES.has(c)); }
const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

// ---------- number tween (count-up like the reference) ----------
const tw = new WeakMap();
function tweenMoney(el, money, { duration = 450, instant = false, ease = easeOut } = {}) {
  const target = Number(money.toDecimalString()); const ccy = money.currency;
  const prev = tw.get(el);
  if (prev && prev.raf) cancelAnimationFrame(prev.raf);
  if (instant || reduced() || !prev || prev.ccy !== ccy && prev.value === 0 || prev.value === target) {
    el.textContent = fmt(money); tw.set(el, { value: target, ccy, raf: 0 }); return;
  }
  const from = prev.value; const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration); const v = from + (target - from) * ease(t);
    el.textContent = t < 1 ? fmtNum(v, ccy) : fmt(money);
    const rec = tw.get(el); if (t < 1) rec.raf = requestAnimationFrame(step); else rec.raf = 0;
  };
  tw.set(el, { value: target, ccy, raf: requestAnimationFrame(step) });
}
function tweenSeed(el, money) { tw.set(el, { value: Number(money.toDecimalString()), ccy: money.currency, raf: 0 }); }
/** Digit scramble (reference card number change). */
function scramble(el, finalText, duration = 420) {
  if (reduced()) { el.textContent = finalText; return; }
  const t0 = performance.now(); const chars = [...finalText];
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration); const settled = Math.floor(t * chars.length);
    el.textContent = chars.map((c, i) => (i < settled || !/\d/.test(c) ? c : String(Math.floor(Math.random() * 10)))).join("");
    if (t < 1) requestAnimationFrame(step); else el.textContent = finalText;
  };
  requestAnimationFrame(step);
}

// ---------- routing & screen transitions ----------
const SCREENS = ["onboard", "home", "convert", "wallet", "receipt", "addcash"];
let current = null;
function show(name, how = "auto") {
  for (const s of SCREENS) { const el = $("s-" + s); if (el.classList.contains("leaving")) continue; el.hidden = s !== name; el.classList.remove("push", "fadein", "enter", "blurout"); }
  document.body.classList.toggle("night", name === "onboard");
  const tabs = ["home", "convert", "wallet"].includes(name);
  $("tabbar").hidden = !tabs;
  for (const s of SCREENS) $("s-" + s).classList.toggle("has-tabs", tabs && s === name);
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === name));
  if (tabs) requestAnimationFrame(moveTabHl);
  const el = $("s-" + name);
  if (!reduced() && current && current !== name) {
    if (name === "convert" || name === "addcash") el.classList.add("push");
    else if (name === "home" || name === "wallet") { el.classList.add("enter"); setTimeout(() => el.classList.remove("enter"), 1200); }
    else el.classList.add("fadein");
  }
  current = name;
}
function moveTabHl() { const on = document.querySelector(".tabs a.on"); if (on) $("tabhl").style.left = on.offsetLeft + "px"; }
let booting = true;
function route() {
  if (booting || !S.onboarded) { show("onboard"); return; }
  const h = (location.hash || "#home").slice(1);
  const name = ["home", "convert", "wallet"].includes(h) ? h : "home";
  if (name === "home") renderHome(current !== "home");
  if (name === "wallet") renderWallet(true);
  if (name === "convert") { renderPair(true); renderRate(); }
  show(name);
}
window.addEventListener("hashchange", route);
function go(name) { if (location.hash === "#" + name) route(); else location.hash = name; }

// ---------- convert input ----------
let buf = "";
function inputMoney() { const txt = buf || "0"; try { return Money.of(txt, S.from); } catch (e) { if (e instanceof MoneyError && e.code === "MONEY_PRECISION") return Money.of(txt, S.from, "DOWN"); return Money.zero(S.from); } }
function key(k) {
  const scale = currency(S.from).scale;
  if (k === "⌫") buf = buf.slice(0, -1);
  else if (k === ".") { if (scale === 0 || buf.includes(".")) return; buf = (buf || "0") + "."; }
  else { if (buf.replace(".", "").length >= 12) return; const fr = buf.split(".")[1]; if (fr !== undefined && fr.length >= scale) return; buf = buf === "0" ? k : buf + k; }
  try { navigator.vibrate?.(5); } catch {}
  renderPair();
}


// ---------- amount digits: each typed digit slides in from the right (reference behaviour) ----------
let lastDigits = null; // {ccy, text}
function renderDigits(el, sym, text, scale, instant) {
  const ccy = S.from;
  if (!text) {
    if (lastDigits && lastDigits.ccy === ccy && lastDigits.text && !instant) {
      el.className = "amt num placeholder";
      el.innerHTML = `<span class="sym">${esc(sym)}</span><span class="d out">${esc(lastDigits.text)}</span><span class="d in">0</span>`;
    } else { el.className = "amt num placeholder"; el.innerHTML = `<span class="sym">${esc(sym)}</span><span class="d">0</span>`; }
    lastDigits = { ccy, text: "" }; return;
  }
  const shown = groupDigits(text);
  const prev = lastDigits && lastDigits.ccy === ccy ? lastDigits.text : null;
  el.className = "amt num input";
  let html = `<span class="sym">${esc(sym)}</span>`;
  const chars = [...shown];
  const grew = prev !== null && !instant && text.length > prev.length && text.startsWith(prev);
  chars.forEach((c, i) => { const isNew = grew && i >= chars.length - (text.length - prev.length); html += `<span class="d${isNew ? " in" : ""}">${esc(c)}</span>`; });
  if (prev === "" && !instant) html = `<span class="sym">${esc(sym)}</span><span class="d out">0</span>` + html.slice(html.indexOf("</span>") + 7);
  el.innerHTML = html;
  lastDigits = { ccy, text };
}
// ---------- render: convert ----------
let lastCta = "";
function renderPair(instant = false) {
  $("flagFrom").textContent = flag(S.from); $("codeFrom").textContent = S.from;
  $("flagTo").textContent = flag(S.to); $("codeTo").textContent = S.to;
  const bf = balance(S.from), bt = balance(S.to);
  $("balFrom").textContent = bf ? `Balance ${fmt(bf)}` : "No balance";
  $("balTo").textContent = bt ? `Balance ${fmt(bt)}` : "";
  $("btnMax").hidden = !bf || !bf.isPositive();
  const amount = inputMoney(); const sym = currency(S.from).symbol;
  renderDigits($("amtFrom"), sym, buf, currency(S.from).scale, instant);
  const aq = activeQuote(); const t = $("amtTo");
  if (aq && !amount.isZero()) {
    try { const out = convert(amount, aq.quote, { rounding: ROUNDING }).convertedAmount; t.className = "amt num input"; tweenMoney(t, out, { instant }); }
    catch { t.textContent = "—"; t.className = "amt num placeholder"; }
  } else { t.className = "amt num placeholder"; tweenMoney(t, Money.zero(S.to), { instant: true }); }
  const cta = $("btnConvert"); const txt = $("ctaText");
  cta.disabled = amount.isZero() || !aq;
  const label = amount.isZero() ? "Enter an amount" : !aq ? "No rate available" : `Convert ${fmt(amount)}`;
  if (label !== lastCta && !instant && !reduced() && lastCta) { txt.classList.add("swapping"); setTimeout(() => { txt.textContent = label; txt.classList.remove("swapping"); }, 150); }
  else txt.textContent = label;
  lastCta = label;
}
function sparkPath(pts, w, h) { const vals = pts.map((p) => p.rate); const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1; return pts.map((p, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * w},${h - 3 - ((p.rate - min) / span) * (h - 6)}`).join(" "); }
let lastSpark = "";
function renderRateSub() { const aq = activeQuote(); if (!aq) return; const mk = marketQuote(S.from, S.to); let sub = sourceLabel(aq.quote); if (aq.mine && mk && mk.source === "coinbase") sub = `Your rate · market mid ${rateStr(mk.rate)} · fetched ${ago(mk.receivedAt)}`; sub += statusSuffix(); $("rateSub").textContent = sub; }
function renderRate() {
  const aq = activeQuote(); const mk = marketQuote(S.from, S.to);
  const dot = $("rateDot"); const chip = $("rateChip"); const sp = $("spark");
  if (!aq) { $("rateMain").textContent = "—"; $("rateSub").textContent = rate.status === "loading" ? "Loading rate…" : "No rate for this pair"; dot.className = "dot error"; chip.textContent = "—"; chip.className = "chip grey"; sp.innerHTML = ""; return; }
  $("rateMain").textContent = `1 ${S.from} = ${rateStr(aq.quote.rate)} ${S.to}`;
  renderRateSub();
  dot.className = "dot " + (rate.status === "fresh" ? "" : rate.status === "error" ? "error" : "stale") + (rate.status === "fresh" && rate.source === "coinbase" ? " polling" : "");
  if (aq.mine && mk) { const sp2 = spreadPercent(mk, aq.quote); const worse = !sp2.startsWith("-"); chip.textContent = `${worse ? "▼" : "▲"} ${sp2.replace("-", "")}% vs mid`; chip.className = "chip " + (worse ? "red" : "green"); }
  else if (series && series.length >= 2) { const a = series[0].rate, b = series[series.length - 1].rate; const ch = ((b - a) / a) * 100; chip.textContent = `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%`; chip.className = "chip " + (ch >= 0 ? "green" : "red"); }
  else { chip.textContent = aq.quote.confidence === "estimated" ? "Reference" : "Confirmed"; chip.className = "chip grey"; }
  let html, cls;
  if (series && series.length >= 2) { const up = series[series.length - 1].rate >= series[0].rate; cls = "spark " + (up ? "" : "down"); html = `<path d="${sparkPath(series, 100, 32)}"/>`; }
  else { cls = "spark flat"; html = `<path d="M0,16 L100,16" stroke-dasharray="3 3"/>`; }
  if (html !== lastSpark) { sp.className.baseVal = cls; sp.innerHTML = html; lastSpark = html; }
}
function renderRateSheet() {
  $("periods").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.p === (S.period || "1M")));
  const aq = activeQuote(); const mk = marketQuote(S.from, S.to);
  $("rhMain").textContent = aq ? `1 ${S.from} = ${rateStr(aq.quote.rate)} ${S.to}` : "—";
  $("rhSub").textContent = aq ? `${sourceLabel(aq.quote)}${mk && aq.mine ? ` · mid ${rateStr(mk.rate)}` : ""}` : "";
  const big = $("bigSpark"); const legend = $("sparkLegend");
  if (series && series.length >= 2) { const up = series[series.length - 1].rate >= series[0].rate; big.className.baseVal = "bigspark " + (up ? "" : "down"); big.innerHTML = `<path d="${sparkPath(series, 320, 90)}"/>`; legend.innerHTML = S.period === "1D" ? `<span>${esc(series[0].date)}</span><span>Ticks collected while the app is open (fetched about once a minute; provider publishes no observation time)</span><span>${esc(series[series.length - 1].date)}</span>` : `<span>${esc(series[0].date)}</span><span>${SERIES_DAYS} days · daily reference rates, not real time</span><span>${esc(series[series.length - 1].date)}</span>`; }
  else { big.className.baseVal = "bigspark flat"; big.innerHTML = `<path d="M0,45 L320,45" stroke-dasharray="4 4"/>`; legend.innerHTML = S.period === "1D" ? `<span></span><span>Collecting ticks… keep the app open a few minutes</span><span></span>` : `<span></span><span>History loads when online (daily)</span><span></span>`; }
  const q = aq ? aq.quote : null;
  const rows = q ? [["Source", q.source === "user" ? "Your exchange receipt" : q.source === "embedded" ? "Sample snapshot shipped with the app (not current)" : q.source === "coinbase" ? "Coinbase exchange rates (indicative; refreshed about once a minute while open; no observation time published)" : q.source === "frankfurter" ? "Frankfurter (ECB reference rates, daily)" : "ExchangeRate-API (reference rates, daily)"], ["Type", `${q.rateKind} · ${q.confidence === "confirmed" ? "confirmed" : "estimated"}`], ["Freshness", STATUS_TEXT[rate.status] || rate.status], ["Observed", q.observedAt ? dateTime(q.observedAt) : "Not published by provider; age is counted from the fetch"], ["Fetched", dateTime(q.receivedAt)], ["Expires", q.expiresAt ? dateTime(q.expiresAt) : "Not stated by provider"], ["Math", q.derivedFrom ? `Cross rate via USD · rounding ${ROUNDING}` : `Rounding ${ROUNDING}`]] : [["Status", "No rate loaded"]];
  if (q && q.notes?.some((n) => n.includes("skew"))) rows.push(["Note", "Observation times differ, treated as estimated"]);
  if (q && q.notes?.some((n) => n.includes("observation time unknown"))) rows.push(["Note", "Cross rate from legs without observation time, treated as estimated"]);
  $("provRows").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("lblPaid").textContent = `You paid (${S.from})`; $("lblGot").textContent = `You got (${S.to})`;
  const m = S.mine[`${S.from}/${S.to}`]; $("inPaid").value = m ? m.paid : ""; $("inGot").value = m ? m.received : "";
  $("mineNote").textContent = m ? `Set ${dateTime(m.at)}. The chip shows the gap to the market mid rate.` : "Paid ¥100,000 and got ฿22,500? Enter 100000 and 22500.";
  $("homeCcyFlag").textContent = flag(S.home); $("homeCcyCode").textContent = S.home;
  $("motionChips").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === (S.motion || "auto")));
  $("motionNote").textContent = motionMq.matches ? "Your device asks for reduced motion." : "Your device allows full motion.";
  let bytes = 0; try { bytes = (localStorage.getItem(STORE_KEY) || "").length; } catch {}
  $("dataNote").textContent = `Schema v${S.schemaVersion} · ${Object.keys(S.balances).length} balances · ${S.ledger.length} transactions · ${S.history.length} conversions · ${(bytes / 1024).toFixed(1)} KB on this device`;
  stagger($("sheetRate").querySelector(".sheetbox"));
}
function stagger(box) { [...box.children].forEach((c, i) => c.style.setProperty("--i", i)); }

// ---------- render: home ----------
function weekSpend() {
  const since = Date.now() - 7 * 864e5; const byCat = {}; let total = Money.zero(S.home); let unconverted = 0;
  for (const e of S.ledger) { if (e.kind !== "spend" || Date.parse(e.at) < since) continue; const m = toCcy(Money.of(e.amount, e.ccy), S.home); if (!m) { unconverted++; continue; } total = total.add(m); byCat[e.cat] = (byCat[e.cat] || Money.zero(S.home)).add(m); }
  return { total, byCat, unconverted };
}
function renderHome(entering = false) {
  const ccys = walletCcys(); if (!ccys.includes(S.sel)) S.sel = ccys[0] || S.to;
  const tk = $("ticker");
  tk.querySelectorAll("button").forEach((b) => b.remove());
  for (const c of ccys) { const b = balance(c) || Money.zero(c); const btn = document.createElement("button"); btn.type = "button"; btn.dataset.c = c; btn.className = c === S.sel ? "on" : ""; btn.innerHTML = `<span class="flag">${flag(c)}</span><span><b>${c}</b><span>${esc(b.format("en-US", { style: "decimal" }))}</span></span>`; tk.appendChild(btn); }
  requestAnimationFrame(() => { const on = tk.querySelector("button.on"); if (on) { $("tkhl").style.left = on.offsetLeft + "px"; $("tkhl").style.width = on.offsetWidth + "px"; } });
  const sel = balance(S.sel) || Money.zero(S.sel);
  const hb = $("homeBal");
  if (entering) { tweenSeed(hb, Money.zero(S.sel).add(Money.fromMinor(sel.minor * 6n / 10n, S.sel))); tweenMoney(hb, sel, { duration: 800, ease: easeOutQuad }); }
  else tweenMoney(hb, sel, { duration: 750, ease: easeOutQuad });
  const h = S.sel === S.home ? null : toCcy(sel, S.home);
  $("homeSub").textContent = h ? `≈ ${fmt(h)}${S.mine[`${S.sel}/${S.home}`] ? " at your rate" : ""}` : S.sel === S.home ? "Home currency" : "No rate to home currency";
  $("miniCards").innerHTML = ccys.map((c) => `<button type="button" class="mc ${c === S.sel ? "on" : ""}" data-c="${c}" style="background:${grad(c)}">${flag(c)}</button>`).join("") + `<button type="button" class="mc add" id="mcAdd" aria-label="通貨を追加"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>`;
  const w = weekSpend();
  tweenMoney($("weekTotal"), w.total, { instant: !entering && tw.get($("weekTotal")) === undefined });
  if (w.unconverted) $("weekTotal").textContent += " +?";
  const parts = Object.entries(w.byCat).sort((a, b) => b[1].compareTo(a[1]));
  const tot = Number(w.total.toDecimalString()) || 1;
  $("catBar").innerHTML = parts.length ? parts.map(([id, m]) => `<i style="width:${Math.max(2, (Number(m.toDecimalString()) / tot) * 100)}%;background:${catOf(id)[2]}"></i>`).join("") : `<i style="width:100%;background:var(--box)"></i>`;
  $("catLegend").innerHTML = parts.length ? parts.map(([id, m]) => `<span style="--c:${catOf(id)[2]}">${catOf(id)[1]} <b>${esc(fmt(m))}</b></span>`).join("") : `<span style="--c:var(--faint)">Record a spend to see the breakdown</span>`;
  const list = $("txList"); list.innerHTML = ""; $("txEmpty").hidden = S.ledger.length > 0;
  const groups = new Map();
  for (const e of S.ledger.slice(0, 40)) { const k = new Date(e.at).toDateString(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const today = new Date().toDateString(), yest = new Date(Date.now() - 864e5).toDateString();
  for (const [k, items] of groups) {
    const label = k === today ? "Today" : k === yest ? "Yesterday" : new Date(items[0].at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    let dayTotal = Money.zero(S.home); let miss = false;
    for (const e of items) { if (e.kind !== "spend") continue; const m = toCcy(Money.of(e.amount, e.ccy), S.home); if (m) dayTotal = dayTotal.add(m); else miss = true; }
    const g = document.createElement("div"); g.className = "txgroup"; g.innerHTML = `<span>${esc(label)}</span><b>${dayTotal.isZero() && !miss ? "" : "−" + esc(fmt(dayTotal)) + (miss ? " +?" : "")}</b>`; list.appendChild(g);
    for (const e of items) {
      const el = document.createElement("div"); el.className = "tx";
      const m = e.kind === "convert" || e.kind === "exchange" ? null : Money.of(e.amount, e.ccy); const sub = m && e.ccy !== S.home ? toCcy(m, S.home) : null;
      if (e.kind === "spend") { const c = catOf(e.cat); el.innerHTML = `<div class="av" style="--c:${c[2]}">${c[3]}</div><div class="t"><b>${esc(e.note || c[1])}</b><span>${c[1]}</span></div><div class="a">${esc(fmt(m))}<span>${e.ccy} cash</span></div>`; }
      else if (e.kind === "add") { el.innerHTML = `<div class="av" style="--c:#1E7F4F"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div><div class="t"><b>Cash added</b><span>${esc(e.note || "")}</span></div><div class="a pos">+${esc(fmt(m))}<span>${e.ccy} cash</span></div>`; }
      else { el.innerHTML = `<div class="av conv"><svg viewBox="0 0 24 24"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg></div><div class="t"><b>${e.kind === "exchange" ? "Exchange recorded" : "Conversion"} ${esc(e.from)} → ${esc(e.to)}</b><span>${e.kind === "exchange" ? "You recorded a real exchange" : "Legacy (pre-v4): changed balances"}</span></div><div class="a">${esc(e.fromText)}<span class="pos">↳ ${esc(e.toText)}</span></div>`; el.addEventListener("click", () => { const tx = S.history.find((h) => h.ref === e.ref); if (tx) showReceipt(tx); }); }
      list.appendChild(el);
    }
    list.lastElementChild.classList.add(items.length === 1 ? "only" : "last");
  }
  [...$("s-home").querySelector(".sky").children].forEach((c, i) => c.style.setProperty("--i", i));
  [...$("s-home").querySelector(".homebody").children].forEach((c, i) => c.style.setProperty("--i", i + 6));
}

// ---------- render: wallet (3D carousel) ----------
const car = { ccys: [], idx: 0, drag: 0, dragging: false, startX: 0, width: 1, moved: false };
function layoutCards(animated = true) {
  const els = $("carousel").children;
  for (let i = 0; i < els.length; i++) {
    const el = els[i]; const off = i - car.idx - car.drag; const a = Math.abs(off);
    el.style.transition = animated && !car.dragging && !reduced() ? "transform .5s cubic-bezier(.2,.9,.25,1.05), opacity .3s" : "none";
    el.style.transform = `translate(-50%,-50%) translateX(${off * 74}%) rotateY(${-off * 48}deg) translateZ(${-a * 80}px) scale(${1 - Math.min(1, a) * 0.1})`;
    el.style.zIndex = String(20 - Math.round(a * 10)); el.style.opacity = a > 1.8 ? "0" : "1";
    el.classList.toggle("on", Math.round(car.idx + car.drag) === i);
  }
}
function buildCards() {
  car.ccys = walletCcys(); if (!car.ccys.includes(S.sel)) S.sel = car.ccys[0]; car.idx = car.ccys.indexOf(S.sel);
  const c = $("carousel");
  c.innerHTML = car.ccys.map((cc) => { const b = balance(cc) || Money.zero(cc); const meta = currency(cc); return `<div class="card3d" data-c="${cc}" style="background:${grad(cc)};color:${cardInk(cc)}"><div class="top"><span class="flag">${flag(cc)}</span><span class="kind">${cc} CASH</span></div><div class="chipw"><i></i><svg viewBox="0 0 24 24"><path d="M5 9a9 9 0 0 1 14 0M8 12a5 5 0 0 1 8 0M11 15a1.5 1.5 0 0 1 2 0"/></svg></div><div class="numline" data-num>${esc(b.format("en-US"))}</div><div class="bottom"><span><small>CURRENCY</small><b>${esc(meta.name.en.toUpperCase())}</b></span><span><small>HOLDER</small><b>TRAVELLER</b></span></div></div>`; }).join("");
  layoutCards(false);
}
function walletInfo(animated = true) {
  const b = balance(S.sel) || Money.zero(S.sel);
  tweenMoney($("wBal"), b, { duration: 600, instant: !animated, ease: easeOutQuad });
  const h = S.sel === S.home ? null : toCcy(b, S.home); $("wSub").textContent = h ? `≈ ${fmt(h)}` : "";
  $("dots").innerHTML = car.ccys.map((c) => `<i class="${c === S.sel ? "on" : ""}"></i>`).join("");
  const since = Date.now() - 7 * 864e5;
  let spent = Money.zero(S.sel), added = Money.zero(S.sel), got = Money.zero(S.sel);
  for (const e of S.ledger) { if (e.kind === "spend" && e.ccy === S.sel && Date.parse(e.at) >= since) spent = spent.add(Money.of(e.amount, e.ccy)); if (e.kind === "add" && e.ccy === S.sel) added = added.add(Money.of(e.amount, e.ccy)); if (e.kind === "convert" && e.to === S.sel) got = got.add(Money.of(e.toAmt, e.to)); }
  const m = S.mine[`${S.home}/${S.sel}`];
  $("wRows").innerHTML = [["Balance", fmt(b)], ["Spent this week", fmt(spent)], ["Cash added", fmt(added)], ["From conversions", fmt(got)], ["Your rate", m ? `1 ${S.home} = ${rateStr(Number(m.received) / Number(m.paid))} ${S.sel}` : "Not set"]].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}
function renderWallet(entering = false) {
  buildCards();
  if (entering) tweenSeed($("wBal"), Money.zero(S.sel));
  walletInfo(true);
  [...$("s-wallet").querySelector(".walletsky").children].forEach((c, i) => c.style.setProperty("--i", i));
  [...$("s-wallet").querySelector(".wbody").children].forEach((c, i) => c.style.setProperty("--i", i + 4));
}
function selectCard(i, { scrambleNum = true } = {}) {
  i = Math.max(0, Math.min(car.ccys.length - 1, i));
  const changed = car.ccys[i] !== S.sel;
  car.idx = i; car.drag = 0; S.sel = car.ccys[i]; save(); layoutCards(true); walletInfo(true);
  if (changed && scrambleNum) { const el = $("carousel").children[i]?.querySelector("[data-num]"); if (el) scramble(el, el.textContent); }
}
const stage = $("carousel");
stage.addEventListener("pointerdown", (e) => { car.dragging = true; car.moved = false; car.startX = e.clientX; car.width = stage.clientWidth; stage.setPointerCapture(e.pointerId); });
stage.addEventListener("pointermove", (e) => {
  if (!car.dragging) return; const dx = e.clientX - car.startX; if (Math.abs(dx) > 4) car.moved = true;
  car.drag = Math.max(-1, Math.min(1, -dx / (car.width * 0.6)));
  const lim = car.idx + car.drag; if (lim < 0 || lim > car.ccys.length - 1) car.drag *= 0.3;
  layoutCards(false);
  // balance interpolates with the drag (reference behaviour)
  const j = car.drag > 0 ? Math.min(car.ccys.length - 1, car.idx + 1) : Math.max(0, car.idx - 1);
  const a = Number((balance(car.ccys[car.idx]) || Money.zero(car.ccys[car.idx])).toDecimalString()); const b = Number((balance(car.ccys[j]) || Money.zero(car.ccys[j])).toDecimalString());
  const p = Math.min(1, Math.abs(car.drag)); const ccy = p > 0.5 ? car.ccys[j] : car.ccys[car.idx];
  if (!reduced()) $("wBal").textContent = fmtNum(a + (b - a) * p, ccy);
});
const endDrag = () => { if (!car.dragging) return; car.dragging = false; const target = Math.round(car.idx + car.drag); selectCard(target); };
stage.addEventListener("pointerup", endDrag); stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("click", (e) => { if (car.moved) return; const el = e.target.closest(".card3d"); if (el) selectCard(car.ccys.indexOf(el.dataset.c)); });
$("dots").addEventListener("click", (e) => { const i = [...$("dots").children].indexOf(e.target); if (i >= 0) selectCard(i); });

function render() { if (!$("s-convert").hidden) { renderPair(); renderRate(); } if (!$("s-home").hidden) renderHome(); if (!$("s-wallet").hidden) { buildCards(); walletInfo(false); } }

// ---------- convert flow (CTA morph → sheet) ----------
let lastTx = null;
async function doConvert() {
  const amount = inputMoney(); const aq = activeQuote(); if (amount.isZero() || !aq) return;
  const cta = $("btnConvert");
  if (!reduced() && !cta.classList.contains("loading")) {
    cta.style.width = cta.offsetWidth + "px"; await new Promise((r) => requestAnimationFrame(r)); cta.classList.add("loading"); await wait(1050);
  }
  // Convert is a SIMULATION (spec 02 Q-04): nothing below touches balances or the transaction ledger.
  // "Record as a real exchange" on the result sheet is the explicit action that does.
  const r = convert(amount, aq.quote, { rounding: ROUNDING });
  const bf = balance(S.from), bt = balance(S.to);
  const ref = "SIM-" + Math.random().toString(36).slice(2, 7).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const at = new Date().toISOString();
  const tx = { kind: "simulation", at, ref, from: S.from, to: S.to, fromAmt: amount.toDecimalString(), toAmt: r.convertedAmount.toDecimalString(), fromText: fmt(amount), toText: fmt(r.convertedAmount), rate: aq.quote.rate, rateText: `1 ${S.from} = ${rateStr(aq.quote.rate)} ${S.to}`, source: sourceLabel(aq.quote), sourceId: aq.quote.source, rateKind: aq.quote.rateKind, confidence: aq.quote.confidence, observedAt: aq.quote.observedAt, receivedAt: aq.quote.receivedAt, mine: aq.mine, rounding: ROUNDING, balFrom: bf ? fmt(bf) : null, balTo: bt ? fmt(bt) : null };
  S.history.unshift(tx); S.history = S.history.slice(0, 100);
  save(); lastTx = tx; buf = ""; renderPair(true);
  $("doneRate").textContent = tx.rateText + (tx.mine ? " (your rate)" : "");
  $("dFlagFrom").textContent = flag(tx.from); $("dFromLbl").textContent = `From ${tx.from}`; $("dFromAmt").textContent = "−" + tx.fromText;
  $("dFlagTo").textContent = flag(tx.to); $("dToLbl").textContent = `To ${tx.to}`; $("dToAmt").textContent = "+" + tx.toText;
  $("doneBals").innerHTML = [[tx.from, tx.balFrom ?? "Not set"], [tx.to, tx.balTo ?? "Not set"]].map(([c, v]) => `<dt><span class="flag">${flag(c)}</span>${c} balance (unchanged)</dt><dd>${esc(v)}</dd>`).join("");
  stagger($("sheetDone").querySelector(".sheetbox"));
  $("sheetDone").hidden = false;
  setTimeout(() => { cta.classList.remove("loading"); cta.style.width = ""; }, 300);
}
/** The explicit "real exchange" action: both legs and both balances are written in ONE save (one localStorage write). */
function recordExchange(sim) {
  if (!sim || sim.kind !== "simulation") return null;
  const amount = Money.of(sim.fromAmt, sim.from), got = Money.of(sim.toAmt, sim.to);
  const newFrom = (balance(sim.from) || Money.zero(sim.from)).subtract(amount); const newTo = (balance(sim.to) || Money.zero(sim.to)).add(got);
  if (!confirm(`Record this as a real exchange you made?\n−${sim.fromText} from ${sim.from} cash\n+${sim.toText} to ${sim.to} cash\nThis changes the balances recorded on this device.`)) return null;
  const at = new Date().toISOString(); const ref = sim.ref.replace(/^SIM-/, "EXC-");
  const tx = { ...sim, kind: "exchange", at, ref, simRef: sim.ref, balFrom: fmt(newFrom), balTo: fmt(newTo) };
  setBalance(sim.from, newFrom); setBalance(sim.to, newTo);
  S.history.unshift(tx); S.history = S.history.slice(0, 100);
  S.ledger.unshift({ kind: "exchange", at, ref, from: sim.from, to: sim.to, fromAmt: sim.fromAmt, toAmt: sim.toAmt, fromText: sim.fromText, toText: sim.toText, rateText: sim.rateText }); S.ledger = S.ledger.slice(0, 500);
  save(); lastTx = tx; render(); return tx;
}
function barcodeFor(ref) { let h = 2166136261; const bars = []; for (let i = 0; i < 120; i++) { h ^= ref.charCodeAt(i % ref.length) + i; h = Math.imul(h, 16777619) >>> 0; bars.push(h & 1); } let x = 0, out = ""; for (const b of bars) { const w = 1 + ((x * 7) % 3) * 0.4; if (b) out += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="40"/>`; x += w + 0.4; } return out; }

// ---------- receipt: generating → printing → done → stamp → buttons ----------
let printToken = 0;
async function showReceipt(tx) {
  const kind = tx.kind || "legacy_convert"; const sim = kind === "simulation";
  $("rEyebrow").textContent = kind === "exchange" ? "EXCHANGE RECORD" : sim ? "SIMULATION NOTE" : "LEGACY CONVERSION";
  $("stamp").textContent = kind === "exchange" ? "RECORDED" : sim ? "SIMULATED" : "LEGACY"; $("stamp").classList.toggle("sim", sim);
  $("rWhat").textContent = sim ? "You would get" : "You converted";
  $("rBalsHead").textContent = sim ? "BALANCES (UNCHANGED)" : "NEW BALANCES";
  $("rKindNote").textContent = kind === "exchange" ? "A record you entered of a real exchange. Balances on this device were updated." : sim ? "A simulation at the rate shown. No balance changed and no money moved." : "Made before v4, when Convert changed balances. Kept as it was.";
  $("rFlagFrom").textContent = flag(tx.from); $("rFlagTo").textContent = flag(tx.to);
  $("rBig").textContent = tx.toText; $("rFor").textContent = `for ${tx.fromText}`;
  $("rDate").textContent = dateTime(tx.at).replace(", ", " · ").replace(/(\d{4}),? /, "$1 · ");
  $("rRows").innerHTML = [[sim ? "You'd pay" : "You paid", `<span class="flag">${flag(tx.from)}</span>${esc(tx.fromText)}`, ""], [sim ? "You'd get" : "You got", `<span class="flag">${flag(tx.to)}</span>${esc(tx.toText)}`, "green"], ["Exchange rate", esc(tx.rateText), ""], ["Fee", tx.mine ? "Included in your rate" : "Not included (reference rate)", tx.mine ? "green" : ""], ["Reference", esc(tx.ref), ""]].map(([k, v, c]) => `<dt>${esc(k)}</dt><dd class="${c}">${v}</dd>`).join("");
  $("rBals").innerHTML = [...(tx.balFrom ? [[tx.from, tx.balFrom]] : []), ...(tx.balTo ? [[tx.to, tx.balTo]] : [])].map(([c, v]) => `<dt><span class="flag">${flag(c)}</span>${c}</dt><dd>${esc(v)}</dd>`).join("") || `<dt>—</dt><dd>No balances recorded</dd>`;
  $("rProv").innerHTML = [["Source", tx.source], ["Type", `${tx.rateKind} · ${tx.confidence === "confirmed" ? "confirmed" : "estimated"}`], ["Observed", tx.observedAt ? dateTime(tx.observedAt) : "Not published by provider"], ...(tx.receivedAt ? [["Fetched", dateTime(tx.receivedAt)]] : []), ["Rounding", tx.rounding]].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("barcode").innerHTML = barcodeFor(tx.ref); $("rRef").textContent = tx.ref; lastTx = tx;
  const token = ++printToken;
  const slot = $("slot"), label = $("slotLabel"), wrap = $("paperwrap"), stamp = $("stamp"), actions = $("rActions");
  slot.classList.remove("gone"); slot.classList.add("busy"); stamp.classList.remove("in"); actions.classList.remove("in");
  label.textContent = "GENERATING...";
  wrap.classList.add("printing"); wrap.style.setProperty("--h", "0px");
  show("receipt");
  if (reduced()) { wrap.classList.remove("printing"); slot.classList.add("gone"); stamp.classList.add("in"); actions.classList.add("in"); return; }
  // Reference timing (30fps analysis): GENERATING 2.0s → PRINTING 0.85s (slow start, fast finish) → DONE + slot retract 0.5s → pause 1.2s → stamp and buttons together.
  await wait(2000); if (token !== printToken) return;
  label.textContent = "PRINTING...";
  await wait(250); if (token !== printToken) return;
  const full = $("paper").offsetHeight + 16; const dur = 850; const t0 = performance.now();
  // slow linear feed → accelerate → short decelerate (shape of the reference motion curve)
  const curve = (t) => (t < 0.35 ? (t / 0.35) * 0.2 : t < 0.75 ? 0.2 + 0.65 * Math.pow((t - 0.35) / 0.4, 1.8) : 0.85 + 0.15 * (1 - Math.pow(1 - (t - 0.75) / 0.25, 2)));
  await new Promise((done) => { const step = (now) => { if (token !== printToken) return done(); const t = Math.min(1, (now - t0) / dur); wrap.style.setProperty("--h", (full * curve(t)).toFixed(1) + "px"); if (t < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  if (token !== printToken) return;
  label.textContent = "DONE"; slot.classList.remove("busy"); await wait(120); if (token !== printToken) return;
  slot.classList.add("gone"); wrap.classList.remove("printing"); wrap.style.removeProperty("--h");
  await wait(1250); if (token !== printToken) return;
  stamp.classList.add("in"); actions.classList.add("in");
}

// ---------- add / spend ----------
let addCcy = "THB", spCcy = "THB", spCat = "food";
let acLast = "";
function acColour(col) { S.cardColor[addCcy] = col; save(); $("acCols").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.col === col)); $("acCard").querySelectorAll(".acbg").forEach((b) => b.classList.toggle("on", b.dataset.col === col)); $("acCard").classList.toggle("c-light", col === "light"); }
function acPreview() {
  const raw = $("addAmt").value.replace(/[^0-9.]/g, ""); const el = $("acNum"); const sym = currency(addCcy).symbol;
  if (!raw) { el.innerHTML = `<span class="ph">•••• •••• ••••</span>`; acLast = ""; $("btnAddGo").disabled = true; return; }
  const shown = groupDigits(raw); const grew = acLast && raw.length > acLast.length && raw.startsWith(acLast);
  const chars = [...shown]; el.innerHTML = `<span class="sym">${esc(sym)}</span>` + chars.map((c, i) => `<span class="d${grew && i >= chars.length - (raw.length - acLast.length) ? " in" : ""}">${esc(c)}</span>`).join("");
  acLast = raw; $("btnAddGo").disabled = !parseAmt(raw, addCcy);
}
function openAdd(ccy) {
  addCcy = ccy || S.sel; $("addFlag").textContent = flag(addCcy); $("addCode").textContent = addCcy; $("acFlag").textContent = flag(addCcy); $("acKind").textContent = `${addCcy} Cash`;
  $("addAmt").value = ""; $("addNote").value = ""; $("addSource").value = "Exchange booth"; $("addDate").value = new Date().toISOString().slice(0, 10);
  $("acDate").textContent = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  acColour(S.cardColor[addCcy] || (CARD_GRAD[addCcy] ? "blue" : "blue")); acLast = ""; acPreview();
  show("addcash"); setTimeout(() => $("addAmt").focus(), 400);
}
$("addAmt").addEventListener("input", () => { acPreview(); });
$("acCols").addEventListener("click", (e) => { const b = e.target.closest("button[data-col]"); if (b) acColour(b.dataset.col); });
$("btnAddBack").addEventListener("click", () => route());
$("addDate").addEventListener("change", () => { const v = $("addDate").value; if (v) $("acDate").textContent = new Date(v + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); });
function openSpend(ccy) {
  spCcy = ccy || S.sel; $("spFlag").textContent = flag(spCcy); $("spCode").textContent = spCcy; $("spAmt").value = ""; $("spNote").value = "";
  $("spCat").innerHTML = CATS.map((c) => `<button type="button" data-v="${c[0]}" class="${c[0] === spCat ? "on" : ""}" style="--c:${c[2]}">${c[1]}</button>`).join("");
  const b = balance(spCcy); $("spHint").textContent = b ? `Taken from your ${spCcy} balance of ${fmt(b)}` : `No ${spCcy} balance yet; recording still works and the balance goes negative`;
  stagger($("sheetSpend").querySelector(".sheetbox")); $("sheetSpend").hidden = false; setTimeout(() => $("spAmt").focus(), 60);
}
function runProgress(title, vis, done) {
  const p = $("progress"); p.hidden = false; p.classList.remove("done"); $("pTitle").textContent = title; $("pSub").textContent = "This only takes a moment";
  $("pVis").style.background = vis.grad; $("pVis").style.color = vis.ink || "#fff"; $("pVis").innerHTML = `<div class="cv"><small>${esc(vis.small)}</small>${esc(vis.big)}</div>`;
  const steps = [...$("pSteps").querySelectorAll(".step")], lines = [...$("pSteps").querySelectorAll("em")];
  steps.forEach((s) => (s.className = "step")); lines.forEach((l) => (l.className = ""));
  const labels = ["Recording your cash", "Converting to home currency", "Securing your wallet"]; let i = -1, pct = 0;
  const tick = () => {
    pct = Math.min(100, pct + (reduced() ? 50 : 1 + Math.round(Math.random() * 3)));
    $("pPct").textContent = pct + "%";
    const stage = Math.min(2, Math.floor(pct / 34));
    if (stage !== i || pct === 100) { for (let k = 0; k < 3; k++) { steps[k].className = "step " + (k < stage || pct === 100 ? "done" : k === stage ? "active" : ""); if (k < 2) lines[k].className = k < stage || pct === 100 ? "done" : ""; } i = stage; }
    $("pLabel").textContent = pct === 100 ? "All set" : labels[stage];
    if (pct < 100) setTimeout(tick, reduced() ? 10 : 45 + Math.random() * 50);
    else {
      // Reference: steps fade out (0.45s), the card alone for ~1.5s, then a hard background switch with title and buttons popping in.
      $("pDoneTitle").textContent = done.title; $("pDoneSub").textContent = done.sub;
      setTimeout(() => p.classList.add("fading"), reduced() ? 0 : 450);
      setTimeout(() => { p.classList.remove("fading"); p.classList.add("done"); }, reduced() ? 0 : 450 + 450 + 1500);
    }
  };
  tick();
}
$("btnAddGo").addEventListener("click", async () => {
  const m = parseAmt($("addAmt").value, addCcy); if (!m) { toast("Enter an amount"); return; }
  const src = $("addSource").value || "Other"; const note = $("addNote").value.trim();
  const dv = $("addDate").value; const at = dv ? new Date(dv + "T" + new Date().toTimeString().slice(0, 8)).toISOString() : new Date().toISOString();
  setBalance(addCcy, (balance(addCcy) || Money.zero(addCcy)).add(m));
  S.ledger.unshift({ kind: "add", at, ccy: addCcy, amount: m.toDecimalString(), note: note ? `${src} · ${note}` : src }); S.ledger.sort((a, b) => (a.at < b.at ? 1 : -1)); S.sel = addCcy; save();
  $("s-addcash").classList.add("leaving"); await wait(350); $("s-addcash").classList.remove("leaving");
  runProgress("Adding your cash", { grad: grad(addCcy), small: addCcy + " CASH", big: fmt(m), ink: cardInk(addCcy) }, { title: "Cash added", sub: `${addCcy} ${fmt(m)} is ready to use · balance ${fmt(balance(addCcy))}` });
});
$("btnSpendGo").addEventListener("click", () => {
  const m = parseAmt($("spAmt").value, spCcy); if (!m) { toast("Enter an amount"); return; }
  setBalance(spCcy, (balance(spCcy) || Money.zero(spCcy)).subtract(m));
  S.ledger.unshift({ kind: "spend", at: new Date().toISOString(), ccy: spCcy, amount: m.toDecimalString(), cat: spCat, note: $("spNote").value.trim() }); S.ledger = S.ledger.slice(0, 500); save(); closeSheets(); render();
  const h = toCcy(m, S.home); toast(`Recorded −${fmt(m)}${h && spCcy !== S.home ? ` ≈ ${fmt(h)}` : ""}`);
  if ($("s-home").hidden && $("s-wallet").hidden) go("home");
});
const closeProgress = () => { $("progress").hidden = true; $("progress").classList.remove("done", "fading"); };
$("btnPDone").addEventListener("click", () => { closeProgress(); if (current === "wallet") renderWallet(true); else { if (location.hash === "#wallet") { renderWallet(true); show("wallet"); } else go("wallet"); } });
$("btnPDone2").addEventListener("click", () => { closeProgress(); if (current === "addcash") go("wallet"); else route(); });
$("spCat").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; spCat = b.dataset.v; $("spCat").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); });
$("addCur").addEventListener("click", () => openPicker("any", (c) => { addCcy = c; $("addFlag").textContent = flag(c); $("addCode").textContent = c; }));
$("spCur").addEventListener("click", () => openPicker("any", (c) => { spCcy = c; $("spFlag").textContent = flag(c); $("spCode").textContent = c; }));

// ---------- sheets ----------
const SHEETS = ["sheetDone", "sheetPick", "sheetRate", "sheetHistory", "sheetSpend", "sheetMore", "sheetSplit"];
function closeSheets() { for (const id of SHEETS) $(id).hidden = true; }
function openPicker(which, onPick) {
  $("pickTitle").textContent = which === "from" ? "Convert from" : which === "to" ? "Convert to" : "Choose currency";
  const list = $("pickList"); const search = $("pickSearch");
  const cur = which === "from" ? S.from : which === "to" ? S.to : null;
  const draw = () => {
    const q = search.value.trim().toLowerCase(); list.innerHTML = "";
    for (const c of CURRENCIES.values()) {
      if (q && !(c.code.toLowerCase().includes(q) || c.name.ja.includes(q) || c.name.en.toLowerCase().includes(q))) continue;
      const li = document.createElement("li"); if (cur === c.code) li.className = "on";
      const bal = balance(c.code); li.innerHTML = `<button type="button"><span class="flag">${flag(c.code)}</span><span><span class="code">${c.code}</span><span class="name2">${esc(c.name.en)}</span></span><span class="name">${bal ? esc(fmt(bal)) : ""}</span></button>`;
      li.querySelector("button").addEventListener("click", () => {
        $("sheetPick").hidden = true;
        if (which === "from") { if (c.code === S.to) S.to = S.from; S.from = c.code; buf = ""; save(); render(); loadSeries(); }
        else if (which === "to") { if (c.code === S.from) S.from = S.to; S.to = c.code; save(); renderPair(); renderRate(); loadSeries(); }
        else onPick(c.code);
      });
      list.appendChild(li);
    }
  };
  search.value = ""; search.oninput = draw; draw(); stagger($("sheetPick").querySelector(".sheetbox")); $("sheetPick").hidden = false; setTimeout(() => search.focus(), 50);
}

// ---------- split a bill (F13) ----------
// Pure UI over packages/core split.ts: shares always sum to the total; the settlement is a proposal that REDUCES the number
// of transfers (greedy), never claimed to be the minimum (spec 02 Q-05). Nothing here touches balances or the ledger.
const spl = { ccy: "THB", total: "", people: ["Me", "A", "B"], mode: "equal", weights: {}, payer: "Me" };
function splState() { return { ...spl, weights: { ...spl.weights } }; }
function openSplit() {
  const saved = S.split; if (saved && Array.isArray(saved.people) && saved.people.length) Object.assign(spl, saved, { weights: { ...(saved.weights || {}) } }); else spl.ccy = S.sel || spl.ccy;
  if (!CURRENCIES.has(spl.ccy)) spl.ccy = S.sel; if (!spl.people.includes(spl.payer)) spl.payer = spl.people[0];
  $("splTotal").value = spl.total; $("splName").value = ""; renderSplit(); stagger($("sheetSplit").querySelector(".sheetbox")); $("sheetSplit").hidden = false; setTimeout(() => $("splTotal").focus(), 60);
}
function splitCompute() {
  const total = parseAmt(spl.total, spl.ccy); if (!total || spl.people.length === 0) return null;
  const parts = spl.people.map((id) => ({ id }));
  let res;
  try {
    if (spl.mode === "weight") { const w = spl.people.map((p) => Math.max(0, Math.floor(Number(spl.weights[p] ?? 1)) || 0)); if (w.every((x) => x === 0)) return { error: "Give at least one person a weight above 0" }; res = splitByWeight(total, parts, w); }
    else res = splitEqual(total, parts);
    const transfers = settle(res.shares, [{ payerId: spl.payer, amount: total }]);
    return { total, res, transfers };
  } catch (e) { return { error: e.message }; }
}
function renderSplit() {
  $("splFlag").textContent = flag(spl.ccy); $("splCode").textContent = spl.ccy;
  $("splPeople").innerHTML = spl.people.map((p) => `<button type="button" data-p="${esc(p)}" class="on">${esc(p)}<span class="x" aria-label="Remove">×</span></button>`).join("");
  $("splMode").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === spl.mode));
  $("splWeights").hidden = spl.mode !== "weight";
  $("splWeights").innerHTML = spl.people.map((p) => `<label>${esc(p)}<input type="number" min="0" step="1" inputmode="numeric" data-w="${esc(p)}" value="${esc(spl.weights[p] ?? 1)}"></label>`).join("");
  $("splPayer").innerHTML = spl.people.map((p) => `<button type="button" data-payer="${esc(p)}" class="${p === spl.payer ? "on" : ""}">${esc(p)}</button>`).join("");
  const out = splitCompute(); const box = $("splRes");
  if (!out) { box.innerHTML = `<div class="empty">Enter a total to see each share.</div>`; return; }
  if (out.error) { box.innerHTML = `<div class="empty">${esc(out.error)}</div>`; return; }
  const absorbed = new Set(out.res.roundingAbsorbedBy);
  box.innerHTML = `<h3>Shares · ${esc(fmt(out.total))}</h3>` + out.res.shares.map((s) => `<div class="line"><span>${esc(s.participantId)}${absorbed.has(s.participantId) ? `<small>+rounding</small>` : ""}</span><b>${esc(fmt(s.amount))}</b></div>`).join("")
    + `<h3>Proposal to reduce transfers</h3>` + (out.transfers.length ? out.transfers.map((t) => `<div class="line"><span>${esc(t.from)} → ${esc(t.to)}</span><b>${esc(fmt(t.amount))}</b></div>`).join("") : `<div class="empty">Nothing to settle: the payer's share equals the total.</div>`);
  S.split = splState(); save();
}
function splitText() {
  const out = splitCompute(); if (!out || out.error) return null;
  const lines = [`Split ${fmt(out.total)} (${spl.mode === "weight" ? "by weight" : "equally"}), paid by ${spl.payer}`, ...out.res.shares.map((s) => `  ${s.participantId}: ${fmt(s.amount)}`), "Proposal to reduce transfers (not guaranteed minimal):", ...(out.transfers.length ? out.transfers.map((t) => `  ${t.from} → ${t.to} ${fmt(t.amount)}`) : ["  nothing to settle"])];
  return lines.join("\n");
}
$("splTotal").addEventListener("input", () => { spl.total = $("splTotal").value; renderSplit(); });
$("splCur").addEventListener("click", () => openPicker("any", (c) => { spl.ccy = c; renderSplit(); $("sheetSplit").hidden = false; }));
$("splAddPerson").addEventListener("click", () => { const n = $("splName").value.trim(); if (!n) return; if (spl.people.includes(n)) { toast("Already in the list"); return; } if (spl.people.length >= 20) { toast("Up to 20 people"); return; } spl.people.push(n); $("splName").value = ""; renderSplit(); });
$("splName").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("splAddPerson").click(); } });
$("splPeople").addEventListener("click", (e) => { const b = e.target.closest("button[data-p]"); if (!b) return; if (spl.people.length <= 1) { toast("Keep at least one person"); return; } spl.people = spl.people.filter((p) => p !== b.dataset.p); delete spl.weights[b.dataset.p]; if (spl.payer === b.dataset.p) spl.payer = spl.people[0]; renderSplit(); });
$("splMode").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; spl.mode = b.dataset.v; renderSplit(); });
$("splWeights").addEventListener("input", (e) => { const i = e.target.closest("input[data-w]"); if (!i) return; spl.weights[i.dataset.w] = i.value; const out = splitCompute(); const box = $("splRes"); if (out && !out.error) { renderSplitResultOnly(out); } else if (out) box.innerHTML = `<div class="empty">${esc(out.error)}</div>`; });
function renderSplitResultOnly(out) { const absorbed = new Set(out.res.roundingAbsorbedBy); $("splRes").innerHTML = `<h3>Shares · ${esc(fmt(out.total))}</h3>` + out.res.shares.map((s) => `<div class="line"><span>${esc(s.participantId)}${absorbed.has(s.participantId) ? `<small>+rounding</small>` : ""}</span><b>${esc(fmt(s.amount))}</b></div>`).join("") + `<h3>Proposal to reduce transfers</h3>` + (out.transfers.length ? out.transfers.map((t) => `<div class="line"><span>${esc(t.from)} → ${esc(t.to)}</span><b>${esc(fmt(t.amount))}</b></div>`).join("") : `<div class="empty">Nothing to settle.</div>`); S.split = splState(); save(); }
$("splPayer").addEventListener("click", (e) => { const b = e.target.closest("button[data-payer]"); if (!b) return; spl.payer = b.dataset.payer; renderSplit(); });
$("btnSplitShare").addEventListener("click", async () => { const text = splitText(); if (!text) { toast("Enter a total first"); return; } if (navigator.share) { try { await navigator.share({ title: "Split", text }); return; } catch {} } try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Could not share"); } });
$("btnSplitSpend").addEventListener("click", () => { const out = splitCompute(); if (!out || out.error) { toast("Enter a total first"); return; } closeSheets(); openSpend(spl.ccy); $("spAmt").value = out.total.toDecimalString(); $("spNote").value = `Split: ${spl.people.join(", ")}`; });

// ---------- onboarding ----------
async function leaveOnboarding(demo) {
  S.onboarded = true; booting = false;
  if (demo) {
    S.home = "JPY"; S.sel = "THB"; S.from = "JPY"; S.to = "THB";
    S.balances = { JPY: "48000", THB: "9870.00", USD: "120.00" }; S.mine = { "JPY/THB": { paid: "100000", received: "22500", at: new Date(Date.now() - 2 * 864e5).toISOString() } };
    const t = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    S.ledger = [{ kind: "spend", at: t(2), ccy: "THB", amount: "180.00", cat: "food", note: "Pad kra pao" }, { kind: "spend", at: t(5), ccy: "THB", amount: "95.00", cat: "transport", note: "BTS Skytrain" }, { kind: "spend", at: t(26), ccy: "THB", amount: "1250.00", cat: "shop", note: "Terminal 21" }, { kind: "spend", at: t(30), ccy: "THB", amount: "320.00", cat: "food", note: "Somboon Seafood" }, { kind: "spend", at: t(52), ccy: "USD", amount: "80.00", cat: "stay", note: "Hostel" }, { kind: "add", at: t(50), ccy: "THB", amount: "22500.00", note: "Exchange booth" }];
    S.history = [];
  }
  save();
  const ob = $("s-onboard");
  if (reduced()) { ob.classList.remove("play", "still"); ob.hidden = true; location.hash = "home"; route(); return; }
  ob.classList.add("leaving"); await wait(550);
  location.hash = "home"; route(); // home enters underneath while the onboarding blurs out on top
  await wait(650);
  ob.hidden = true; ob.classList.remove("leaving", "play", "still");
}
function buildBurst() {
  const svg = $("burst"); let d = "";
  for (let i = 0; i < 46; i++) { const a = (i / 46) * Math.PI * 2 + (i % 3) * 0.07; const r0 = 60 + (i % 5) * 22, r1 = r0 + 90 + (i % 4) * 40; d += `<path d="M${(200 + Math.cos(a) * r0).toFixed(1)},${(400 + Math.sin(a) * r0).toFixed(1)} L${(200 + Math.cos(a) * r1).toFixed(1)},${(400 + Math.sin(a) * r1).toFixed(1)}" style="animation-delay:${(i % 7) * 25}ms"/>`; }
  svg.innerHTML = d;
}
$("btnStart").addEventListener("click", () => leaveOnboarding(false));
$("btnStartDemo").addEventListener("click", () => leaveOnboarding(true));

// ---------- events ----------
$("pad").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) key(b.dataset.k); });
window.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT" || $("s-convert").hidden) return; if (/^[0-9.]$/.test(e.key)) key(e.key); else if (e.key === "Backspace") key("⌫"); else if (e.key === "Enter") doConvert(); else if (e.key === "Escape") closeSheets(); });
$("btnFrom").addEventListener("click", () => openPicker("from"));
$("btnTo").addEventListener("click", () => openPicker("to"));
$("btnSwap").addEventListener("click", () => {
  const sw = $("btnSwap"); sw.classList.toggle("turn");
  [S.from, S.to] = [S.to, S.from];
  if (currency(S.from).scale === 0) buf = buf.split(".")[0]; else { const fr = buf.split(".")[1]; if (fr && fr.length > currency(S.from).scale) buf = buf.split(".")[0] + "." + fr.slice(0, currency(S.from).scale); }
  save();
  renderPair(true); renderRate(); loadSeries();
});
$("btnMax").addEventListener("click", () => { const b = balance(S.from); if (b) { buf = b.toDecimalString().replace(/\.0+$/, ""); renderPair(); } });
$("btnConvert").addEventListener("click", doConvert);
$("btnDone").addEventListener("click", () => { closeSheets(); go("home"); });
$("btnMore").addEventListener("click", closeSheets);
$("btnReceipt").addEventListener("click", async () => { if (!lastTx) return closeSheets(); $("sheetDone").classList.add("closing"); $("s-convert").classList.add("blurout"); await wait(380); closeSheets(); $("sheetDone").classList.remove("closing"); showReceipt(lastTx); });
$("btnReceiptBack").addEventListener("click", () => { printToken++; route(); });
$("btnReceiptDone").addEventListener("click", () => { printToken++; go("home"); });
$("btnReceiptShare").addEventListener("click", async () => { if (!lastTx) return; const text = `${lastTx.kind === "exchange" ? "Exchange record" : lastTx.kind === "simulation" ? "Simulation (no money moved)" : "Legacy conversion"}\n${lastTx.fromText} → ${lastTx.toText}\n${lastTx.rateText}\n${lastTx.source}\n${lastTx.ref}`; if (navigator.share) { try { await navigator.share({ title: "Exchange receipt", text }); return; } catch {} } try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Could not share"); } });
const openRate = () => { renderRateSheet(); $("sheetRate").hidden = false; };
$("periods").addEventListener("click", async (e) => { const b = e.target.closest("button[data-p]"); if (!b) return; S.period = b.dataset.p; save(); $("periods").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); await loadSeries(); renderRateSheet(); });
$("rateRow").addEventListener("click", openRate); $("btnRates").addEventListener("click", openRate); $("btnRatesHome").addEventListener("click", openRate); $("btnTabRate").addEventListener("click", openRate);
$("btnHistory").addEventListener("click", () => { renderHistory(); stagger($("sheetHistory").querySelector(".sheetbox")); $("sheetHistory").hidden = false; });
$("btnHistClear").addEventListener("click", () => { if (!S.history.length || !confirm(`Delete ${S.history.length} conversion notes? Recorded exchanges stay in Transactions and balances are not affected.`)) return; S.history = []; save(); renderHistory(); });
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheets));
for (const id of SHEETS) $(id).addEventListener("click", (e) => { if (e.target.id === id) closeSheets(); });
$("btnSetMine").addEventListener("click", () => { const paid = $("inPaid").value.trim(), got = $("inGot").value.trim(); try { realizedRate(parseDec(paid), parseDec(got), { base: S.from, quote: S.to, at: new Date().toISOString(), receivedAt: new Date().toISOString() }); } catch { toast("Enter both amounts"); return; } S.mine[`${S.from}/${S.to}`] = { paid, received: got, at: new Date().toISOString() }; save(); closeSheets(); render(); toast("Converting at your rate"); });
$("btnClearMine").addEventListener("click", () => { delete S.mine[`${S.from}/${S.to}`]; save(); closeSheets(); render(); });
$("btnHomeCcy").addEventListener("click", () => openPicker("any", (c) => { S.home = c; save(); renderRateSheet(); render(); }));
$("btnRecordReal").addEventListener("click", async () => { const tx = recordExchange(lastTx); if (!tx) return; $("sheetDone").classList.add("closing"); $("s-convert").classList.add("blurout"); await wait(380); closeSheets(); $("sheetDone").classList.remove("closing"); toast("Exchange recorded"); showReceipt(tx); });
$("motionChips").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; S.motion = b.dataset.v; save(); applyMotion(); renderRateSheet(); });
motionMq.addEventListener("change", applyMotion);
$("btnExport").addEventListener("click", exportState);
$("btnImport").addEventListener("click", () => { $("importFile").value = ""; $("importFile").click(); });
$("importFile").addEventListener("change", () => { const f = $("importFile").files[0]; if (f) importStateFile(f); });
$("ticker").addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (b) { S.sel = b.dataset.c; save(); renderHome(); } });
$("miniCards").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; if (b.id === "mcAdd") openPicker("any", (c) => { if (!S.balances[c]) S.balances[c] = Money.zero(c).toDecimalString(); S.sel = c; save(); renderHome(); openAdd(c); }); else { S.sel = b.dataset.c; save(); renderHome(); } });
$("qAdd").addEventListener("click", () => openAdd(S.sel)); $("qSpend").addEventListener("click", () => openSpend(S.sel)); $("qConvert").addEventListener("click", () => { S.to = S.sel === S.home ? S.to : S.sel; S.from = S.home === S.sel ? S.from : S.home; save(); go("convert"); loadSeries(); }); $("qMore").addEventListener("click", () => { stagger($("sheetMore").querySelector(".sheetbox")); $("sheetMore").hidden = false; });
$("btnMoreSplit").addEventListener("click", () => { closeSheets(); openSplit(); });
$("btnMoreHistory").addEventListener("click", () => { closeSheets(); $("btnHistory").click(); });
$("btnMoreCards").addEventListener("click", () => { closeSheets(); go("wallet"); });
$("btnMoreSettings").addEventListener("click", () => { closeSheets(); openRate(); });
$("btnAllTx").addEventListener("click", () => { const body = $("s-home"); body.scrollTo({ top: $("txcard").offsetTop + $("txcard").offsetHeight - 8, behavior: reduced() ? "auto" : "smooth" }); });
$("btnSearch").addEventListener("click", () => openPicker("any", (c) => { S.sel = c; if (!S.balances[c]) S.balances[c] = Money.zero(c).toDecimalString(); save(); renderHome(); }));
$("btnBell").addEventListener("click", () => toast("No notifications yet"));
$("btnWAdd").addEventListener("click", () => openAdd(S.sel)); $("btnWSpend").addEventListener("click", () => openSpend(S.sel));
$("btnWalletAdd").addEventListener("click", () => openPicker("any", (c) => { if (!S.balances[c]) S.balances[c] = Money.zero(c).toDecimalString(); S.sel = c; save(); renderWallet(); openAdd(c); }));
function renderHistory() { const ul = $("histList"); ul.innerHTML = ""; $("histEmpty").hidden = S.history.length > 0; for (const h of S.history) { const li = document.createElement("li"); li.innerHTML = `<div class="flags2"><span class="flag">${flag(h.from)}</span><span class="flag">${flag(h.to)}</span></div><div><div>${esc(h.from)} → ${esc(h.to)} <small class="kind">${h.kind === "exchange" ? "recorded" : h.kind === "simulation" ? "simulation" : "legacy"}</small></div><div class="t">${dateTime(h.at)}</div></div><div class="a">${esc(h.toText)}<small>for ${esc(h.fromText)}</small></div>`; li.addEventListener("click", () => { closeSheets(); showReceipt(h); }); ul.appendChild(li); } }
let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200); }
window.addEventListener("resize", () => { moveTabHl(); const on = $("ticker").querySelector("button.on"); if (on) { $("tkhl").style.left = on.offsetLeft + "px"; $("tkhl").style.width = on.offsetWidth + "px"; } });

// ---------- boot ----------
// Splash plays on every cold open (as in the reference). Returning users skip the copy and land on home after the bands.
buildBurst();
applyMotion();
const ob = $("s-onboard"); ob.classList.add("play"); if (S.onboarded) ob.classList.add("auto");
route();
if (S.onboarded) { if (reduced()) leaveOnboarding(false); else setTimeout(() => leaveOnboarding(false), 2150); }
if (loadNote) setTimeout(() => toast(loadNote), reduced() ? 300 : 3200);
loadRates();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});

// Currency Intelligence — web client. Money math lives in ./core (packages/core); this file renders.
import {
  Money, MoneyError, CURRENCIES, currency, convert, invert, cross, realizedRate, spreadPercent,
  parseDec, RateCache, OpenErApiProvider, FrankfurterProvider,
} from "./core/index.js";

const STORE_KEY = "ci.v3";
const TTL_MS = 6 * 60 * 60 * 1000;
const CROSS_TOLERANCE_MS = 36 * 60 * 60 * 1000;
const PIVOT = "USD";
const ROUNDING = "HALF_EVEN";
const SERIES_DAYS = 30;

const FLAG_CC = { JPY:"JP", THB:"TH", USD:"US", EUR:"EU", GBP:"GB", KRW:"KR", TWD:"TW", CNY:"CN", HKD:"HK", SGD:"SG", MYR:"MY", IDR:"ID", PHP:"PH", VND:"VN", LAK:"LA", KHR:"KH", MMK:"MM", INR:"IN", AUD:"AU", NZD:"NZ", CAD:"CA", CHF:"CH", SEK:"SE", NOK:"NO", DKK:"DK", CZK:"CZ", PLN:"PL", HUF:"HU", ISK:"IS", TRY:"TR", AED:"AE", SAR:"SA", KWD:"KW", BHD:"BH", OMR:"OM", JOD:"JO", MXN:"MX", BRL:"BR", CLP:"CL", ZAR:"ZA", EGP:"EG", LKR:"LK", NPR:"NP" };
const flag = (code) => { const cc = FLAG_CC[code]; return cc ? [...cc].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("") : "¤"; };
const CARD_GRAD = { JPY:"linear-gradient(135deg,#E8505B,#8E2B5A)", THB:"linear-gradient(135deg,#3F7BFF,#1D3FB8)", USD:"linear-gradient(135deg,#2E9E6B,#114D3C)", EUR:"linear-gradient(135deg,#4C6FFF,#2A2F8F)", KRW:"linear-gradient(135deg,#6B7CFF,#3B2A8F)", TWD:"linear-gradient(135deg,#1FA5B8,#154E78)", VND:"linear-gradient(135deg,#E0433C,#7A1E1E)", GBP:"linear-gradient(135deg,#5B5BD6,#1E1E5A)", AUD:"linear-gradient(135deg,#F2A541,#B8541E)", SGD:"linear-gradient(135deg,#E64C4C,#5A1E2E)" };
const grad = (c) => CARD_GRAD[c] || "linear-gradient(135deg,#5BA7FF,#3B5BDB 60%,#2A3F9E)";
const CATS = [["food","食事","var(--c-food)","🍜"],["transport","交通","var(--c-transport)","🚕"],["shop","買い物","var(--c-shop)","🛍️"],["stay","宿","var(--c-stay)","🏨"],["fun","娯楽","var(--c-fun)","🎟️"],["other","その他","var(--c-other)","•"]];
const catOf = (id) => CATS.find((c) => c[0] === id) || CATS[5];

const EMBEDDED = { observedAt: "2026-10-27T00:00:00Z", rates: { USD:1, JPY:150.12, THB:33.47, EUR:0.9201, GBP:0.7742, KRW:1378.5, TWD:32.18, CNY:7.18, HKD:7.79, SGD:1.336, MYR:4.42, IDR:16080, PHP:57.1, VND:25410, LAK:21900, KHR:4080, MMK:2100, INR:84.1, AUD:1.512, NZD:1.66, CAD:1.372, CHF:0.879, SEK:10.6, NOK:10.9, DKK:6.86, CZK:23.2, PLN:3.98, HUF:372, ISK:138, TRY:34.2, AED:3.6725, SAR:3.75, KWD:0.3066, BHD:0.376, OMR:0.3845, JOD:0.709, MXN:19.6, BRL:5.62, CLP:940, ZAR:17.9, EGP:48.6, LKR:299, NPR:134.6 } };

// ---------- state ----------
function defaults() { return { onboarded: false, home: "JPY", sel: "THB", from: "JPY", to: "THB", balances: {}, mine: {}, history: [], ledger: [], rateCache: null, series: {} }; }
function load() { try { const r = localStorage.getItem(STORE_KEY); if (r) return { ...defaults(), ...JSON.parse(r) }; } catch {} return defaults(); }
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch {} }
let S = load();

const store = {
  async get(key) { return S.rateCache && S.rateCache.key === key ? S.rateCache.quotes : undefined; },
  async set(key, quotes) { S.rateCache = { key, quotes }; save(); },
};
const f = (u, i) => fetch(u, i);
const providers = [new OpenErApiProvider({ fetch: f }), new FrankfurterProvider({ fetch: f })];
const caches = providers.map((p) => new RateCache(p, { ttlMs: TTL_MS, store }));
let pivot = [];
let rate = { status: "loading", source: "", error: "" };

function embeddedQuotes() {
  const now = new Date().toISOString();
  return Object.entries(EMBEDDED.rates).filter(([c]) => c !== PIVOT && CURRENCIES.has(c)).map(([c, r]) => ({
    quoteId: `embedded:${PIVOT}${c}:${EMBEDDED.observedAt}`, base: PIVOT, quote: c, rate: String(r), source: "embedded",
    observedAt: EMBEDDED.observedAt, receivedAt: now, rateKind: "indicative", confidence: "estimated", granularity: "daily",
    notes: ["アプリに同梱された参考値。通信できると置き換わります"],
  }));
}
async function loadRates() {
  const symbols = [...CURRENCIES.keys()].filter((c) => c !== PIVOT);
  let lastErr = null;
  for (const cache of caches) {
    try {
      const r = await cache.resolve(PIVOT, symbols);
      pivot = r.quotes; rate = { status: r.status, source: r.source, error: r.error || "" }; render();
      if (r.revalidation) { const fresh = await r.revalidation; if (fresh) { pivot = fresh; rate = { status: "fresh", source: r.source, error: "" }; render(); } }
      loadSeries(); return;
    } catch (e) { lastErr = e; }
  }
  pivot = embeddedQuotes(); rate = { status: "embedded", source: "embedded", error: lastErr ? String(lastErr.message || lastErr) : "" }; render();
}
let series = null;
async function loadSeries() {
  const key = `${S.from}/${S.to}`; series = null; renderRate();
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
    else { const q = marketQuote(S.from, S.to); if (q) { const today = q.observedAt.slice(0, 10); const arr = (S.series[key] || []).filter((p) => p.date !== today); arr.push({ date: today, rate: Number(q.rate) }); S.series[key] = arr.slice(-SERIES_DAYS); save(); series = arr.length >= 2 ? arr : null; } }
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
/** Money in `to` currency, or null when no rate. */
function toCcy(m, to) {
  if (m.currency === to) return m;
  const q = quoteBetween(m.currency, to);
  if (!q) return null;
  try { return convert(m, q.quote, { rounding: ROUNDING }).convertedAmount; } catch { return null; }
}

// ---------- formatting ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (m) => m.format("en-US");
function groupDigits(s) { const [i, fr] = s.split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fr !== undefined ? "." + fr : ""); }
function rateStr(r) { const n = Number(r); return n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(5); }
function dateJa(iso) { return new Date(iso).toLocaleDateString("ja-JP", { month: "short", day: "numeric" }); }
function balance(code) { const b = S.balances[code]; if (b === undefined) return null; try { return Money.of(b, code); } catch { return null; } }
function setBalance(code, m) { S.balances[code] = m.toDecimalString(); }
function parseAmt(txt, code) { const t = txt.trim().replace(/,/g, ""); if (!t) return null; try { const m = Money.of(t, code, "DOWN"); return m.isPositive() ? m : null; } catch { return null; } }
function sourceLabel(q) {
  if (!q) return "";
  if (q.source === "user") return "自分レート";
  if (q.source === "embedded") return `同梱の参考値 · ${dateJa(q.observedAt)}`;
  if (q.source === "frankfurter") return `ECB参考レート · ${dateJa(q.observedAt)}`;
  return `参考レート · ${dateJa(q.observedAt)}`;
}
function walletCcys() { const set = new Set([...Object.keys(S.balances), S.sel]); return [...set].filter((c) => CURRENCIES.has(c)); }

// ---------- routing ----------
const SCREENS = ["onboard", "home", "convert", "wallet", "receipt"];
function show(name) {
  for (const s of SCREENS) $("s-" + s).hidden = s !== name;
  document.body.classList.toggle("night", name === "home" || name === "onboard");
  const tabs = ["home", "convert", "wallet"].includes(name);
  $("tabbar").hidden = !tabs;
  for (const s of SCREENS) $("s-" + s).classList.toggle("has-tabs", tabs && s === name);
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === name));
}
function route() {
  if (!S.onboarded) { show("onboard"); return; }
  const h = (location.hash || "#home").slice(1);
  const name = ["home", "convert", "wallet"].includes(h) ? h : "home";
  show(name);
  if (name === "home") renderHome();
  if (name === "wallet") renderWallet();
  if (name === "convert") { renderPair(); renderRate(); }
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

// ---------- render: convert ----------
function renderPair() {
  $("flagFrom").textContent = flag(S.from); $("codeFrom").textContent = S.from;
  $("flagTo").textContent = flag(S.to); $("codeTo").textContent = S.to;
  const bf = balance(S.from), bt = balance(S.to);
  $("balFrom").textContent = bf ? `残高 ${fmt(bf)}` : "残高 未設定";
  $("balTo").textContent = bt ? `残高 ${fmt(bt)}` : "";
  $("btnMax").hidden = !bf || !bf.isPositive();
  const amount = inputMoney(); const sym = currency(S.from).symbol;
  const a = $("amtFrom"); a.className = "amt num " + (buf ? "input" : "placeholder"); a.textContent = buf ? sym + groupDigits(buf) : fmt(Money.zero(S.from));
  const aq = activeQuote(); const t = $("amtTo");
  if (aq && !amount.isZero()) { try { t.textContent = fmt(convert(amount, aq.quote, { rounding: ROUNDING }).convertedAmount); t.className = "amt num " + (aq.mine ? "mine" : "input"); } catch { t.textContent = "—"; t.className = "amt num placeholder"; } }
  else { t.textContent = fmt(Money.zero(S.to)); t.className = "amt num placeholder"; }
  $("btnConvert").disabled = amount.isZero() || !aq;
  $("ctaText").textContent = amount.isZero() ? "金額を入れてください" : !aq ? "レートがありません" : `Convert ${fmt(amount)}`;
}
function sparkPath(pts, w, h) {
  const vals = pts.map((p) => p.rate); const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1;
  return pts.map((p, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * w},${h - 3 - ((p.rate - min) / span) * (h - 6)}`).join(" ");
}
function renderRate() {
  const aq = activeQuote(); const mk = marketQuote(S.from, S.to);
  const dot = $("rateDot"); const chip = $("rateChip"); const sp = $("spark");
  if (!aq) { $("rateMain").textContent = "—"; $("rateSub").textContent = rate.status === "loading" ? "レート取得中…" : "この通貨ペアのレートがありません"; dot.className = "dot error"; chip.textContent = "—"; chip.className = "chip grey"; sp.innerHTML = ""; return; }
  $("rateMain").textContent = `1 ${S.from} = ${rateStr(aq.quote.rate)} ${S.to}`;
  let sub = sourceLabel(aq.quote); if (rate.status === "stale" || rate.status === "offline") sub += " · 古い";
  $("rateSub").textContent = sub;
  dot.className = "dot " + (rate.status === "fresh" ? "" : rate.status === "error" ? "error" : "stale");
  if (aq.mine && mk) { const sp2 = spreadPercent(mk, aq.quote); const worse = !sp2.startsWith("-"); chip.textContent = `${worse ? "−" : "+"}${sp2.replace("-", "")}% vs 市場`; chip.className = "chip " + (worse ? "red" : "green"); }
  else if (series && series.length >= 2) { const a = series[0].rate, b = series[series.length - 1].rate; const ch = ((b - a) / a) * 100; chip.textContent = `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%`; chip.className = "chip " + (ch >= 0 ? "green" : "red"); }
  else { chip.textContent = aq.quote.confidence === "estimated" ? "参考" : "確定"; chip.className = "chip grey"; }
  if (series && series.length >= 2) { const up = series[series.length - 1].rate >= series[0].rate; sp.className.baseVal = "spark " + (up ? "" : "down"); sp.innerHTML = `<path d="${sparkPath(series, 100, 32)}"/>`; }
  else { sp.className.baseVal = "spark flat"; sp.innerHTML = `<path d="M0,16 L100,16" stroke-dasharray="3 3"/>`; }
}
function renderRateSheet() {
  const aq = activeQuote(); const mk = marketQuote(S.from, S.to);
  $("rhMain").textContent = aq ? `1 ${S.from} = ${rateStr(aq.quote.rate)} ${S.to}` : "—";
  $("rhSub").textContent = aq ? `${sourceLabel(aq.quote)}${mk && aq.mine ? ` · 市場 ${rateStr(mk.rate)}` : ""}` : "";
  const big = $("bigSpark"); const legend = $("sparkLegend");
  if (series && series.length >= 2) { const up = series[series.length - 1].rate >= series[0].rate; big.className.baseVal = "bigspark " + (up ? "" : "down"); big.innerHTML = `<path d="${sparkPath(series, 320, 90)}"/>`; legend.innerHTML = `<span>${esc(series[0].date)}</span><span>${SERIES_DAYS}日 · 日次参考レート。リアルタイムではありません</span><span>${esc(series[series.length - 1].date)}</span>`; }
  else { big.className.baseVal = "bigspark flat"; big.innerHTML = `<path d="M0,45 L320,45" stroke-dasharray="4 4"/>`; legend.innerHTML = `<span></span><span>履歴は通信できる環境で取得されます(日次)</span><span></span>`; }
  const q = aq ? aq.quote : null;
  const rows = q ? [
    ["出典", q.source === "user" ? "あなたの両替レシート" : q.source === "embedded" ? "アプリ同梱の参考値" : `${q.source}(${providers.find((p) => p.id === q.source)?.description || ""})`],
    ["種別", `${q.rateKind} · ${q.confidence === "confirmed" ? "確定" : "推定"}`],
    ["観測", new Date(q.observedAt).toLocaleString("ja-JP")], ["取得", new Date(q.receivedAt).toLocaleString("ja-JP")],
    ["期限", q.expiresAt ? new Date(q.expiresAt).toLocaleString("ja-JP") : "提供元の明示なし"],
    ["計算", q.derivedFrom ? `USD経由のクロスレート · 丸め ${ROUNDING}` : `丸め ${ROUNDING}`],
  ] : [["状態", "レート未取得"]];
  if (q && q.notes?.some((n) => n.includes("skew"))) rows.push(["注意", "2つの観測時刻がずれているため推定扱い"]);
  $("provRows").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("lblPaid").textContent = `払った(${S.from})`; $("lblGot").textContent = `受け取った(${S.to})`;
  const m = S.mine[`${S.from}/${S.to}`]; $("inPaid").value = m ? m.paid : ""; $("inGot").value = m ? m.received : "";
  $("mineNote").textContent = m ? `設定日時 ${new Date(m.at).toLocaleString("ja-JP")}。市場中値との差はチップに表示されます。` : "両替所で 10万円 → 22,500バーツ なら、100000 と 22500。";
  $("homeCcyFlag").textContent = flag(S.home); $("homeCcyCode").textContent = S.home;
}

// ---------- render: home ----------
function weekSpend() {
  const since = Date.now() - 7 * 864e5; const byCat = {}; let total = Money.zero(S.home); let unconverted = 0;
  for (const e of S.ledger) {
    if (e.kind !== "spend" || Date.parse(e.at) < since) continue;
    const m = toCcy(Money.of(e.amount, e.ccy), S.home);
    if (!m) { unconverted++; continue; }
    total = total.add(m); byCat[e.cat] = (byCat[e.cat] || Money.zero(S.home)).add(m);
  }
  return { total, byCat, unconverted };
}
function renderHome() {
  const ccys = walletCcys(); if (!ccys.includes(S.sel)) S.sel = ccys[0] || S.to;
  $("ticker").innerHTML = ccys.map((c) => { const b = balance(c) || Money.zero(c); return `<button type="button" data-c="${c}" class="${c === S.sel ? "on" : ""}"><span class="flag">${flag(c)}</span><span><b>${c}</b><span>${esc(b.format("en-US", { style: "decimal" }))}</span></span></button>`; }).join("");
  const sel = balance(S.sel) || Money.zero(S.sel);
  $("homeBal").textContent = fmt(sel);
  const h = S.sel === S.home ? null : toCcy(sel, S.home);
  $("homeSub").textContent = h ? `≈ ${fmt(h)}${S.mine[`${S.sel}/${S.home}`] ? "(自分レート)" : ""}` : S.sel === S.home ? "基準通貨" : "基準通貨への換算レートがありません";
  $("miniCards").innerHTML = ccys.map((c) => `<button type="button" class="mc ${c === S.sel ? "on" : ""}" data-c="${c}" style="background:${grad(c)}">${flag(c)}</button>`).join("") + `<button type="button" class="mc add" id="mcAdd" aria-label="通貨を追加"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>`;
  const w = weekSpend();
  $("weekTotal").textContent = fmt(w.total) + (w.unconverted ? " +?" : "");
  const parts = Object.entries(w.byCat).sort((a, b) => b[1].compareTo(a[1]));
  const tot = Number(w.total.toDecimalString()) || 1;
  $("catBar").innerHTML = parts.length ? parts.map(([id, m]) => `<i style="width:${Math.max(2, (Number(m.toDecimalString()) / tot) * 100)}%;background:${catOf(id)[2]}"></i>`).join("") : `<i style="width:100%;background:var(--box)"></i>`;
  $("catLegend").innerHTML = parts.length ? parts.map(([id, m]) => `<span style="--c:${catOf(id)[2]}">${catOf(id)[1]} <b>${esc(fmt(m))}</b></span>`).join("") : `<span style="--c:var(--faint)">支払いを記録すると内訳が出ます</span>`;
  // list
  const list = $("txList"); list.innerHTML = ""; $("txEmpty").hidden = S.ledger.length > 0;
  const groups = new Map();
  for (const e of S.ledger.slice(0, 40)) { const d = new Date(e.at); const k = d.toDateString(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const today = new Date().toDateString(), yest = new Date(Date.now() - 864e5).toDateString();
  for (const [k, items] of groups) {
    const label = k === today ? "今日" : k === yest ? "昨日" : new Date(items[0].at).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
    let dayTotal = Money.zero(S.home); let miss = false;
    for (const e of items) { if (e.kind !== "spend") continue; const m = toCcy(Money.of(e.amount, e.ccy), S.home); if (m) dayTotal = dayTotal.add(m); else miss = true; }
    const g = document.createElement("div"); g.className = "txgroup"; g.innerHTML = `<span>${esc(label)}</span><b>${dayTotal.isZero() && !miss ? "" : "−" + esc(fmt(dayTotal)) + (miss ? " +?" : "")}</b>`; list.appendChild(g);
    for (const e of items) {
      const el = document.createElement("div"); el.className = "tx";
      const m = Money.of(e.amount, e.ccy); const sub = e.ccy !== S.home ? toCcy(m, S.home) : null;
      if (e.kind === "spend") { const c = catOf(e.cat); el.innerHTML = `<div class="av" style="--c:${c[2]}">${c[3]}</div><div class="t"><b>${esc(e.note || c[1])}</b><span>${c[1]} · ${e.ccy} 現金</span></div><div class="a">−${esc(fmt(m))}${sub ? `<span>≈ ${esc(fmt(sub))}</span>` : ""}</div>`; }
      else if (e.kind === "add") { el.innerHTML = `<div class="av" style="--c:#1E7F4F"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div><div class="t"><b>現金を追加</b><span>${esc(e.note || "")} · ${e.ccy}</span></div><div class="a pos">+${esc(fmt(m))}${sub ? `<span>≈ ${esc(fmt(sub))}</span>` : ""}</div>`; }
      else { el.innerHTML = `<div class="av conv"><svg viewBox="0 0 24 24"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg></div><div class="t"><b>両替 ${esc(e.from)} → ${esc(e.to)}</b><span>${esc(e.rateText)}</span></div><div class="a pos">+${esc(e.toText)}<span>−${esc(e.fromText)}</span></div>`; el.addEventListener("click", () => { const tx = S.history.find((h) => h.ref === e.ref); if (tx) showReceipt(tx); }); }
      list.appendChild(el);
    }
  }
}

// ---------- render: wallet ----------
function renderWallet() {
  const ccys = walletCcys(); if (!ccys.includes(S.sel)) S.sel = ccys[0];
  const car = $("carousel");
  car.innerHTML = ccys.map((c) => { const b = balance(c) || Money.zero(c); const meta = currency(c); return `<div class="card3d ${c === S.sel ? "on" : ""}" data-c="${c}" style="background:${grad(c)}"><div class="top"><span class="flag">${flag(c)}</span><span class="kind">${c} CASH</span></div><div class="chipw"><i></i><svg viewBox="0 0 24 24"><path d="M5 9a9 9 0 0 1 14 0M8 12a5 5 0 0 1 8 0M11 15a1.5 1.5 0 0 1 2 0"/></svg></div><div class="numline">${esc(b.format("en-US"))}</div><div class="bottom"><span><small>CURRENCY</small><b>${esc(meta.name.en.toUpperCase())}</b></span><span><small>HOLDER</small><b>TRAVELLER</b></span></div></div>`; }).join("");
  $("dots").innerHTML = ccys.map((c) => `<i class="${c === S.sel ? "on" : ""}"></i>`).join("");
  const b = balance(S.sel) || Money.zero(S.sel);
  $("wBal").textContent = fmt(b);
  const h = S.sel === S.home ? null : toCcy(b, S.home);
  $("wSub").textContent = h ? `≈ ${fmt(h)}` : "";
  const since = Date.now() - 7 * 864e5;
  let spent = Money.zero(S.sel), added = Money.zero(S.sel), got = Money.zero(S.sel);
  for (const e of S.ledger) { if (e.kind === "spend" && e.ccy === S.sel && Date.parse(e.at) >= since) spent = spent.add(Money.of(e.amount, e.ccy)); if (e.kind === "add" && e.ccy === S.sel) added = added.add(Money.of(e.amount, e.ccy)); if (e.kind === "convert" && e.to === S.sel) got = got.add(Money.of(e.toAmt, e.to)); }
  const m = S.mine[`${S.home}/${S.sel}`];
  $("wRows").innerHTML = [["残高", fmt(b)], ["今週の支出", fmt(spent)], ["追加した現金", fmt(added)], ["両替で得た額", fmt(got)], ["自分レート", m ? `1 ${S.home} = ${rateStr(Number(m.received) / Number(m.paid))} ${S.sel}` : "未設定"]].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  const onEl = car.querySelector(".card3d.on"); if (onEl) onEl.scrollIntoView({ inline: "center", block: "nearest" });
}
let carT;
$("carousel").addEventListener("scroll", () => { clearTimeout(carT); carT = setTimeout(() => { const car = $("carousel"); const mid = car.scrollLeft + car.clientWidth / 2; let best = null, bd = 1e9; for (const el of car.children) { const c = el.offsetLeft + el.offsetWidth / 2; const d = Math.abs(c - mid); if (d < bd) { bd = d; best = el; } } if (best && best.dataset.c !== S.sel) { S.sel = best.dataset.c; save(); renderWallet(); } }, 80); });

function render() { if (!$("s-convert").hidden) { renderPair(); renderRate(); } if (!$("s-home").hidden) renderHome(); if (!$("s-wallet").hidden) renderWallet(); }

// ---------- convert flow ----------
let lastTx = null;
function doConvert() {
  const amount = inputMoney(); const aq = activeQuote(); if (amount.isZero() || !aq) return;
  const r = convert(amount, aq.quote, { rounding: ROUNDING });
  const bf = balance(S.from), bt = balance(S.to);
  const newFrom = bf ? bf.subtract(amount) : null; const newTo = (bt || Money.zero(S.to)).add(r.convertedAmount);
  if (newFrom) setBalance(S.from, newFrom); setBalance(S.to, newTo);
  const ref = "EXC-" + Math.random().toString(36).slice(2, 7).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const at = new Date().toISOString();
  const tx = { at, ref, from: S.from, to: S.to, fromAmt: amount.toDecimalString(), toAmt: r.convertedAmount.toDecimalString(), fromText: fmt(amount), toText: fmt(r.convertedAmount), rate: aq.quote.rate, rateText: `1 ${S.from} = ${rateStr(aq.quote.rate)} ${S.to}`, source: sourceLabel(aq.quote), sourceId: aq.quote.source, rateKind: aq.quote.rateKind, confidence: aq.quote.confidence, observedAt: aq.quote.observedAt, mine: aq.mine, rounding: ROUNDING, balFrom: newFrom ? fmt(newFrom) : null, balTo: fmt(newTo) };
  S.history.unshift(tx); S.history = S.history.slice(0, 100);
  S.ledger.unshift({ kind: "convert", at, ref, from: S.from, to: S.to, fromText: tx.fromText, toText: tx.toText, toAmt: tx.toAmt, rateText: tx.rateText }); S.ledger = S.ledger.slice(0, 500);
  save(); lastTx = tx; buf = ""; render();
  $("doneRate").textContent = tx.rateText + (tx.mine ? "(自分レート)" : "");
  $("dFlagFrom").textContent = flag(tx.from); $("dFromLbl").textContent = `From ${tx.from}`; $("dFromAmt").textContent = "−" + tx.fromText;
  $("dFlagTo").textContent = flag(tx.to); $("dToLbl").textContent = `To ${tx.to}`; $("dToAmt").textContent = "+" + tx.toText;
  $("doneBals").innerHTML = [[tx.from, tx.balFrom ?? "未設定"], [tx.to, tx.balTo]].map(([c, v]) => `<dt><span class="flag">${flag(c)}</span>${c} 残高</dt><dd>${esc(v)}</dd>`).join("");
  $("sheetDone").hidden = false;
}
function barcodeFor(ref) { let h = 2166136261; const bars = []; for (let i = 0; i < 120; i++) { h ^= ref.charCodeAt(i % ref.length) + i; h = Math.imul(h, 16777619) >>> 0; bars.push(h & 1); } let x = 0, out = ""; for (const b of bars) { const w = 1 + ((x * 7) % 3) * 0.4; if (b) out += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="40"/>`; x += w + 0.4; } return out; }
function showReceipt(tx) {
  $("rFlagFrom").textContent = flag(tx.from); $("rFlagTo").textContent = flag(tx.to);
  $("rBig").textContent = tx.toText; $("rFor").textContent = `for ${tx.fromText}`;
  $("rDate").textContent = new Date(tx.at).toLocaleString("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("rRows").innerHTML = [["払った", `<span class="flag">${flag(tx.from)}</span>${esc(tx.fromText)}`, ""], ["受け取った", `<span class="flag">${flag(tx.to)}</span>${esc(tx.toText)}`, "green"], ["レート", esc(tx.rateText), ""], ["手数料", tx.mine ? "自分レートに込み" : "参考レートのため未反映", ""], ["参照", esc(tx.ref), ""], ...(tx.balFrom ? [[`${tx.from} 残高`, esc(tx.balFrom), ""]] : []), [`${tx.to} 残高`, esc(tx.balTo), ""]].map(([k, v, c]) => `<dt>${esc(k)}</dt><dd class="${c}">${v}</dd>`).join("");
  $("rProv").innerHTML = [["出典", tx.source], ["種別", `${tx.rateKind} · ${tx.confidence === "confirmed" ? "確定" : "推定"}`], ["観測", new Date(tx.observedAt).toLocaleString("ja-JP")], ["丸め", tx.rounding]].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("barcode").innerHTML = barcodeFor(tx.ref); $("rRef").textContent = tx.ref; lastTx = tx;
  show("receipt");
}

// ---------- add / spend ----------
let addCcy = "THB", spCcy = "THB", spCat = "food";
function openAdd(ccy) { addCcy = ccy || S.sel; $("addFlag").textContent = flag(addCcy); $("addCode").textContent = addCcy; $("addAmt").value = ""; $("sheetAdd").hidden = false; setTimeout(() => $("addAmt").focus(), 60); }
function openSpend(ccy) {
  spCcy = ccy || S.sel; $("spFlag").textContent = flag(spCcy); $("spCode").textContent = spCcy; $("spAmt").value = ""; $("spNote").value = "";
  $("spCat").innerHTML = CATS.map((c) => `<button type="button" data-v="${c[0]}" class="${c[0] === spCat ? "on" : ""}" style="--c:${c[2]}">${c[1]}</button>`).join("");
  const b = balance(spCcy); $("spHint").textContent = b ? `${spCcy} の残高 ${fmt(b)} から引きます` : `${spCcy} の残高は未設定です。記録はできますが残高はマイナスになります`;
  $("sheetSpend").hidden = false; setTimeout(() => $("spAmt").focus(), 60);
}
function runProgress(title, vis, done) {
  const p = $("progress"); p.hidden = false; $("pTitle").textContent = title; $("btnPDone").hidden = true;
  $("pVis").style.background = vis.grad; $("pVis").innerHTML = `<div class="cv"><small>${esc(vis.small)}</small>${esc(vis.big)}</div>`;
  const steps = [...$("pSteps").querySelectorAll(".step")], lines = [...$("pSteps").querySelectorAll("em")];
  steps.forEach((s) => (s.className = "step")); lines.forEach((l) => (l.className = ""));
  const labels = ["記録しています", "換算しています", "保存しています"]; let i = 0, pct = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tick = () => {
    pct = Math.min(100, pct + (reduced ? 50 : 9)); $("pPct").textContent = pct + "%";
    const stage = Math.min(2, Math.floor(pct / 34));
    if (stage !== i || pct === 100) { for (let k = 0; k < 3; k++) { steps[k].className = "step " + (k < stage || pct === 100 ? "done" : k === stage ? "active" : ""); if (k < 2) lines[k].className = k < stage || pct === 100 ? "done" : ""; } i = stage; }
    $("pLabel").textContent = pct === 100 ? "完了" : labels[stage];
    if (pct < 100) setTimeout(tick, reduced ? 10 : 110); else { $("pTitle").textContent = done.title; $("pSub").textContent = done.sub; $("btnPDone").hidden = false; }
  };
  $("pSub").textContent = "少しだけお待ちください"; tick();
}
$("btnAddGo").addEventListener("click", () => {
  const m = parseAmt($("addAmt").value, addCcy); if (!m) { toast("金額を入れてください"); return; }
  const src = $("addSource").querySelector(".on")?.dataset.v || "その他";
  setBalance(addCcy, (balance(addCcy) || Money.zero(addCcy)).add(m));
  S.ledger.unshift({ kind: "add", at: new Date().toISOString(), ccy: addCcy, amount: m.toDecimalString(), note: src }); S.sel = addCcy; save(); closeSheets();
  runProgress("追加しています", { grad: grad(addCcy), small: addCcy + " CASH", big: fmt(m) }, { title: "追加しました", sub: `${addCcy} の残高 ${fmt(balance(addCcy))}` });
});
$("btnSpendGo").addEventListener("click", () => {
  const m = parseAmt($("spAmt").value, spCcy); if (!m) { toast("金額を入れてください"); return; }
  setBalance(spCcy, (balance(spCcy) || Money.zero(spCcy)).subtract(m));
  S.ledger.unshift({ kind: "spend", at: new Date().toISOString(), ccy: spCcy, amount: m.toDecimalString(), cat: spCat, note: $("spNote").value.trim() }); S.ledger = S.ledger.slice(0, 500); save(); closeSheets(); render();
  const h = toCcy(m, S.home); toast(`−${fmt(m)}${h && spCcy !== S.home ? ` ≈ ${fmt(h)}` : ""} を記録`);
  if ($("s-home").hidden && $("s-wallet").hidden) go("home");
});
$("btnPDone").addEventListener("click", () => { $("progress").hidden = true; go("wallet"); renderWallet(); });
$("addSource").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; $("addSource").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); });
$("spCat").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; spCat = b.dataset.v; $("spCat").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); });
$("addCur").addEventListener("click", () => openPicker("any", (c) => { addCcy = c; $("addFlag").textContent = flag(c); $("addCode").textContent = c; }));
$("spCur").addEventListener("click", () => openPicker("any", (c) => { spCcy = c; $("spFlag").textContent = flag(c); $("spCode").textContent = c; }));

// ---------- sheets ----------
function closeSheets() { for (const id of ["sheetDone", "sheetPick", "sheetRate", "sheetHistory", "sheetAdd", "sheetSpend"]) $(id).hidden = true; }
function openPicker(which, onPick) {
  $("pickTitle").textContent = which === "from" ? "払う通貨" : which === "to" ? "受け取る通貨" : "通貨を選ぶ";
  const list = $("pickList"); const search = $("pickSearch");
  const cur = which === "from" ? S.from : which === "to" ? S.to : null;
  const draw = () => {
    const q = search.value.trim().toLowerCase(); list.innerHTML = "";
    for (const c of CURRENCIES.values()) {
      if (q && !(c.code.toLowerCase().includes(q) || c.name.ja.includes(q) || c.name.en.toLowerCase().includes(q))) continue;
      const li = document.createElement("li"); if (cur === c.code) li.className = "on";
      li.innerHTML = `<button type="button"><span class="flag">${flag(c.code)}</span><span class="code">${c.code}</span><span class="name">${esc(c.name.ja)}</span></button>`;
      li.querySelector("button").addEventListener("click", () => {
        $("sheetPick").hidden = true;
        if (which === "from") { if (c.code === S.to) S.to = S.from; S.from = c.code; buf = ""; save(); render(); loadSeries(); }
        else if (which === "to") { if (c.code === S.from) S.from = S.to; S.to = c.code; buf = ""; save(); render(); loadSeries(); }
        else onPick(c.code);
      });
      list.appendChild(li);
    }
  };
  search.value = ""; search.oninput = draw; draw(); $("sheetPick").hidden = false; setTimeout(() => search.focus(), 50);
}

// ---------- events ----------
$("btnStart").addEventListener("click", () => { S.onboarded = true; save(); location.hash = "home"; route(); });
$("btnStartDemo").addEventListener("click", () => {
  S.onboarded = true; S.home = "JPY"; S.sel = "THB"; S.from = "JPY"; S.to = "THB";
  S.balances = { JPY: "48000", THB: "9870.00", USD: "120.00" }; S.mine = { "JPY/THB": { paid: "100000", received: "22500", at: new Date(Date.now() - 2 * 864e5).toISOString() } };
  const t = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  S.ledger = [
    { kind: "spend", at: t(2), ccy: "THB", amount: "180.00", cat: "food", note: "ガパオライス" },
    { kind: "spend", at: t(5), ccy: "THB", amount: "95.00", cat: "transport", note: "BTS" },
    { kind: "spend", at: t(26), ccy: "THB", amount: "1250.00", cat: "shop", note: "ターミナル21" },
    { kind: "spend", at: t(30), ccy: "THB", amount: "320.00", cat: "food", note: "ソンブーン" },
    { kind: "spend", at: t(52), ccy: "USD", amount: "80.00", cat: "stay", note: "ホステル" },
    { kind: "add", at: t(50), ccy: "THB", amount: "22500.00", note: "両替所" },
  ];
  S.history = []; save(); location.hash = "home"; route(); toast("サンプルの財布を入れました");
});
$("pad").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) key(b.dataset.k); });
window.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT" || $("s-convert").hidden) return; if (/^[0-9.]$/.test(e.key)) key(e.key); else if (e.key === "Backspace") key("⌫"); else if (e.key === "Enter") doConvert(); else if (e.key === "Escape") closeSheets(); });
$("btnFrom").addEventListener("click", () => openPicker("from"));
$("btnTo").addEventListener("click", () => openPicker("to"));
$("btnSwap").addEventListener("click", () => { const amount = inputMoney(); const aq = activeQuote(); let next = ""; if (aq && !amount.isZero()) { try { next = convert(amount, aq.quote, { rounding: ROUNDING }).convertedAmount.toDecimalString(); } catch {} } [S.from, S.to] = [S.to, S.from]; buf = next.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"); save(); render(); loadSeries(); });
$("btnMax").addEventListener("click", () => { const b = balance(S.from); if (b) { buf = b.toDecimalString().replace(/\.0+$/, ""); renderPair(); } });
$("btnConvert").addEventListener("click", doConvert);
$("btnDone").addEventListener("click", () => { closeSheets(); go("home"); });
$("btnMore").addEventListener("click", closeSheets);
$("btnReceipt").addEventListener("click", () => { closeSheets(); if (lastTx) showReceipt(lastTx); });
$("btnReceiptBack").addEventListener("click", () => route());
$("btnReceiptDone").addEventListener("click", () => go("home"));
$("btnReceiptShare").addEventListener("click", async () => { if (!lastTx) return; const text = `${lastTx.fromText} → ${lastTx.toText}\n${lastTx.rateText}\n${lastTx.source}\n${lastTx.ref}`; if (navigator.share) { try { await navigator.share({ title: "Exchange receipt", text }); return; } catch {} } try { await navigator.clipboard.writeText(text); toast("コピーしました"); } catch { toast("共有できませんでした"); } });
const openRate = () => { renderRateSheet(); $("sheetRate").hidden = false; };
$("rateRow").addEventListener("click", openRate); $("btnRates").addEventListener("click", openRate); $("btnRatesHome").addEventListener("click", openRate); $("btnTabRate").addEventListener("click", openRate);
$("btnHistory").addEventListener("click", () => { renderHistory(); $("sheetHistory").hidden = false; });
$("btnHistClear").addEventListener("click", () => { S.history = []; save(); renderHistory(); });
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheets));
for (const id of ["sheetDone", "sheetPick", "sheetRate", "sheetHistory", "sheetAdd", "sheetSpend"]) $(id).addEventListener("click", (e) => { if (e.target.id === id) closeSheets(); });
$("btnSetMine").addEventListener("click", () => { const paid = $("inPaid").value.trim(), got = $("inGot").value.trim(); try { realizedRate(parseDec(paid), parseDec(got), { base: S.from, quote: S.to, at: new Date().toISOString(), receivedAt: new Date().toISOString() }); } catch { toast("2つの金額を正しく入れてください"); return; } S.mine[`${S.from}/${S.to}`] = { paid, received: got, at: new Date().toISOString() }; save(); closeSheets(); render(); toast("自分レートで換算します"); });
$("btnClearMine").addEventListener("click", () => { delete S.mine[`${S.from}/${S.to}`]; save(); closeSheets(); render(); });
$("btnHomeCcy").addEventListener("click", () => openPicker("any", (c) => { S.home = c; save(); renderRateSheet(); render(); }));
$("ticker").addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (b) { S.sel = b.dataset.c; save(); renderHome(); } });
$("miniCards").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; if (b.id === "mcAdd") openPicker("any", (c) => { if (!S.balances[c]) S.balances[c] = Money.zero(c).toDecimalString(); S.sel = c; save(); renderHome(); openAdd(c); }); else { S.sel = b.dataset.c; save(); renderHome(); } });
$("qAdd").addEventListener("click", () => openAdd(S.sel)); $("qSpend").addEventListener("click", () => openSpend(S.sel)); $("qConvert").addEventListener("click", () => { S.to = S.sel === S.home ? S.to : S.sel; S.from = S.home === S.sel ? S.from : S.home; save(); go("convert"); loadSeries(); }); $("qMore").addEventListener("click", () => go("wallet"));
$("btnAllTx").addEventListener("click", () => go("wallet"));
$("btnSearch").addEventListener("click", () => openPicker("any", (c) => { S.sel = c; if (!S.balances[c]) S.balances[c] = Money.zero(c).toDecimalString(); save(); renderHome(); }));
$("btnBell").addEventListener("click", () => toast("お知らせはまだありません"));
$("btnWAdd").addEventListener("click", () => openAdd(S.sel)); $("btnWSpend").addEventListener("click", () => openSpend(S.sel));
$("btnWalletAdd").addEventListener("click", () => openPicker("any", (c) => { if (!S.balances[c]) S.balances[c] = Money.zero(c).toDecimalString(); S.sel = c; save(); renderWallet(); openAdd(c); }));
function renderHistory() { const ul = $("histList"); ul.innerHTML = ""; $("histEmpty").hidden = S.history.length > 0; for (const h of S.history) { const li = document.createElement("li"); li.innerHTML = `<div class="flags2"><span class="flag">${flag(h.from)}</span><span class="flag">${flag(h.to)}</span></div><div><div>${esc(h.from)} → ${esc(h.to)}</div><div class="t">${new Date(h.at).toLocaleString("ja-JP")}</div></div><div class="a">${esc(h.toText)}<small>for ${esc(h.fromText)}</small></div>`; li.addEventListener("click", () => { closeSheets(); showReceipt(h); }); ul.appendChild(li); } }
let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200); }

// ---------- boot ----------
route();
loadRates();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});

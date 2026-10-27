// Currency Intelligence — web client. Money math lives in ./core (packages/core); this file renders.
import {
  Money, MoneyError, CURRENCIES, currency, convert, invert, cross, realizedRate, spreadPercent,
  parseDec, decToShortString, divDec, RateCache, OpenErApiProvider, FrankfurterProvider,
} from "./core/index.js";

const STORE_KEY = "ci.v2";
const TTL_MS = 6 * 60 * 60 * 1000;
const CROSS_TOLERANCE_MS = 36 * 60 * 60 * 1000;
const PIVOT = "USD";
const ROUNDING = "HALF_EVEN";
const SERIES_DAYS = 30;

// Country flag per currency (emoji from regional indicators).
const FLAG_CC = { JPY:"JP", THB:"TH", USD:"US", EUR:"EU", GBP:"GB", KRW:"KR", TWD:"TW", CNY:"CN", HKD:"HK", SGD:"SG", MYR:"MY", IDR:"ID", PHP:"PH", VND:"VN", LAK:"LA", KHR:"KH", MMK:"MM", INR:"IN", AUD:"AU", NZD:"NZ", CAD:"CA", CHF:"CH", SEK:"SE", NOK:"NO", DKK:"DK", CZK:"CZ", PLN:"PL", HUF:"HU", ISK:"IS", TRY:"TR", AED:"AE", SAR:"SA", KWD:"KW", BHD:"BH", OMR:"OM", JOD:"JO", MXN:"MX", BRL:"BR", CLP:"CL", ZAR:"ZA", EGP:"EG", LKR:"LK", NPR:"NP" };
const flag = (code) => { const cc = FLAG_CC[code]; return cc ? [...cc].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("") : "¤"; };

// Embedded fallback so the very first open works offline. Clearly dated and marked as a reference snapshot.
const EMBEDDED = { observedAt: "2026-10-27T00:00:00Z", rates: { USD:1, JPY:150.12, THB:33.47, EUR:0.9201, GBP:0.7742, KRW:1378.5, TWD:32.18, CNY:7.18, HKD:7.79, SGD:1.336, MYR:4.42, IDR:16080, PHP:57.1, VND:25410, LAK:21900, KHR:4080, MMK:2100, INR:84.1, AUD:1.512, NZD:1.66, CAD:1.372, CHF:0.879, SEK:10.6, NOK:10.9, DKK:6.86, CZK:23.2, PLN:3.98, HUF:372, ISK:138, TRY:34.2, AED:3.6725, SAR:3.75, KWD:0.3066, BHD:0.376, OMR:0.3845, JOD:0.709, MXN:19.6, BRL:5.62, CLP:940, ZAR:17.9, EGP:48.6, LKR:299, NPR:134.6 } };

// ---------- state ----------
function defaults() { return { from: "JPY", to: "THB", balances: {}, mine: {}, history: [], rateCache: null, series: {} }; }
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
      pivot = r.quotes; rate = { status: r.status, source: r.source, error: r.error || "" };
      render();
      if (r.revalidation) { const fresh = await r.revalidation; if (fresh) { pivot = fresh; rate = { status: "fresh", source: r.source, error: "" }; render(); } }
      loadSeries();
      return;
    } catch (e) { lastErr = e; }
  }
  pivot = embeddedQuotes();
  rate = { status: "embedded", source: "embedded", error: lastErr ? String(lastErr.message || lastErr) : "" };
  render();
}

// 30-day series for the current pair (Frankfurter time series; falls back to locally accumulated daily points).
let series = null; // [{date, rate(number)}]
async function loadSeries() {
  const key = `${S.from}/${S.to}`;
  series = null;
  renderRate();
  const end = new Date(); const start = new Date(end.getTime() - SERIES_DAYS * 864e5);
  const d = (x) => x.toISOString().slice(0, 10);
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
    else {
      // accumulate today's cross rate so a chart grows over days of use
      const q = marketQuote(S.from, S.to);
      if (q) { const today = q.observedAt.slice(0, 10); const arr = (S.series[key] || []).filter((p) => p.date !== today); arr.push({ date: today, rate: Number(q.rate) }); S.series[key] = arr.slice(-SERIES_DAYS); save(); series = arr.length >= 2 ? arr : null; }
    }
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
function activeQuote() {
  const m = S.mine[`${S.from}/${S.to}`];
  if (m) { try { return { quote: realizedRate(parseDec(m.paid), parseDec(m.received), { base: S.from, quote: S.to, at: m.at, receivedAt: m.at }), mine: true }; } catch {} }
  const mk = marketQuote(S.from, S.to);
  return mk ? { quote: mk, mine: false } : null;
}

// ---------- input ----------
let buf = "";
function inputMoney() {
  const txt = buf || "0";
  try { return Money.of(txt, S.from); } catch (e) { if (e instanceof MoneyError && e.code === "MONEY_PRECISION") return Money.of(txt, S.from, "DOWN"); return Money.zero(S.from); }
}
function key(k) {
  const scale = currency(S.from).scale;
  if (k === "⌫") buf = buf.slice(0, -1);
  else if (k === ".") { if (scale === 0 || buf.includes(".")) return; buf = (buf || "0") + "."; }
  else { if (buf.replace(".", "").length >= 12) return; const fr = buf.split(".")[1]; if (fr !== undefined && fr.length >= scale) return; buf = buf === "0" ? k : buf + k; }
  try { navigator.vibrate?.(5); } catch {}
  renderPair();
}

// ---------- formatting ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (m) => m.format("en-US");
function groupDigits(s) { const [i, fr] = s.split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fr !== undefined ? "." + fr : ""); }
function rateStr(r) { const n = Number(r); return n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(5); }
function dateJa(iso) { return new Date(iso).toLocaleDateString("ja-JP", { month: "short", day: "numeric" }); }
function balance(code) { const b = S.balances[code]; if (b === undefined) return null; try { return Money.of(b, code); } catch { return null; } }
function sourceLabel(q) {
  if (!q) return "";
  if (q.source === "user") return "自分レート";
  if (q.source === "embedded") return `同梱の参考値 · ${dateJa(q.observedAt)}`;
  if (q.source === "frankfurter") return `ECB参考レート · ${dateJa(q.observedAt)}`;
  return `参考レート · ${dateJa(q.observedAt)}`;
}

// ---------- render ----------
function renderPair() {
  $("flagFrom").textContent = flag(S.from); $("codeFrom").textContent = S.from;
  $("flagTo").textContent = flag(S.to); $("codeTo").textContent = S.to;
  const bf = balance(S.from), bt = balance(S.to);
  $("balFrom").textContent = bf ? `残高 ${fmt(bf)}` : "残高 未設定";
  $("balTo").textContent = bt ? `残高 ${fmt(bt)}` : "";
  $("btnMax").hidden = !bf || bf.isZero();
  const amount = inputMoney();
  const sym = currency(S.from).symbol;
  const a = $("amtFrom");
  a.className = "amt num " + (buf ? "input" : "placeholder");
  a.textContent = buf ? sym + groupDigits(buf) : fmt(Money.zero(S.from));
  const aq = activeQuote();
  const t = $("amtTo");
  if (aq && !amount.isZero()) {
    try { t.textContent = fmt(convert(amount, aq.quote, { rounding: ROUNDING }).convertedAmount); t.className = "amt num " + (aq.mine ? "mine" : "input"); }
    catch { t.textContent = "—"; t.className = "amt num placeholder"; }
  } else { t.textContent = fmt(Money.zero(S.to)); t.className = "amt num placeholder"; }
  const cta = $("btnConvert");
  cta.disabled = amount.isZero() || !aq;
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
  let sub = sourceLabel(aq.quote);
  if (rate.status === "stale" || rate.status === "offline") sub += " · 古い";
  $("rateSub").textContent = sub;
  dot.className = "dot " + (rate.status === "fresh" ? "" : rate.status === "error" ? "error" : "stale");
  if (aq.mine && mk) {
    const sp2 = spreadPercent(mk, aq.quote); const worse = !sp2.startsWith("-");
    chip.textContent = `${worse ? "−" : "+"}${sp2.replace("-", "")}% vs 市場`; chip.className = "chip " + (worse ? "red" : "green");
  } else if (series && series.length >= 2) {
    const first = series[0].rate, last = series[series.length - 1].rate; const ch = ((last - first) / first) * 100;
    chip.textContent = `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%`; chip.className = "chip " + (ch >= 0 ? "green" : "red");
  } else { chip.textContent = aq.quote.confidence === "estimated" ? "参考" : "確定"; chip.className = "chip grey"; }
  if (series && series.length >= 2) {
    const up = series[series.length - 1].rate >= series[0].rate;
    sp.className.baseVal = "spark " + (up ? "" : "down"); sp.innerHTML = `<path d="${sparkPath(series, 100, 32)}"/><circle r="2.6" cx="100" cy="${sparkPath(series.slice(-1).concat(series.slice(-1)), 100, 32).split(",")[1].split(" ")[0]}" fill="currentColor"/>`;
  } else { sp.className.baseVal = "spark flat"; sp.innerHTML = `<path d="M0,16 L100,16" stroke-dasharray="3 3"/>`; }
}
function renderRateSheet() {
  const aq = activeQuote(); const mk = marketQuote(S.from, S.to);
  $("rhMain").textContent = aq ? `1 ${S.from} = ${rateStr(aq.quote.rate)} ${S.to}` : "—";
  $("rhSub").textContent = aq ? `${sourceLabel(aq.quote)}${mk && aq.mine ? ` · 市場 ${rateStr(mk.rate)}` : ""}` : "";
  const big = $("bigSpark"); const legend = $("sparkLegend");
  if (series && series.length >= 2) {
    const up = series[series.length - 1].rate >= series[0].rate;
    big.className.baseVal = "bigspark " + (up ? "" : "down"); big.innerHTML = `<path d="${sparkPath(series, 320, 90)}"/>`;
    legend.innerHTML = `<span>${esc(series[0].date)}</span><span>${SERIES_DAYS}日 · 日次参考レート。リアルタイムではありません</span><span>${esc(series[series.length - 1].date)}</span>`;
  } else { big.className.baseVal = "bigspark flat"; big.innerHTML = `<path d="M0,45 L320,45" stroke-dasharray="4 4"/>`; legend.innerHTML = `<span></span><span>履歴は通信できる環境で取得されます(日次)</span><span></span>`; }
  const q = aq ? aq.quote : null;
  const rows = q ? [
    ["出典", q.source === "user" ? "あなたの両替レシート" : q.source === "embedded" ? "アプリ同梱の参考値" : `${q.source}(${providers.find((p) => p.id === q.source)?.description || ""})`],
    ["種別", `${q.rateKind} · ${q.confidence === "confirmed" ? "確定" : "推定"}`],
    ["観測", new Date(q.observedAt).toLocaleString("ja-JP")],
    ["取得", new Date(q.receivedAt).toLocaleString("ja-JP")],
    ["期限", q.expiresAt ? new Date(q.expiresAt).toLocaleString("ja-JP") : "提供元の明示なし"],
    ["計算", q.derivedFrom ? `USD経由のクロスレート · 丸め ${ROUNDING}` : `丸め ${ROUNDING}`],
  ] : [["状態", "レート未取得"]];
  if (q && q.notes?.some((n) => n.includes("skew"))) rows.push(["注意", "2つの観測時刻がずれているため推定扱い"]);
  $("provRows").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("lblPaid").textContent = `払った(${S.from})`; $("lblGot").textContent = `受け取った(${S.to})`;
  const m = S.mine[`${S.from}/${S.to}`];
  $("inPaid").value = m ? m.paid : ""; $("inGot").value = m ? m.received : "";
  $("mineNote").textContent = m ? `設定日時 ${new Date(m.at).toLocaleString("ja-JP")}。市場中値との差はチップに表示されます。` : "両替所で 10万円 → 22,500バーツ なら、100000 と 22500。";
  $("lblBalFrom").textContent = `${S.from} の現金`; $("lblBalTo").textContent = `${S.to} の現金`;
  $("inBalFrom").value = S.balances[S.from] ?? ""; $("inBalTo").value = S.balances[S.to] ?? "";
}
function renderHistory() {
  const ul = $("histList"); ul.innerHTML = "";
  $("histEmpty").hidden = S.history.length > 0;
  for (const h of S.history) {
    const li = document.createElement("li");
    li.innerHTML = `<div class="flags2"><span class="flag">${flag(h.from)}</span><span class="flag">${flag(h.to)}</span></div><div><div>${esc(h.from)} → ${esc(h.to)}</div><div class="t">${new Date(h.at).toLocaleString("ja-JP")}</div></div><div class="a">${esc(h.toText)}<small>for ${esc(h.fromText)}</small></div>`;
    li.addEventListener("click", () => { closeSheets(); showReceipt(h); });
    ul.appendChild(li);
  }
}
function render() { renderPair(); renderRate(); }

// ---------- convert flow ----------
let lastTx = null;
function doConvert() {
  const amount = inputMoney(); const aq = activeQuote();
  if (amount.isZero() || !aq) return;
  const r = convert(amount, aq.quote, { rounding: ROUNDING });
  const bf = balance(S.from), bt = balance(S.to);
  const newFrom = bf ? bf.subtract(amount) : null;
  const newTo = bt ? bt.add(r.convertedAmount) : Money.zero(S.to).add(r.convertedAmount);
  if (newFrom) S.balances[S.from] = newFrom.toDecimalString();
  S.balances[S.to] = newTo.toDecimalString();
  const ref = "EXC-" + Math.random().toString(36).slice(2, 7).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const tx = {
    at: new Date().toISOString(), ref, from: S.from, to: S.to, fromAmt: amount.toDecimalString(), toAmt: r.convertedAmount.toDecimalString(),
    fromText: fmt(amount), toText: fmt(r.convertedAmount), rate: aq.quote.rate, rateText: `1 ${S.from} = ${rateStr(aq.quote.rate)} ${S.to}`,
    source: sourceLabel(aq.quote), sourceId: aq.quote.source, rateKind: aq.quote.rateKind, confidence: aq.quote.confidence, observedAt: aq.quote.observedAt,
    mine: aq.mine, rounding: ROUNDING, balFrom: newFrom ? fmt(newFrom) : null, balTo: fmt(newTo),
  };
  S.history.unshift(tx); S.history = S.history.slice(0, 100); save();
  lastTx = tx; buf = ""; render();
  // sheet
  $("doneRate").textContent = tx.rateText + (tx.mine ? "(自分レート)" : "");
  $("dFlagFrom").textContent = flag(tx.from); $("dFromLbl").textContent = `From ${tx.from}`; $("dFromAmt").textContent = "−" + tx.fromText;
  $("dFlagTo").textContent = flag(tx.to); $("dToLbl").textContent = `To ${tx.to}`; $("dToAmt").textContent = "+" + tx.toText;
  $("doneBals").innerHTML = [[tx.from, tx.balFrom ?? "未設定"], [tx.to, tx.balTo]].map(([c, v]) => `<dt><span class="flag">${flag(c)}</span>${c} 残高</dt><dd>${esc(v)}</dd>`).join("");
  $("sheetDone").hidden = false;
}
function barcodeFor(ref) {
  let h = 2166136261; const bars = [];
  for (let i = 0; i < 120; i++) { h ^= ref.charCodeAt(i % ref.length) + i; h = Math.imul(h, 16777619) >>> 0; bars.push(h & 1 ? 1 : 0); }
  let x = 0, out = ""; for (const b of bars) { const w = 1 + ((x * 7) % 3) * 0.4; if (b) out += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="40"/>`; x += w + 0.4; }
  return out;
}
function showReceipt(tx) {
  $("rFlagFrom").textContent = flag(tx.from); $("rFlagTo").textContent = flag(tx.to);
  $("rBig").textContent = tx.toText; $("rFor").textContent = `for ${tx.fromText}`;
  $("rDate").textContent = new Date(tx.at).toLocaleString("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("rRows").innerHTML = [
    ["払った", `<span class="flag">${flag(tx.from)}</span>${esc(tx.fromText)}`, ""],
    ["受け取った", `<span class="flag">${flag(tx.to)}</span>${esc(tx.toText)}`, "green"],
    ["レート", esc(tx.rateText), ""],
    ["手数料", tx.mine ? "自分レートに込み" : "参考レートのため未反映", ""],
    ["参照", esc(tx.ref), ""],
    ...(tx.balFrom ? [[`${tx.from} 残高`, esc(tx.balFrom), ""]] : []),
    [`${tx.to} 残高`, esc(tx.balTo), ""],
  ].map(([k, v, c]) => `<dt>${esc(k)}</dt><dd class="${c}">${v}</dd>`).join("");
  $("rProv").innerHTML = [
    ["出典", tx.source], ["種別", `${tx.rateKind} · ${tx.confidence === "confirmed" ? "確定" : "推定"}`], ["観測", new Date(tx.observedAt).toLocaleString("ja-JP")], ["丸め", tx.rounding],
  ].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("barcode").innerHTML = barcodeFor(tx.ref); $("rRef").textContent = tx.ref;
  lastTx = tx;
  $("s-convert").hidden = true; $("s-receipt").hidden = false;
}

// ---------- sheets ----------
function closeSheets() { for (const id of ["sheetDone", "sheetPick", "sheetRate", "sheetHistory"]) $(id).hidden = true; }
function openPicker(which) {
  $("pickTitle").textContent = which === "from" ? "払う通貨" : "受け取る通貨";
  const list = $("pickList"); const search = $("pickSearch");
  const draw = () => {
    const q = search.value.trim().toLowerCase(); list.innerHTML = "";
    for (const c of CURRENCIES.values()) {
      if (q && !(c.code.toLowerCase().includes(q) || c.name.ja.includes(q) || c.name.en.toLowerCase().includes(q))) continue;
      const li = document.createElement("li"); if ((which === "from" ? S.from : S.to) === c.code) li.className = "on";
      li.innerHTML = `<button type="button"><span class="flag">${flag(c.code)}</span><span class="code">${c.code}</span><span class="name">${esc(c.name.ja)}</span></button>`;
      li.querySelector("button").addEventListener("click", () => {
        if (which === "from") { if (c.code === S.to) S.to = S.from; S.from = c.code; } else { if (c.code === S.from) S.from = S.to; S.to = c.code; }
        buf = ""; save(); closeSheets(); render(); loadSeries();
      });
      list.appendChild(li);
    }
  };
  search.value = ""; search.oninput = draw; draw();
  $("sheetPick").hidden = false; setTimeout(() => search.focus(), 50);
}

// ---------- events ----------
$("pad").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) key(b.dataset.k); });
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || !$("s-receipt").hidden) return;
  if (/^[0-9.]$/.test(e.key)) key(e.key); else if (e.key === "Backspace") key("⌫"); else if (e.key === "Enter") doConvert(); else if (e.key === "Escape") closeSheets();
});
$("btnFrom").addEventListener("click", () => openPicker("from"));
$("btnTo").addEventListener("click", () => openPicker("to"));
$("btnSwap").addEventListener("click", () => {
  const amount = inputMoney(); const aq = activeQuote();
  let next = "";
  if (aq && !amount.isZero()) { try { next = convert(amount, aq.quote, { rounding: ROUNDING }).convertedAmount.toDecimalString(); } catch {} }
  [S.from, S.to] = [S.to, S.from]; buf = next.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"); save(); render(); loadSeries();
});
$("btnMax").addEventListener("click", () => { const b = balance(S.from); if (b) { buf = b.toDecimalString().replace(/\.0+$/, ""); renderPair(); } });
$("btnConvert").addEventListener("click", doConvert);
$("btnDone").addEventListener("click", closeSheets);
$("btnMore").addEventListener("click", closeSheets);
$("btnReceipt").addEventListener("click", () => { closeSheets(); if (lastTx) showReceipt(lastTx); });
$("btnReceiptBack").addEventListener("click", () => { $("s-receipt").hidden = true; $("s-convert").hidden = false; });
$("btnReceiptDone").addEventListener("click", () => { $("s-receipt").hidden = true; $("s-convert").hidden = false; });
$("btnReceiptShare").addEventListener("click", async () => {
  if (!lastTx) return;
  const text = `${lastTx.fromText} → ${lastTx.toText}\n${lastTx.rateText}\n${lastTx.source}\n${lastTx.ref}`;
  if (navigator.share) { try { await navigator.share({ title: "Exchange receipt", text }); return; } catch {} }
  try { await navigator.clipboard.writeText(text); toast("コピーしました"); } catch { toast("共有できませんでした"); }
});
$("rateRow").addEventListener("click", () => { renderRateSheet(); $("sheetRate").hidden = false; });
$("btnRates").addEventListener("click", () => { renderRateSheet(); $("sheetRate").hidden = false; });
$("btnRateClose").addEventListener("click", closeSheets);
$("btnPickClose").addEventListener("click", closeSheets);
$("btnHistory").addEventListener("click", () => { renderHistory(); $("sheetHistory").hidden = false; });
$("btnHistoryClose").addEventListener("click", closeSheets);
$("btnHistClear").addEventListener("click", () => { S.history = []; save(); renderHistory(); });
for (const id of ["sheetDone", "sheetPick", "sheetRate", "sheetHistory"]) $(id).addEventListener("click", (e) => { if (e.target.id === id) closeSheets(); });
$("btnSetMine").addEventListener("click", () => {
  const paid = $("inPaid").value.trim(), got = $("inGot").value.trim();
  try { realizedRate(parseDec(paid), parseDec(got), { base: S.from, quote: S.to, at: new Date().toISOString(), receivedAt: new Date().toISOString() }); }
  catch { toast("2つの金額を正しく入れてください"); return; }
  S.mine[`${S.from}/${S.to}`] = { paid, received: got, at: new Date().toISOString() }; save(); closeSheets(); render(); toast("自分レートで換算します");
});
$("btnClearMine").addEventListener("click", () => { delete S.mine[`${S.from}/${S.to}`]; save(); closeSheets(); render(); });
$("btnSetBal").addEventListener("click", () => {
  for (const [id, code] of [["inBalFrom", S.from], ["inBalTo", S.to]]) {
    const v = $(id).value.trim();
    if (!v) { delete S.balances[code]; continue; }
    try { S.balances[code] = Money.of(v, code, "DOWN").toDecimalString(); } catch { toast(`${code} の金額が正しくありません`); return; }
  }
  save(); closeSheets(); render(); toast("残高を保存しました");
});
let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2000); }

// ---------- boot ----------
render();
loadRates();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});

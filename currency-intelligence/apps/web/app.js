// Currency Intelligence — web client for P1 Converter Core (F01, F03, history, my-rate).
// All money math lives in ./core (compiled from packages/core). This file only renders.
import {
  Money,
  MoneyError,
  CURRENCIES,
  currency,
  convert,
  invert,
  cross,
  realizedRate,
  spreadPercent,
  staleness,
  parseDec,
  RateCache,
  OpenErApiProvider,
  FrankfurterProvider,
} from "./core/index.js";

// ---------- constants ----------
const STORE_KEY = "ci.v1";
const TTL_MS = 6 * 60 * 60 * 1000; // daily providers: treat > 6h as stale, warn
const MAX_TARGETS = 12;
const CROSS_TOLERANCE_MS = 36 * 60 * 60 * 1000; // both providers are daily; a day of skew is tolerated, more is marked estimated
const PIVOT = "USD";
const ROUNDING = "HALF_EVEN";

// ---------- persistence (per-device convenience; never the source of truth for money) ----------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {}
  return defaults();
}
function defaults() {
  return {
    base: "JPY",
    targets: ["THB", "USD", "EUR", "KRW"],
    pinned: ["THB"],
    history: [],
    mine: {}, // "JPY/THB" → {paid, received, at}
    rateCache: null, // {key, quotes}
  };
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
  } catch {}
}
let S = load();

// RateStore backed by localStorage so the app restores offline (F03).
const store = {
  async get(key) {
    return S.rateCache && S.rateCache.key === key ? S.rateCache.quotes : undefined;
  },
  async set(key, quotes) {
    S.rateCache = { key, quotes };
    save();
  },
};

// Primary: open.er-api (wide coverage incl. LAK/KHR/MMK). Fallback: Frankfurter (ECB).
const providers = [new OpenErApiProvider({ fetch: (u, i) => fetch(u, i) }), new FrankfurterProvider({ fetch: (u, i) => fetch(u, i) })];
const caches = providers.map((p) => new RateCache(p, { ttlMs: TTL_MS, store }));

// ---------- rate state ----------
let pivotQuotes = []; // USD→X quotes
let rateStatus = { status: "loading", ageMs: 0, source: "" , error: "" };

async function loadRates() {
  const symbols = [...CURRENCIES.keys()].filter((c) => c !== PIVOT);
  let lastErr = null;
  for (const cache of caches) {
    try {
      const r = await cache.resolve(PIVOT, symbols);
      pivotQuotes = r.quotes;
      rateStatus = { status: r.status, ageMs: r.ageMs, source: r.source, error: r.error || "" };
      render();
      if (r.revalidation) {
        const fresh = await r.revalidation;
        if (fresh) {
          pivotQuotes = fresh;
          rateStatus = { status: "fresh", ageMs: 0, source: r.source, error: "" };
          render();
        }
      }
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  rateStatus = { status: "error", ageMs: 0, source: "", error: lastErr ? String(lastErr.message || lastErr) : "unknown" };
  render();
}

/** base→target quote derived from USD pivot quotes (or the user's own realized rate). */
function quoteFor(base, target) {
  const mineKey = `${base}/${target}`;
  const mine = S.mine[mineKey];
  if (mine) {
    try {
      return { quote: realizedRate(parseDec(mine.paid), parseDec(mine.received), { base, quote: target, at: mine.at, receivedAt: mine.at }), mine: true };
    } catch {}
  }
  const market = marketQuote(base, target);
  return market ? { quote: market, mine: false } : null;
}
function marketQuote(base, target) {
  if (base === target) return null;
  const find = (c) => pivotQuotes.find((q) => q.quote === c);
  if (base === PIVOT) return find(target) || null;
  if (target === PIVOT) {
    const q = find(base);
    return q ? invert(q) : null;
  }
  const a = find(base);
  const b = find(target);
  if (!a || !b) return null;
  return cross(a, b, { toleranceMs: CROSS_TOLERANCE_MS });
}

// ---------- input ----------
let buf = "";
let acc = null; // Money or null when using "+"
function inputMoney() {
  const scale = currency(S.base).scale;
  const txt = buf || "0";
  let m;
  try {
    m = Money.of(txt, S.base);
  } catch (e) {
    if (e instanceof MoneyError && e.code === "MONEY_PRECISION") m = Money.of(txt, S.base, "DOWN");
    else m = Money.zero(S.base);
  }
  return acc ? acc.add(m) : m;
}
function key(k) {
  const scale = currency(S.base).scale;
  if (k === "C") {
    buf = "";
    acc = null;
  } else if (k === "⌫") buf = buf.slice(0, -1);
  else if (k === "+") {
    acc = inputMoney();
    buf = "";
  } else if (k === "=") {
    const m = inputMoney();
    acc = null;
    buf = m.isZero() ? "" : m.toDecimalString();
  } else if (k === ".") {
    if (scale === 0 || buf.includes(".")) return;
    buf = (buf || "0") + ".";
  } else if (k === "00") {
    if (buf && digitsOf(buf) < 12) buf += "00";
  } else {
    if (digitsOf(buf) >= 12) return;
    const frac = buf.split(".")[1];
    if (frac !== undefined && frac.length >= scale) return;
    buf = buf === "0" ? k : buf + k;
  }
  try {
    navigator.vibrate?.(6);
  } catch {}
  renderStage();
  renderTargets();
}
const digitsOf = (s) => s.replace(".", "").length;

// ---------- render ----------
const $ = (id) => document.getElementById(id);
function fmtAge(ms) {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}分前`;
  if (h < 48) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}
function renderStatus() {
  const pill = $("ratePill");
  const banner = $("banner");
  banner.hidden = true;
  banner.className = "banner";
  const labels = { fresh: "参考レート", stale: "古いレート", offline: "オフライン(保存レート)", loading: "取得中…", error: "レート取得失敗" };
  pill.className = `pill ${rateStatus.status}`;
  const age = pivotQuotes.length ? fmtAge(Date.now() - Date.parse(pivotQuotes[0].observedAt)) : "";
  pill.textContent = `${labels[rateStatus.status] || rateStatus.status}${age ? "・" + age : ""}`;
  if (rateStatus.status === "stale" || rateStatus.status === "offline") {
    banner.hidden = false;
    banner.textContent = `表示中のレートは ${age} のものです。通信できる場所で自動更新されます。古いレートでも換算はできますが、目安としてご覧ください。`;
  } else if (rateStatus.status === "error") {
    banner.hidden = false;
    banner.className = "banner error";
    banner.textContent = `レートを取得できず、保存済みのレートもありません。通信を確認して再読み込みしてください。(${rateStatus.error})`;
  }
}
function renderStage() {
  const meta = currency(S.base);
  $("baseCode").textContent = meta.code;
  $("baseName").textContent = meta.name.ja;
  const m = inputMoney();
  const shown = buf ? meta.symbol + groupDigits(buf) : m.format("ja-JP");
  $("amtIn").innerHTML = `${escapeHtml(shown)}<span class="caret"></span>`;
  $("inHint").textContent = acc ? `合計 ${m.format("ja-JP")} (${acc.format("ja-JP")} + 入力中)` : "";
}
function groupDigits(s) {
  const [i, f] = s.split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f !== undefined ? "." + f : "");
}
function renderTargets() {
  const ul = $("targets");
  const amount = inputMoney();
  const ordered = [...S.targets].sort((a, b) => Number(S.pinned.includes(b)) - Number(S.pinned.includes(a)));
  ul.innerHTML = "";
  for (const code of ordered) {
    const li = document.createElement("li");
    if (S.pinned.includes(code)) li.classList.add("pinned");
    const meta = currency(code);
    const qf = quoteFor(S.base, code);
    let valHtml = `<div class="val">—</div><div class="sub">レートなし</div>`;
    if (qf) {
      try {
        const r = convert(amount, qf.quote, { rounding: ROUNDING });
        let sub = `1 ${S.base} = ${trimRate(qf.quote.rate)} ${code}`;
        let subClass = "sub";
        if (qf.mine) {
          const mk = marketQuote(S.base, code);
          if (mk) {
            const sp = spreadPercent(mk, qf.quote);
            const worse = !sp.startsWith("-");
            sub = `自分レート。市場なら ${convert(amount, mk, { rounding: ROUNDING }).convertedAmount.format("ja-JP")}(${worse ? "" : "+"}${sp.replace("-", "")}% ${worse ? "損" : "得"})`;
            subClass = `sub ${worse ? "bad" : "good"}`;
          } else sub = "自分レート";
        } else if (qf.quote.confidence === "estimated" && qf.quote.notes?.some((n) => n.includes("skew"))) {
          sub += "・観測時刻ずれあり";
        }
        valHtml = `<div class="val ${qf.mine ? "mine" : ""}">${escapeHtml(r.convertedAmount.format("ja-JP"))}</div><div class="${subClass}">${escapeHtml(sub)}</div>`;
      } catch (e) {
        valHtml = `<div class="val">—</div><div class="sub bad">${escapeHtml(e.message)}</div>`;
      }
    }
    li.innerHTML = `
      <div class="code">${meta.code}<span class="name">${escapeHtml(meta.name.ja)}</span></div>
      <div>${valHtml}</div>
      <div class="tools">
        <button type="button" data-act="pin" data-code="${code}" aria-label="ピン留め">${S.pinned.includes(code) ? "★" : "☆"}</button>
        <button type="button" data-act="swap" data-code="${code}" aria-label="この通貨を基準にする">⇅</button>
        <button type="button" data-act="remove" data-code="${code}" aria-label="削除">×</button>
      </div>`;
    ul.appendChild(li);
  }
  $("targetCount").textContent = `${S.targets.length} / ${MAX_TARGETS} 通貨`;
  $("btnAddTarget").disabled = S.targets.length >= MAX_TARGETS;
}
function trimRate(r) {
  const d = parseDec(r);
  const digits = d.e > 6 ? 6 : d.e;
  const n = Number(r);
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(Math.min(6, digits || 6));
}
function renderMine() {
  const target = S.pinned[0] || S.targets[0];
  if (!target) {
    $("mineCard").hidden = true;
    return;
  }
  $("mineCard").hidden = false;
  $("lblPaid").textContent = `払った(${S.base})`;
  $("lblGot").textContent = `受け取った(${target})`;
  const mine = S.mine[`${S.base}/${target}`];
  if (mine) {
    $("paidHome").value = mine.paid;
    $("gotLocal").value = mine.received;
    const q = quoteFor(S.base, target);
    const mk = marketQuote(S.base, target);
    const sp = q && mk ? spreadPercent(mk, q.quote) : null;
    $("mineNote").textContent = `${S.base}→${target} は自分レート 1 ${S.base} = ${trimRate(q.quote.rate)} ${target} で表示中${sp ? `(市場中値との差 ${sp}%)` : ""}。設定日時 ${new Date(mine.at).toLocaleString("ja-JP")}`;
  } else {
    $("paidHome").value = "";
    $("gotLocal").value = "";
    $("mineNote").textContent = `対象ペア: ${S.base}→${target}(★ピン留めした最初の通貨)。市場中値ではなく、あなたが実際に受け取った数字で換算します。`;
  }
}
function renderHistory() {
  const ul = $("history");
  ul.innerHTML = "";
  $("historyEmpty").hidden = S.history.length > 0;
  for (const h of S.history.slice(0, 50)) {
    const li = document.createElement("li");
    li.innerHTML = `<div><div>${escapeHtml(h.lines[0])}</div><div class="t">${new Date(h.at).toLocaleString("ja-JP")}・${escapeHtml(h.source)}</div></div><div class="a">${escapeHtml(h.lines.slice(1).join(" / "))}</div>`;
    li.addEventListener("click", () => {
      S.base = h.base;
      buf = h.amount;
      acc = null;
      save();
      render();
      toast("履歴を復元しました");
    });
    ul.appendChild(li);
  }
}
function renderProvenance() {
  const dl = $("provList");
  const q = pivotQuotes[0];
  const prov = providers.find((p) => p.id === rateStatus.source);
  const rows = q
    ? [
        ["出典", `${q.source}${prov ? "・" + prov.description : ""}`],
        ["種別", `${q.rateKind}(${q.confidence === "confirmed" ? "確定" : "推定"})・${q.granularity === "daily" ? "日次" : q.granularity}`],
        ["観測時刻", `${new Date(q.observedAt).toLocaleString("ja-JP")} (UTC ${q.observedAt})`],
        ["取得時刻", new Date(q.receivedAt).toLocaleString("ja-JP")],
        ["期限", q.expiresAt ? new Date(q.expiresAt).toLocaleString("ja-JP") : "提供元が明示せず"],
        ["計算", `USD を介したクロスレート。丸めは ${ROUNDING}、通貨ごとの小数桁(ISO 4217)で1回だけ丸め`],
        ["注意", "市場参考レートです。両替所・カード・ATMの実際のレートは別物で、買値/売値・手数料が加わります。"],
      ]
    : [["状態", "レート未取得"]];
  dl.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
}
function render() {
  renderStatus();
  renderStage();
  renderTargets();
  renderMine();
  renderHistory();
  renderProvenance();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- picker ----------
function openPicker(onPick, disabled = []) {
  const dlg = $("picker");
  const list = $("pickerList");
  const search = $("pickerSearch");
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = "";
    for (const c of CURRENCIES.values()) {
      if (q && !(c.code.toLowerCase().includes(q) || c.name.ja.includes(q) || c.name.en.toLowerCase().includes(q))) continue;
      const li = document.createElement("li");
      if (disabled.includes(c.code)) li.classList.add("disabled");
      li.innerHTML = `<button type="button"><span class="code">${c.code}</span><span class="name">${escapeHtml(c.name.ja)}・${escapeHtml(c.name.en)}</span></button>`;
      li.querySelector("button").addEventListener("click", () => {
        dlg.close();
        onPick(c.code);
      });
      list.appendChild(li);
    }
  };
  search.value = "";
  search.oninput = draw;
  draw();
  dlg.showModal();
  search.focus();
}

// ---------- summary text (copy/share/record) ----------
function summary() {
  const amount = inputMoney();
  const lines = [amount.format("ja-JP") + ` (${S.base})`];
  for (const code of S.targets) {
    const qf = quoteFor(S.base, code);
    if (!qf) continue;
    try {
      lines.push(`${convert(amount, qf.quote, { rounding: ROUNDING }).convertedAmount.format("ja-JP")}${qf.mine ? "(自分レート)" : ""}`);
    } catch {}
  }
  const q = pivotQuotes[0];
  const src = q ? `${q.source} ${new Date(q.observedAt).toLocaleDateString("ja-JP")} 参考レート` : "レートなし";
  return { lines, src, amount };
}

// ---------- events ----------
$("pad").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) key(b.dataset.k);
});
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || $("picker").open) return;
  if (/^[0-9.]$/.test(e.key)) key(e.key);
  else if (e.key === "Backspace") key("⌫");
  else if (e.key === "Escape") key("C");
  else if (e.key === "+") key("+");
  else if (e.key === "Enter" || e.key === "=") key("=");
});
$("btnBase").addEventListener("click", () =>
  openPicker((code) => {
    S.targets = S.targets.filter((t) => t !== code);
    if (!S.targets.includes(S.base) && S.targets.length < MAX_TARGETS) S.targets.unshift(S.base);
    S.base = code;
    buf = "";
    acc = null;
    save();
    render();
  }),
);
$("btnAddTarget").addEventListener("click", () =>
  openPicker((code) => {
    if (code === S.base || S.targets.includes(code) || S.targets.length >= MAX_TARGETS) return;
    S.targets.push(code);
    save();
    render();
  }, [S.base, ...S.targets]),
);
$("targets").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const code = b.dataset.code;
  if (b.dataset.act === "pin") S.pinned = S.pinned.includes(code) ? S.pinned.filter((c) => c !== code) : [code, ...S.pinned];
  if (b.dataset.act === "remove") {
    S.targets = S.targets.filter((c) => c !== code);
    S.pinned = S.pinned.filter((c) => c !== code);
  }
  if (b.dataset.act === "swap") {
    const amount = inputMoney();
    const qf = quoteFor(S.base, code);
    S.targets = S.targets.filter((c) => c !== code);
    S.targets.unshift(S.base);
    const old = S.base;
    S.base = code;
    acc = null;
    if (qf && !amount.isZero()) {
      try {
        buf = convert(amount, qf.quote, { rounding: ROUNDING }).convertedAmount.toDecimalString();
      } catch {
        buf = "";
      }
    } else buf = "";
    S.pinned = S.pinned.filter((c) => c !== code);
    if (!S.pinned.includes(old)) S.pinned.unshift(old);
  }
  save();
  render();
});
$("btnSetMine").addEventListener("click", () => {
  const target = S.pinned[0] || S.targets[0];
  const paid = $("paidHome").value.trim();
  const got = $("gotLocal").value.trim();
  try {
    realizedRate(parseDec(paid), parseDec(got), { base: S.base, quote: target, at: new Date().toISOString(), receivedAt: new Date().toISOString() });
  } catch (e) {
    toast("2つの金額を正しく入れてください");
    return;
  }
  S.mine[`${S.base}/${target}`] = { paid, received: got, at: new Date().toISOString() };
  save();
  render();
  toast(`${S.base}→${target} を自分レートにしました`);
});
$("btnClearMine").addEventListener("click", () => {
  const target = S.pinned[0] || S.targets[0];
  delete S.mine[`${S.base}/${target}`];
  save();
  render();
});
$("btnClearHistory").addEventListener("click", () => {
  S.history = [];
  save();
  renderHistory();
});
$("btnRecord").addEventListener("click", () => {
  const { lines, src, amount } = summary();
  if (amount.isZero()) return toast("金額を入れてください");
  S.history.unshift({ at: new Date().toISOString(), base: S.base, amount: amount.toDecimalString(), lines, source: src });
  S.history = S.history.slice(0, 50);
  save();
  renderHistory();
  toast("記録しました");
});
$("btnCopy").addEventListener("click", async () => {
  const { lines, src } = summary();
  const text = `${lines.join(" = ")}\n${src}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("コピーしました");
  } catch {
    toast("コピーできませんでした");
  }
});
$("btnShare").addEventListener("click", async () => {
  const { lines, src } = summary();
  const text = `${lines.join(" = ")}\n${src}`;
  if (navigator.share) {
    try {
      await navigator.share({ text });
    } catch {}
  } else {
    try {
      await navigator.clipboard.writeText(text);
      toast("共有が使えない端末なのでコピーしました");
    } catch {
      toast("共有できませんでした");
    }
  }
});

let toastT;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 2200);
}

// ---------- boot ----------
buf = "1000";
render();
loadRates();
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

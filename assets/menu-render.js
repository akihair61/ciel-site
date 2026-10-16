/* Ciel — メニュー表の描画（ホームページ）
 * 値段・メニュー名・説明・並び・公開/非公開の原本は管理画面（Firestore の menus コレクション＝アプリと同じミラー）。
 * このファイルは「原本 → 表示」の変換だけを持つ。ブラウザ（menu*.html がその場で最新を描く）と
 * tools/prices/build.mjs（1時間ごとに静的HTML・data/menu.json・構造化データを書き直す）の両方が同じ関数を使う。
 * ここに値段を書かない。 */
(function (root) {
  'use strict';
  var PROJECT = 'ciel-hair-studio';
  var BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/';

  // 表示するカテゴリの順番と名前（アプリの category と同じ語）
  var CATS = [
    { key: 'First-Time Package', slug: 'first-time', ja: '初回限定パッケージ', en: 'First-Time Package', th: 'แพ็กเกจครั้งแรก' },
    { key: 'Head Spa Special Combo', slug: 'headspa-combo', ja: 'ヘッドスパ スペシャルコンボ', en: 'Head Spa Special Combo', th: 'เฮดสปา คอมโบพิเศษ' },
    { key: 'Hair Cut', slug: 'cut', ja: 'カット', en: 'Hair Cut', th: 'ตัดผม' },
    { key: 'Hair Colour', slug: 'colour', ja: 'カラー', en: 'Hair Colour', th: 'ทำสีผม' },
    { key: 'Perm', slug: 'perm', ja: 'パーマ・縮毛矯正', en: 'Perm & Straightening', th: 'ดัด & ยืดผม' },
    { key: 'Japanese Head Spa', slug: 'headspa', ja: 'ジャパニーズヘッドスパ', en: 'Japanese Head Spa', th: 'เฮดสปาญี่ปุ่น' },
    { key: 'Treatment', slug: 'treatment', ja: 'トリートメント', en: 'Treatment', th: 'ทรีตเมนต์' },
    { key: 'Others', slug: 'others', ja: 'その他', en: 'Others', th: 'อื่น ๆ' }
  ];
  var NOTE = {
    ja: '※カット以外の料金はすべて「〜」の目安料金です。髪の長さだけでなく、毛量・髪の状態によっても変わります。最終価格はカウンセリング時に確定します。施術前に最終価格を知りたい方は、担当スタッフにお尋ねください。',
    en: '※ All prices except cuts are "from" prices. The final price depends not only on hair length but also on hair volume and condition, and is confirmed at your counselling. If you would like to know the final price in advance, please ask your stylist before the service starts.',
    th: '※ ราคาทุกเมนูยกเว้นตัดผมเป็นราคาเริ่มต้น ราคาจริงขึ้นอยู่กับความยาว ปริมาณผม และสภาพเส้นผม และจะยืนยันตอนปรึกษา หากต้องการทราบราคาสุดท้ายก่อน กรุณาสอบถามช่างก่อนเริ่มทำ'
  };

  // ── Firestore REST の型付き値 → 素の値 ──
  function dec(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return !!v.booleanValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(dec);
    if ('mapValue' in v) { var o = {}, f = (v.mapValue || {}).fields || {}; for (var k in f) o[k] = dec(f[k]); return o; }
    return null;
  }
  function fromDoc(d) { var o = {}, f = d.fields || {}; for (var k in f) o[k] = dec(f[k]); if (!o.id) o.id = String(d.name || '').split('/').pop(); return o; }

  // 公開メニューだけ（管理画面で「非公開」・管理用・削除済みは出ない）
  function visible(m) {
    return Number(m.pub) === 1 && Number(m.adminOnly || 0) !== 1 && m.active !== false && !!m.category;
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function fmt(n) {
    n = Number(n) || 0;
    return Math.round(n) === n ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function maxOf(m) { var x = num(m.priceMax != null ? m.priceMax : m.pmax); var p = num(m.price) || 0; return (x != null && x > p) ? x : null; }
  function fromOf(m) { return Number(m.priceFrom != null ? m.priceFrom : m.pfrom) === 1; }
  // 「฿2,990〜4,500」「฿2,990〜」「฿1,200」（アプリ・Web予約・メールと同じ規則）
  function priceText(m, sep) {
    sep = sep || '〜';
    var p = num(m.price) || 0, x = maxOf(m);
    return '฿' + fmt(p) + (x != null ? sep + fmt(x) : (fromOf(m) ? sep : ''));
  }
  // 絵文字と【…】の飾りを外した名前（【】の中身は off バッジへ）
  function clean(s) {
    return String(s || '')
      .replace(/【[^】]*】/g, ' ')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, ' ')
      .replace(/[♨️]/g, ' ')
      .replace(/\s{2,}/g, ' ').trim();
  }
  function tagOf(m, lang) {
    var src = lang === 'ja' ? (m.name_ja || m.nameJa || m.name_en || m.name) : lang === 'th' ? (m.name_th || m.name_en || m.name) : (m.name_en || m.name);
    var t = (String(src || '').match(/【([^】]*)】/) || [])[1];
    if (t) return clean(t).replace(/\s*·+\s*/g, ' · ');
    var pc = num(m.percent);
    return (m.kind === 'coupon' && pc > 0) ? pc + '% OFF' : '';
  }
  function nameOf(m, lang) {
    var en = clean(m.name_en || m.nameEn || m.name);
    if (lang === 'ja') return clean(m.name_ja || m.nameJa) || en;
    if (lang === 'th') return clean(m.name_th) || en;
    return en;
  }
  function descOf(m, lang) {
    if (lang === 'ja') return String(m.desc_ja || m.descJa || '').trim();
    if (lang === 'th') return String(m.desc_th || '').trim() || String(m.desc_en || m.desc || '').trim();
    return String(m.desc_en || m.desc || '').trim();
  }
  function durText(min, lang) {
    min = Number(min) || 0; if (!min) return '';
    var h = min / 60, hs = (Math.round(h * 10) / 10).toString();
    if (lang === 'ja') return min >= 120 && min % 30 === 0 ? hs + '時間' : min + '分';
    if (lang === 'th') return min >= 120 && min % 30 === 0 ? hs + ' ชม.' : min + ' นาที';
    return min >= 120 && min % 30 === 0 ? hs + ' hrs' : min + ' min';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // 原本の配列 → 表示用モデル（カテゴリ順・管理画面の並び順）
  function model(rows) {
    var vis = rows.filter(visible).sort(function (a, b) { return (Number(a.order) || 9999) - (Number(b.order) || 9999) || String(a.id).localeCompare(String(b.id)); });
    var known = {}; CATS.forEach(function (c) { known[c.key] = 1; });
    var cats = CATS.slice();
    vis.forEach(function (m) { if (!known[m.category]) { known[m.category] = 1; cats.push({ key: m.category, slug: String(m.category).toLowerCase().replace(/[^a-z0-9]+/g, '-'), ja: m.category, en: m.category, th: m.category }); } });
    return cats.map(function (c) {
      var items = vis.filter(function (m) { return m.category === c.key; }).map(function (m) {
        return {
          id: m.id, kind: m.kind, price: num(m.price) || 0, max: maxOf(m), from: fromOf(m), priceText: priceText(m, '~'),
          off: { ja: tagOf(m, 'ja'), en: tagOf(m, 'en'), th: tagOf(m, 'th') }, dur: Number(m.dur || m.durationMinutes) || 0,
          name: { ja: nameOf(m, 'ja'), en: nameOf(m, 'en'), th: nameOf(m, 'th') },
          desc: { ja: descOf(m, 'ja'), en: descOf(m, 'en'), th: descOf(m, 'th') }
        };
      });
      return { key: c.key, slug: c.slug, title: { ja: c.ja, en: c.en, th: c.th }, items: items };
    }).filter(function (c) { return c.items.length; });
  }

  // 表示用モデル → メニュー表の HTML（menu*.html の #menu の中身）
  function html(cats, lang) {
    return cats.map(function (c) {
      var pn = c.key === 'Hair Cut' ? '' : '<div class="pricenote">' + esc(NOTE[lang] || NOTE.en) + '</div>';
      var rows = c.items.map(function (it) {
        var tg = it.off[lang] || it.off.en, off = tg ? '<span class="off">' + esc(tg) + '</span>' : '';
        var ds = it.desc[lang] ? '<div class="desc">' + esc(it.desc[lang]) + '</div>' : '';
        return '<div class="item" data-mid="' + esc(it.id) + '"><div class="nm">' + esc(it.name[lang]) + '<span class="dur">' + esc(durText(it.dur, lang)) + '</span></div><div class="pr">' + esc(it.priceText) + off + '</div>' + ds + pn + '</div>';
      }).join('');
      return '<div class="cat" id="' + esc(c.slug) + '"><div class="cat-h"><h2>' + esc(c.title[lang] || c.title.en) + '</h2><span class="en">' + esc(c.title.en) + '</span></div>' + rows + '</div>';
    }).join('');
  }

  // 構造化データ（Google 向け）の Offer 一覧
  function offers(cats) {
    var out = [];
    cats.forEach(function (c) {
      c.items.forEach(function (it) {
        var o = { '@type': 'Offer', 'sku': it.id, 'itemOffered': { '@type': 'Service', 'name': it.name.en }, 'priceCurrency': 'THB', 'price': String(it.price) };
        if (it.max != null) o.priceSpecification = { '@type': 'PriceSpecification', 'minPrice': String(it.price), 'maxPrice': String(it.max), 'priceCurrency': 'THB' };
        out.push(o);
      });
    });
    return out;
  }

  // ブラウザ: 管理画面の最新を読んでメニュー表を描き直す（読めなければ静的HTMLのまま）
  function fetchAll(fetchFn) {
    fetchFn = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    var rows = [];
    function page(tok) {
      return fetchFn(BASE + 'menus?pageSize=300' + (tok ? '&pageToken=' + encodeURIComponent(tok) : '')).then(function (r) {
        if (!r.ok) throw new Error('menus ' + r.status);
        return r.json();
      }).then(function (j) {
        (j.documents || []).forEach(function (d) { rows.push(fromDoc(d)); });
        return j.nextPageToken ? page(j.nextPageToken) : rows;
      });
    }
    return page('');
  }
  function live(lang, el) {
    el = el || (typeof document !== 'undefined' && document.getElementById('menu'));
    if (!el) return;
    fetchAll().then(function (rows) {
      var m = model(rows);
      if (m.length) el.innerHTML = html(m, lang);
    }).catch(function () { /* 静的HTMLのまま */ });
  }

  var api = { CATS: CATS, NOTE: NOTE, BASE: BASE, dec: dec, fromDoc: fromDoc, visible: visible, fmt: fmt, maxOf: maxOf, fromOf: fromOf, priceText: priceText, clean: clean, nameOf: nameOf, durText: durText, model: model, html: html, offers: offers, fetchAll: fetchAll, live: live };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CielMenu = api;
})(typeof window !== 'undefined' ? window : this);

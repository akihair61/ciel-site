// Phase 1 verification: migration v3→v4, simulation vs record, honest labels, reduced motion, export/import.
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.env.VERIFY_OUT || require("path").join(require("os").tmpdir(), "ci-verify-p1");
fs.mkdirSync(OUT, { recursive: true });
const URL = "http://localhost:8765/";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

(async () => {
  const browser = await chromium.launch();
  // --- A: legacy v3 data migrates, old key untouched ---
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
  await page.goto(URL); await page.waitForTimeout(2500); // let the first page's rate fetch settle so it cannot save over our seed
  const v3 = { onboarded: true, home: "JPY", sel: "THB", from: "JPY", to: "THB", balances: { JPY: "48000", THB: "9870.00" }, mine: {}, history: [{ at: "2026-10-27T01:00:00Z", ref: "EXC-AAAAA-BBBBB", from: "JPY", to: "THB", fromAmt: "1000", toAmt: "223.30", fromText: "¥1,000", toText: "฿223.30", rate: "0.2233", rateText: "1 JPY = 0.2233 THB", source: "x", sourceId: "coinbase", rateKind: "indicative", confidence: "estimated", observedAt: "2026-10-27T01:00:00Z", mine: false, rounding: "HALF_EVEN", balFrom: "¥47,000", balTo: "฿10,093.30" }], ledger: [{ kind: "convert", at: "2026-10-27T01:00:00Z", ref: "EXC-AAAAA-BBBBB", from: "JPY", to: "THB", fromText: "¥1,000", toText: "฿223.30", toAmt: "223.30", rateText: "1 JPY = 0.2233 THB" }, { kind: "add", at: "2026-10-26T01:00:00Z", ccy: "THB", amount: "9870.00", note: "booth" }], rateCache: null, liveCache: null, ticks: {}, series: {}, cardColor: {}, period: "1M" };
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem("ci.v3", JSON.stringify(v)); }, v3);
  await page.goto(URL + "?a=1#home"); // new query string forces a real reload (a bare hash change would not)
  await page.waitForTimeout(3500);
  const st = await page.evaluate(() => ({ v4: JSON.parse(localStorage.getItem("ci.v4") || "null"), v3: localStorage.getItem("ci.v3") }));
  check("A1 v4 written with schemaVersion 4", st.v4 && st.v4.schemaVersion === 4, JSON.stringify(st.v4 && st.v4.migrations));
  check("A2 legacy history marked legacy_convert", st.v4 && st.v4.history[0].kind === "legacy_convert");
  check("A3 legacy ledger convert flagged legacy", st.v4 && st.v4.ledger[0].legacy === true);
  check("A4 ci.v3 left untouched", st.v3 === JSON.stringify(v3));
  check("A5 balances preserved", st.v4 && st.v4.balances.JPY === "48000" && st.v4.balances.THB === "9870.00");
  const homeText = await page.locator("#s-home").innerText();
  check("A6 home shows manual-cash notice", /recorded by hand on this device/.test(homeText));
  check("A7 legacy conversion labelled in transactions", /Legacy \(pre-v4\)/.test(homeText));
  await page.screenshot({ path: `${OUT}/a_home.png` });

  // --- B: convert = simulation; balances unchanged ---
  await page.click('a[data-tab="convert"]'); await page.waitForTimeout(700);
  for (const k of ["1", "0", "0", "0"]) await page.click(`#pad button[data-k="${k}"]`);
  await page.waitForTimeout(300);
  const sub = await page.locator("#rateSub").innerText();
  check("B1 rate label never says Live", !/\bLive\b/i.test(sub), sub);
  await page.click("#btnConvert"); await page.waitForTimeout(1800);
  const bal1 = await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4")).balances);
  check("B2 simulation leaves balances unchanged", bal1.JPY === "48000" && bal1.THB === "9870.00", JSON.stringify(bal1));
  const led1 = await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4")).ledger.length);
  check("B3 simulation adds no ledger entry", led1 === 2, String(led1));
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4")).history[0]);
  check("B4 history entry is kind simulation with SIM ref", hist.kind === "simulation" && /^SIM-/.test(hist.ref), hist.ref);
  const doneText = await page.locator("#sheetDone").innerText();
  check("B5 done sheet says simulation / unchanged", /Simulation/.test(doneText) && /unchanged/.test(doneText));
  await page.screenshot({ path: `${OUT}/b_done.png` });
  // simulation receipt
  await page.click("#btnReceipt"); await page.waitForTimeout(5200);
  const rec = await page.locator("#paper").innerText();
  check("B6 simulation receipt labelled", /SIMULATION NOTE/.test(rec) && /SIMULATED/.test(rec) && /UNCHANGED/.test(rec), rec.slice(0, 80).replace(/\n/g, " "));
  await page.screenshot({ path: `${OUT}/b_receipt_sim.png` });

  // --- C: record as real exchange (confirm dialog) ---
  await page.click("#btnReceiptBack"); await page.waitForTimeout(600);
  for (const k of ["5", "0", "0"]) await page.click(`#pad button[data-k="${k}"]`);
  await page.click("#btnConvert"); await page.waitForTimeout(1800);
  page.once("dialog", (d) => { check("C1 confirm dialog before changing balances", /changes the balances/.test(d.message()), d.message().replace(/\n/g, " | ")); d.accept(); });
  await page.click("#btnRecordReal"); await page.waitForTimeout(5500);
  const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4")));
  check("C2 JPY balance reduced by 500", s2.balances.JPY === "47500", s2.balances.JPY);
  const got = s2.history[0];
  check("C3 THB balance increased by converted amount", s2.balances.THB === (9870 + Number(got.toAmt)).toFixed(2), `${s2.balances.THB} vs ${got.toAmt}`);
  check("C4 exchange ledger entry written with EXC ref", s2.ledger[0].kind === "exchange" && /^EXC-/.test(s2.ledger[0].ref) && got.kind === "exchange", s2.ledger[0].ref);
  const rec2 = await page.locator("#paper").innerText();
  check("C5 exchange receipt labelled RECORD", /EXCHANGE RECORD/.test(rec2) && /RECORDED/.test(rec2) && /NEW BALANCES/.test(rec2));
  const bak = await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4.bak")));
  check("C6 backup holds the pre-save state", bak && bak.balances.JPY === "48000");
  await page.screenshot({ path: `${OUT}/c_receipt_rec.png` });

  // --- D: rate sheet provenance rows ---
  await page.click("#btnReceiptBack"); await page.waitForTimeout(700);
  await page.click("#rateRow"); await page.waitForTimeout(600);
  const prov = await page.locator("#provRows").innerText();
  check("D1 provenance has Freshness row and Observed honesty", /Freshness/.test(prov) && /Observed/.test(prov), prov.replace(/\n/g, " | ").slice(0, 200));
  check("D2 sheet has motion + data sections", (await page.locator("#motionChips").count()) === 1 && (await page.locator("#btnExport").count()) === 1);
  await page.screenshot({ path: `${OUT}/d_rate_sheet.png`, fullPage: false });

  // --- E: export then import round trip ---
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btnExport")]);
  const file = `${OUT}/export.json`; await dl.saveAs(file);
  const exp = JSON.parse(fs.readFileSync(file, "utf8"));
  check("E1 export has envelope + schemaVersion", exp.app === "currency-intelligence" && exp.schemaVersion === 4 && exp.data.balances.JPY === "47500");
  // corrupt import rejected
  const bad = `${OUT}/bad.json`; fs.writeFileSync(bad, JSON.stringify({ app: "currency-intelligence", schemaVersion: 4, data: { balances: { JPY: 12 } } }));
  await page.setInputFiles("#importFile", bad); await page.waitForTimeout(500);
  const toast1 = await page.locator("#toast").innerText();
  check("E2 invalid import rejected with reason", /rejected/.test(toast1), toast1);
  // good import of a modified file
  exp.data.balances.JPY = "1"; const good = `${OUT}/good.json`; fs.writeFileSync(good, JSON.stringify(exp));
  page.once("dialog", (d) => d.accept());
  await page.setInputFiles("#importFile", good); await page.waitForTimeout(800);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4")).balances.JPY);
  check("E3 valid import replaces data after confirm", after === "1", after);
  // newer schema rejected
  const newer = `${OUT}/newer.json`; fs.writeFileSync(newer, JSON.stringify({ ...exp, data: { ...exp.data, schemaVersion: 9 } }));
  await page.setInputFiles("#importFile", newer); await page.waitForTimeout(500);
  check("E4 newer schema rejected", /newer/.test(await page.locator("#toast").innerText()));
  await ctx.close();

  // --- F: reduced motion honoured (OS setting) ---
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const p2 = await ctx2.newPage();
  await p2.goto(URL); await p2.waitForTimeout(2500);
  await p2.evaluate((v) => { localStorage.clear(); localStorage.setItem("ci.v4", JSON.stringify({ ...v, schemaVersion: 4, motion: "auto" })); }, v3);
  const t0 = Date.now(); await p2.goto(URL + "?f=1#home");
  await p2.waitForFunction(() => !document.getElementById("s-home").hidden, null, { timeout: 5000 });
  const dt = Date.now() - t0;
  check("F1 reduced motion: home visible immediately (no 2.1s splash wait)", dt < 1500 && (await p2.evaluate(() => document.body.classList.contains("reduced"))), `${dt}ms`);
  await p2.click('a[data-tab="convert"]'); await p2.waitForTimeout(200);
  for (const k of ["1", "0", "0"]) await p2.click(`#pad button[data-k="${k}"]`);
  const t1 = Date.now(); await p2.click("#btnConvert"); await p2.waitForFunction(() => !document.getElementById("sheetDone").hidden); const dt1 = Date.now() - t1;
  check("F2 reduced motion: result sheet appears without the 1s loading morph", dt1 < 500, `${dt1}ms`);
  // in-app override: motion "on" even with OS reduce
  await p2.evaluate(() => { const s = JSON.parse(localStorage.getItem("ci.v4")); s.motion = "on"; localStorage.setItem("ci.v4", JSON.stringify(s)); });
  await p2.goto(URL + "?f=2#home"); await p2.waitForTimeout(400);
  check("F3 in-app 'On' overrides OS setting", !(await p2.evaluate(() => document.body.classList.contains("reduced"))));
  await ctx2.close();
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  process.exit(fails.length ? 1 : 0);
})();

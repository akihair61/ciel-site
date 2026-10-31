// F06 rate alerts: create, fire on refresh, cooldown, expiry, history, bell indicator, notification permission.
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = process.env.VERIFY_OUT || require("path").join(require("os").tmpdir(), "ci-verify-p3");
fs.mkdirSync(OUT, { recursive: true });
const URL = "http://localhost:8765/";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
const seed = { schemaVersion: 4, onboarded: true, home: "JPY", sel: "THB", from: "JPY", to: "THB", balances: { JPY: "48000", THB: "9870.00" }, motion: "off" };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-US", permissions: ["notifications"] });
  const page = await ctx.newPage(); const errs = []; const notifs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(2500);
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem("ci.v4", JSON.stringify(v)); }, seed);
  await page.goto(URL + "?p3=1#home"); await page.waitForTimeout(700);
  await page.evaluate(() => { window.__notifs = []; const Orig = window.Notification; window.Notification = function (title, opts) { window.__notifs.push({ title, body: opts && opts.body }); }; window.Notification.permission = "granted"; window.Notification.requestPermission = async () => "granted"; });

  await page.click("#qMore"); await page.click("#btnMoreAlerts"); await page.waitForTimeout(300);
  const sheet = await page.locator("#sheetAlerts").innerText();
  check("A1 alerts sheet opens with the honesty note and permission state", /checked only while this app is open/.test(sheet) && /Notifications enabled/.test(sheet), sheet.slice(0, 120).replace(/\n/g, " | "));
  const now = await page.evaluate(() => document.querySelector("#alNow").textContent);
  check("A2 current rate shown with its source label", /Current: 1 JPY = 0\.\d+ THB/.test(now) && /Sample rate|Coinbase|ECB|Reference/.test(now), now);
  // create an alert that is already satisfied: "falls below 1" → fires on the immediate check
  await page.click('#alDir button[data-v="below"]'); await page.fill("#alThreshold", "1"); await page.click('#alCooldown button[data-v="60"]'); await page.click("#btnAlertCreate"); await page.waitForTimeout(400);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4")));
  check("A3 alert saved with expiry (30 days) and cooldown", st.alerts.length === 1 && st.alerts[0].direction === "below" && st.alerts[0].cooldownMs === 3600000 && st.alerts[0].expiresAt && Date.parse(st.alerts[0].expiresAt) > Date.now() + 29 * 864e5, JSON.stringify(st.alerts[0]).slice(0, 160));
  check("A4 satisfied alert fired once and was logged with source and observation info", st.alerts[0].fireCount === 1 && st.alertLog.length === 1 && st.alertLog[0].source && "observedAt" in st.alertLog[0], JSON.stringify(st.alertLog[0]));
  const n = await page.evaluate(() => window.__notifs);
  check("A5 a browser notification was issued with the rate, source and fetch time", n.length === 1 && /1 JPY = /.test(n[0].body) && /fetched/.test(n[0].body), JSON.stringify(n[0]));
  const listText = await page.locator("#alertList").innerText();
  check("A6 list shows 'Fired ×1' and the condition text", /Fired ×1/.test(listText) && /falls below 1/.test(listText), listText.replace(/\n/g, " | "));
  await page.screenshot({ path: `${OUT}/alerts.png` });
  // cooldown: another refresh does not fire again
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(800);
  const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4")));
  check("A7 cooldown prevents a second fire on the next check", st2.alerts[0].fireCount === 1 && st2.alertLog.length === 1);
  // expiry: backdate expiresAt and lastFiredAt → next check deactivates it, no fire
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("ci.v4")); s.alerts[0].expiresAt = new Date(Date.now() - 1000).toISOString(); s.alerts[0].lastFiredAt = new Date(Date.now() - 7200e3).toISOString(); localStorage.setItem("ci.v4", JSON.stringify(s)); });
  await page.goto(URL + "?p3=2#home");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("ci.v4")).alerts[0].active === false, null, { timeout: 10000 }).catch(() => {});
  const st3 = await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4")));
  check("A8 expired alert is deactivated and does not fire", st3.alerts[0].active === false && st3.alerts[0].fireCount === 1);
  await page.click("#qMore"); await page.click("#btnMoreAlerts"); await page.waitForTimeout(300);
  check("A9 expired status shown and history keeps the fire", /Expired/.test(await page.locator("#alertList").innerText()) && (await page.locator("#alertLog li").count()) === 1);
  // bell indicator: unseen fire shows the dot; opening the sheet clears it
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("ci.v4")); s.alertsSeenAt = null; localStorage.setItem("ci.v4", JSON.stringify(s)); });
  await page.goto(URL + "?p3=3#home"); await page.waitForTimeout(700);
  const dotBefore = await page.evaluate(() => getComputedStyle(document.querySelector("#btnBell .dotn")).display);
  await page.click("#btnBell"); await page.waitForTimeout(300);
  const dotAfter = await page.evaluate(() => getComputedStyle(document.querySelector("#btnBell .dotn")).display);
  check("A10 bell dot shows for unseen fires and clears when opened", dotBefore !== "none" && dotAfter === "none", `${dotBefore} → ${dotAfter}`);
  // delete
  await page.click('#alertList button[data-act="del"]'); await page.waitForTimeout(200);
  check("A11 delete removes the alert", (await page.evaluate(() => JSON.parse(localStorage.getItem("ci.v4")).alerts.length)) === 0);
  // import validation rejects a bad alert
  const bad = `${OUT}/bad-alert.json`; fs.writeFileSync(bad, JSON.stringify({ app: "currency-intelligence", schemaVersion: 4, data: { alerts: [{ id: "x", from: "JPY", to: "THB", threshold: "abc", direction: "above" }] } }));
  await page.click('#sheetAlerts [data-close]'); await page.waitForTimeout(300);
  await page.click("#qMore"); await page.click("#btnMoreSettings"); await page.waitForTimeout(300);
  await page.setInputFiles("#importFile", bad); await page.waitForTimeout(400);
  check("A12 import rejects malformed alerts", /rejected/.test(await page.locator("#toast").innerText()));
  check("E0 no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close(); await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  process.exit(fails.length ? 1 : 0);
})();

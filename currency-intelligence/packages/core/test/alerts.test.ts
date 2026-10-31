import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAlerts, conditionMet, alertStatus, validateAlertInput, type RateAlert } from "../src/alerts.ts";
import type { RateQuote } from "../src/rates.ts";

const T0 = Date.parse("2026-10-31T01:00:00Z");
const q = (rate: string, observedAt: string | null = null): RateQuote => ({ quoteId: "x", base: "JPY", quote: "THB", rate, source: "coinbase", observedAt, receivedAt: new Date(T0).toISOString(), rateKind: "indicative", confidence: "estimated" });
const alert = (over: Partial<RateAlert> = {}): RateAlert => ({ id: "a1", from: "JPY", to: "THB", threshold: "0.2200", direction: "above", createdAt: new Date(T0 - 1000).toISOString(), expiresAt: null, cooldownMs: 3600_000, active: true, lastFiredAt: null, fireCount: 0, ...over });

test("fires when the rate crosses the threshold in the alert's direction, inclusive", () => {
  assert.equal(conditionMet(alert(), "0.2200"), true);
  assert.equal(conditionMet(alert(), "0.2199"), false);
  assert.equal(conditionMet(alert({ direction: "below" }), "0.2199"), true);
  assert.equal(conditionMet(alert({ direction: "below" }), "0.2201"), false);
  const r = evaluateAlerts([alert()], () => q("0.2234", null), T0, () => "f1");
  assert.equal(r.fires.length, 1);
  assert.equal(r.fires[0].observedAt, null); // honesty: unknown observation time is carried through
  assert.equal(r.fires[0].source, "coinbase");
  assert.equal(r.alerts[0].fireCount, 1);
  assert.equal(r.alerts[0].lastFiredAt, new Date(T0).toISOString());
});

test("cooldown suppresses repeat fires until it elapses", () => {
  const first = evaluateAlerts([alert()], () => q("0.23"), T0);
  const again = evaluateAlerts(first.alerts, () => q("0.23"), T0 + 10 * 60_000);
  assert.equal(again.fires.length, 0);
  const later = evaluateAlerts(first.alerts, () => q("0.23"), T0 + 61 * 60_000);
  assert.equal(later.fires.length, 1);
  assert.equal(later.alerts[0].fireCount, 2);
});

test("expired alerts are deactivated and never fire; paused alerts are skipped; missing quotes do nothing", () => {
  const r = evaluateAlerts([alert({ expiresAt: new Date(T0 - 1).toISOString() })], () => q("0.23"), T0);
  assert.equal(r.fires.length, 0);
  assert.deepEqual(r.expired, ["a1"]);
  assert.equal(r.alerts[0].active, false);
  assert.equal(alertStatus(r.alerts[0], T0), "expired"); // expiry wins over the auto-pause
  assert.equal(alertStatus(alert({ expiresAt: new Date(T0 + 1).toISOString() }), T0), "active");
  assert.equal(evaluateAlerts([alert({ active: false })], () => q("0.23"), T0).fires.length, 0);
  assert.equal(evaluateAlerts([alert()], () => null, T0).fires.length, 0);
});

test("input validation", () => {
  assert.equal(validateAlertInput({ from: "JPY", to: "THB", threshold: "0.22", direction: "above", cooldownMs: 0, expiresAt: null }), null);
  assert.match(validateAlertInput({ from: "JPY", to: "JPY", threshold: "0.22", direction: "above", cooldownMs: 0, expiresAt: null })!, /differ/);
  assert.match(validateAlertInput({ from: "JPY", to: "THB", threshold: "abc", direction: "above", cooldownMs: 0, expiresAt: null })!, /decimal/);
  assert.match(validateAlertInput({ from: "JPY", to: "THB", threshold: "0", direction: "above", cooldownMs: 0, expiresAt: null })!, /> 0/);
  assert.match(validateAlertInput({ from: "JPY", to: "THB", threshold: "1", direction: "above", cooldownMs: 0, expiresAt: "nope" })!, /date/);
});

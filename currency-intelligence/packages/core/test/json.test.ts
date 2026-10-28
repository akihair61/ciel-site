import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonPreservingNumbers, normaliseNumberText, numText, asObject, JsonError, type JsonValue } from "../src/json.ts";

test("numbers keep every digit (JSON.parse would not)", () => {
  const text = '{"rate": 150.123456789012345678901234, "n": -0.000000000000000001, "big": 123456789012345678901234567890}';
  const v = asObject(parseJsonPreservingNumbers(text))!;
  assert.equal(numText(v.rate), "150.123456789012345678901234");
  assert.equal(numText(v.n), "-0.000000000000000001");
  assert.equal(numText(v.big), "123456789012345678901234567890");
  assert.notEqual(String(JSON.parse(text).rate), "150.123456789012345678901234");
});

test("exponent notation is normalised to plain decimal text", () => {
  assert.equal(normaliseNumberText("1.5e3"), "1500");
  assert.equal(normaliseNumberText("1.2E-3"), "0.0012");
  assert.equal(normaliseNumberText("-2e0"), "-2");
  assert.equal(normaliseNumberText("0.50"), "0.50");
  const arr = parseJsonPreservingNumbers("[1e2]");
  assert.equal(numText(arr), null); // arrays are not numbers
  assert.equal(numText((arr as JsonValue[])[0]), "100");
});

test("strings, escapes, nesting, booleans, null", () => {
  const v = parseJsonPreservingNumbers('{"a":"x\\"y\\u00e9","b":[true,false,null,{"c":[]}],"d":{}}') as never;
  assert.deepEqual(v, { a: 'x"yé', b: [true, false, null, { c: [] }], d: {} });
});

test("rejects malformed and oversized input, keeps __proto__ inert", () => {
  assert.throws(() => parseJsonPreservingNumbers("{"), JsonError);
  assert.throws(() => parseJsonPreservingNumbers("[1,]"), JsonError);
  assert.throws(() => parseJsonPreservingNumbers('{"a":1} x'), JsonError);
  assert.throws(() => parseJsonPreservingNumbers("1".repeat(10), { maxBytes: 5 }), JsonError);
  assert.throws(() => parseJsonPreservingNumbers("[".repeat(100) + "]".repeat(100), { maxDepth: 10 }), JsonError);
  const o = parseJsonPreservingNumbers('{"__proto__":{"polluted":1}}') as { [k: string]: unknown };
  assert.equal(({} as { polluted?: unknown }).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(o, "__proto__"), true);
});

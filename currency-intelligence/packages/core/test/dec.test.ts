import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUNDING_MODES, decToString, divDec, mulDec, parseDec, roundDiv, scaleTo, numberToDecString } from "../src/dec.ts";

test("parseDec / decToString round trip", () => {
  for (const s of ["0", "1", "-1", "1234.5678", "-0.001", "100.00"]) {
    assert.equal(decToString(parseDec(s)), s === "-0.001" ? "-0.001" : s);
  }
  assert.throws(() => parseDec("1e5"));
  assert.throws(() => parseDec("1,000"));
  assert.throws(() => parseDec(""));
});

test("roundDiv implements every mode like java.math.RoundingMode", () => {
  // n/d = 2.5, -2.5, 2.4, 2.6, 3.5
  const cases: Record<string, [bigint, bigint, bigint, bigint, bigint]> = {
    // mode: [2.5, -2.5, 2.4, 2.6, 3.5]
    HALF_UP: [3n, -3n, 2n, 3n, 4n],
    HALF_DOWN: [2n, -2n, 2n, 3n, 3n],
    HALF_EVEN: [2n, -2n, 2n, 3n, 4n],
    UP: [3n, -3n, 3n, 3n, 4n],
    DOWN: [2n, -2n, 2n, 2n, 3n],
    CEILING: [3n, -2n, 3n, 3n, 4n],
    FLOOR: [2n, -3n, 2n, 2n, 3n],
  };
  const inputs: [bigint, bigint][] = [
    [25n, 10n],
    [-25n, 10n],
    [24n, 10n],
    [26n, 10n],
    [35n, 10n],
  ];
  for (const mode of ROUNDING_MODES) {
    inputs.forEach(([n, d], i) => {
      assert.equal(roundDiv(n, d, mode), cases[mode][i], `${mode} ${n}/${d}`);
    });
  }
});

test("scaleTo and divDec", () => {
  assert.equal(decToString(scaleTo(parseDec("1.005"), 2, "HALF_EVEN")), "1.00");
  assert.equal(decToString(scaleTo(parseDec("1.005"), 2, "HALF_UP")), "1.01");
  assert.equal(decToString(scaleTo(parseDec("1.5"), 3, "DOWN")), "1.500");
  assert.equal(decToString(divDec(parseDec("1"), parseDec("3"), 6, "HALF_EVEN")), "0.333333");
  assert.equal(decToString(divDec(parseDec("22500"), parseDec("100000"), 4, "HALF_EVEN")), "0.2250");
  assert.equal(decToString(mulDec(parseDec("1.5"), parseDec("0.2"))), "0.30");
});

test("numberToDecString never emits exponent notation", () => {
  assert.equal(numberToDecString(0.0000012), "0.0000012");
  assert.equal(numberToDecString(150), "150");
  assert.equal(numberToDecString(33.456789), "33.456789");
  assert.throws(() => numberToDecString(NaN));
});

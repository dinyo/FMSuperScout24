'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adjustedInterestThreshold } = require('../tools/fm-formulas/interest-threshold');

test('recovered JS threshold matches all 12 observed native intermediate values', () => {
  // Captured at transfer RVA 0x48709D6 / loan RVA 0x48700CD, manager CA 163.
  // These expected values came from native registers, not from the JS function.
  const transfer = [-9260, -1260, 740, 5740, 10740, 30740];
  const loan = [-4630, -630, 370, 2870, 5370, 15370];
  for (let level = 1; level <= 6; level++) {
    assert.equal(adjustedInterestThreshold(level, 163), transfer[level - 1]);
    assert.equal(adjustedInterestThreshold(level, 163, true), loan[level - 1]);
  }
});

test('unknown or invalid inputs cannot silently become an exact threshold', () => {
  for (const ca of [null, undefined, NaN, '163', -1, 201, 12.5])
    assert.throws(() => adjustedInterestThreshold(1, ca), RangeError);
  for (const level of [0, 7, null, '1', 1.5])
    assert.throws(() => adjustedInterestThreshold(level, 163), RangeError);
  assert.throws(() => adjustedInterestThreshold(1, 163, 'loan'), TypeError);
});

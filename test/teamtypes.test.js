'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness');

test('team chips classify FM reserve type 30 as reserves', () => {
  const app = loadApp();

  assert.equal(app.teamGroup(0), 'first');
  assert.equal(app.teamGroup(3), 'res');
  assert.equal(app.teamGroup(30), 'res');
  assert.equal(app.teamGroup(12), 'youth');
  assert.equal(app.teamGroup(null), null);
});

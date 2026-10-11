'use strict';

const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness');

const app = loadApp();
const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');

test('the app uses English copy without language-switching hooks', () => {
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html, /data-i18n|language-selector|language-switcher/i);
  assert.equal(Object.hasOwn(app.state, 'lang'), false);
  assert.equal(app.FORMAT_LOCALE, 'en-GB');
  assert.ok(Object.values(app.TEXT).every((value) => typeof value === 'string' && value.length > 0));
});

test('nation data stores one English name and EU eligibility per nation', () => {
  const nationIds = Object.keys(app.NATIONS);

  assert.ok(nationIds.length >= 220, `Expected at least 220 nations, found ${nationIds.length}`);
  for (const id of nationIds) {
    const nation = app.NATIONS[id];
    assert.equal(nation.length, 2, `NATIONS[${id}] should have two fields`);
    assert.ok(typeof nation[0] === 'string' && nation[0].length > 0, `NATIONS[${id}] has no name`);
    assert.ok(nation[1] === 0 || nation[1] === 1, `NATIONS[${id}] has an invalid EU flag`);
  }

  assert.deepEqual(app.NATIONS[784], ['Netherlands', 1]);
  assert.equal(app.NATIONS[1651][1], 0);
  assert.equal(app.isEu({ natId: 784 }), true);
  assert.equal(app.isEu({ natId: 1651 }), false);
});

test('legacy dump labels display in English', () => {
  assert.equal(app.natsLabel({ natId: 784, nat: ['Nederland'] }), 'Netherlands');
  assert.equal(app.natsLabel({ nat: ['Nederland'] }), 'Netherlands');
  assert.equal(app.jobLabel({ jobId: 34, job: 'Keeperstrainer' }), 'Goalkeeping coach');
  assert.equal(app.jobLabel({ job: 'Staflid' }), 'Staff');
  assert.equal(app.staffAttrName('Aanvallen'), 'Attacking');
  assert.equal(app.staffAttrName('Oordeel_vermogen'), 'Judging Player Ability');
});

test('wage display period conversion is stable', () => {
  app.state.wagePer = 'w';
  assert.equal(app.wageFactor(), 1);
  app.state.wagePer = 'y';
  assert.equal(app.wageFactor(), 52);
  app.state.wagePer = 'm';
  assert.ok(Math.abs(app.wageFactor() - 52 / 12) < 1e-9);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createShortlistFmf, importShortlistFmf } = require('../app/fmf');

test('FM24 version-8 FMF export imports back with unique player IDs', () => {
  const archive = createShortlistFmf('My shortlist', [101, 202, 101, 0]).data;
  const imported = importShortlistFmf(archive);

  assert.equal(imported.version, 8);
  assert.equal(imported.name, 'My shortlist');
  assert.deepEqual(imported.ids, [101, 202]);
});

test('FMF importer rejects a non-shortlist file', () => {
  assert.throws(() => importShortlistFmf(Buffer.alloc(80, 0x41)), /Not an FMF shortlist archive/);
});

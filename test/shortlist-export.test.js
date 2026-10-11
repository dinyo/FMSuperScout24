'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'scripts', '06-shortlist-and-clipboard.js'),
  'utf8',
);

test('FMF export downloads through a blob link when the save picker is unavailable', async () => {
  const blob = { bytes: [1, 2, 3] };
  const link = {
    clickCount: 0,
    removeCount: 0,
    click() {
      this.clickCount++;
    },
    remove() {
      this.removeCount++;
    },
  };
  const timers = [];
  const downloads = [];
  const fetchCalls = [];
  const fileUrl = 'blob:shortlist-export';
  const fakeUrl = {
    createObjectURL(value) {
      assert.equal(value, blob);
      return fileUrl;
    },
    revokeObjectURL(value) {
      downloads.push({ revoked: value });
    },
  };
  const document = {
    body: {
      appendChild(element) {
        downloads.push({ appended: element });
      },
    },
    createElement(tag) {
      assert.equal(tag, 'a');
      return link;
    },
  };
  const window = {};
  const state = {
    players: [{ id: 123 }],
    shortlist: new Set([123]),
    meta: { gameDate: '2024-07-01' },
  };
  const fetch = async (...args) => {
    fetchCalls.push(args);
    return { ok: true, blob: async () => blob };
  };
  const getElement = () => ({ className: '', innerHTML: '' });
  const exportShortlistFmf = new Function(
    'state',
    'window',
    'document',
    'fetch',
    'URL',
    'setTimeout',
    '$',
    'icon',
    'escHtml',
    'text',
    'tf',
    'coffeeGlow',
    `${source}\nreturn exportShortlistFmf;`,
  )(
    state,
    window,
    document,
    fetch,
    fakeUrl,
    (callback, delay) => timers.push({ callback, delay }),
    getElement,
    () => '',
    (value) => String(value),
    (key) => key,
    (key) => key,
    () => {},
  );

  await exportShortlistFmf();

  assert.equal(typeof window.showSaveFilePicker, 'undefined');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0][0], '/api/shortlist-fmf');
  assert.deepEqual(JSON.parse(fetchCalls[0][1].body), {
    name: 'FMSuperScout 24 2024-07-01',
    ids: [123],
  });
  assert.equal(link.href, fileUrl);
  assert.equal(link.download, 'FMSuperScout 24 2024-07-01.fmf');
  assert.equal(link.clickCount, 1);
  assert.equal(link.removeCount, 1);
  assert.equal(timers[0].delay, 30000);
  timers[0].callback();
  assert.deepEqual(downloads.at(-1), { revoked: fileUrl });
});

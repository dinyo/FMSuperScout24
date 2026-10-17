'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/scripts/03b-native-transfer-data.js'), 'utf8');
function setup() {
  const elements = new Map();
  const requests = [];
  const context = vm.createContext({
    state: { meta: {}, bulkSelected: new Set(), allPlayers: [] },
    $: (id) => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); },
    FILTER_RESULT_CACHE: new Map(), applyFilters() {}, showDetail() {},
    updateGameInterestFilterOptions() {}, updateAskingPriceFilterAvailability() {},
    setTimeout, fetch: async (url, options) => {
      requests.push({ url, options });
      return { json: async () => ({ ok: true, rows: [{ id: 1, fmValueRead: true, valueMin: 20, valueMax: 30 }] }) };
    },
  });
  vm.runInContext(source, context);
  return { context, requests };
}
test('FM transfer reads stay paused after initialization and reset', async () => {
  const { context, requests } = setup();
  assert.equal(context.state.nativeTransfer.paused, true);
  await vm.runInContext('resetNativeTransferData()', context);
  assert.equal(context.state.nativeTransfer.paused, true);
  vm.runInContext('queueNativeTransferData([{id: 1, attrs: {}}])', context);
  assert.deepEqual(requests.map((r) => r.url), ['/api/native-transfer/status']);
});
test('an explicitly queued read preserves the original value and pauses at completion', async () => {
  const { context, requests } = setup();
  vm.runInContext('state.nativeTransfer.available = true; state.nativeTransfer.paused = false; state.allPlayers = [{id: 1, attrs: {}, value: 10}]; nativeTransferQueue.set(1, state.allPlayers[0]);', context);
  await vm.runInContext('readNativeTransferQueue()', context);
  assert.equal(requests.length, 1);
  assert.equal(context.state.allPlayers[0].value, 10);
  assert.equal(context.state.allPlayers[0].valueMin, 20);
  assert.equal(context.state.nativeTransfer.paused, true);
});
test('large reads are sent in bounded batches and update every queued player', async () => {
  const { context } = setup();
  const batches = [];
  context.fetch = async (url, options) => {
    const ids = JSON.parse(options.body).ids;
    batches.push(ids);
    return { json: async () => ({ ok: true, rows: ids.map((id) => ({ id, fmValueRead: true })) }) };
  };
  vm.runInContext(`
    state.nativeTransfer.available = true;
    state.nativeTransfer.paused = false;
    state.allPlayers = Array.from({length: 257}, (_, i) => ({id: i + 1, attrs: {}}));
    for (const player of state.allPlayers) nativeTransferQueue.set(player.id, player);
  `, context);
  await vm.runInContext('readNativeTransferQueue()', context);
  assert.deepEqual(batches.map((ids) => ids.length), [128, 128, 1]);
  assert.equal(context.state.nativeTransfer.read, 257);
  assert.ok(context.state.allPlayers.every((player) => player.nativeTransferRead && player.fmValueRead));
  assert.equal(context.state.nativeTransfer.paused, true);
});
test('selected-row reads queue only selected players', async () => {
  const { context, requests } = setup();
  const controls = fs.readFileSync(path.join(__dirname, '../app/scripts/12-ui-controls.js'), 'utf8');
  const start = controls.indexOf('function startManualNativeTransferRead(');
  const end = controls.indexOf("$('btn-fm-transfer-read').onclick", start);
  vm.runInContext(controls.slice(start, end), context);
  vm.runInContext('state.nativeTransfer.available = true; state.allPlayers = [{id: 1, attrs: {}}, {id: 2, attrs: {}}]; state.bulkSelected.add(1); startManualNativeTransferRead(true)', context);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(JSON.parse(requests[0].options.body).ids, [1]);
  assert.equal(context.state.allPlayers[1].nativeTransferRead, undefined);
});


test('interest availability follows loan mode and recognizes Not interested', () => {
  const elements = new Map([['f-interest', { value: '' }]]);
  const context = vm.createContext({
    state: { nativeTransfer: { available: false } },
    $: (id) => elements.get(id), text: (key) => key,
    FM_INTEREST_LEVELS: ['Doubtful', 'Interested'],
    gameInterestLabel: (p) => p.gameLoanInterest,
    gameInterestOrder: (value) => value === 'Not interested' ? -2 : value === 'Interested' ? 1 : -1,
  });
  const loading = fs.readFileSync(path.join(__dirname, '../app/scripts/03-data-loading.js'), 'utf8');
  const start = loading.indexOf('function updateGameInterestFilterOptions(');
  const end = loading.indexOf('function updateAskingPriceFilterAvailability(', start);
  vm.runInContext(loading.slice(start, end), context);
  vm.runInContext("updateGameInterestFilterOptions([{ gameLoanInterest: 'Not interested' }])", context);
  assert.equal(elements.get('f-interest').disabled, false);
  vm.runInContext("updateGameInterestFilterOptions([{ gameInterest: 'Interested' }])", context);
  assert.equal(elements.get('f-interest').disabled, true);
});

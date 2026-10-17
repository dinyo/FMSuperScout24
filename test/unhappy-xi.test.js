'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness');
function player(id, positions, happiness) {
  return { id, name: `Player ${id}`, attrs: { Pace: 10 }, posArr: positions,
    posProficiency: Object.fromEntries(positions.map((pos) => [pos, 20])),
    playingTimeHappiness: happiness, playingTimeHappinessStatus: 'Dissatisfied' };
}
const left = { role: 'fb', line: 'df', side: 'L', t: 75, l: 15 };
const right = { role: 'fb', line: 'df', side: 'R', t: 75, l: 85 };
test('unhappy XI uses the lowest happiness score at an eligible position without duplicates', () => {
  const app = loadApp();
  app.state.xiProfThreshold = 15;
  const squad = [player(1, ['DL', 'DR'], -90), player(2, ['DL'], -70), player(3, ['DR'], -10), player(4, ['DL'], null)];
  const scores = app.indexPositionScores(squad, 'happiness');
  const result = app.findOptimalLineup(squad, [left, right], scores);
  assert.deepEqual(result.lineup.map((slot) => slot.player.id), [2, 1]);
  assert.equal(new Set(result.lineup.map((slot) => slot.player.id)).size, 2);
  assert.equal(scores.get(squad[3]).size, 0);
});
test('unhappy remaining card shows happiness, with unknown scores last', () => {
  const app = loadApp();
  const squad = [player(1, ['DL'], null), player(2, ['DL'], -20), player(3, ['DL'], -80)];
  const html = app.renderXiRemainingCard(squad, app.indexPositionScores(squad, 'happiness'), 'happiness');
  assert.match(html, /Dissatisfied \(-80\)/);
  assert.match(html, /Unknown/);
  assert.ok(html.indexOf('Player 3') < html.indexOf('Player 2'));
  assert.ok(html.indexOf('Player 2') < html.indexOf('Player 1'));
  assert.doesNotMatch(html, /PA meta/);
});
test('playing-time happiness column is available only in My Players', () => {
  const app = loadApp();
  for (const mode of ['players', 'shortlist', 'staff']) {
    app.state.mode = mode;
    assert.equal(app.baseCols().some((col) => col.key === 'playingTimeHappiness'), false);
  }
  app.state.mode = 'myplayer';
  assert.equal(app.baseCols().some((col) => col.key === 'playingTimeHappiness'), true);
});
test('unhappy view renders one pitch and one remaining card with happiness labels', () => {
  const app = loadApp();
  const squad = [player(1, ['DL'], -80), player(2, ['DL'], -20)];
  const scores = app.indexPositionScores(squad, 'happiness');
  const result = app.findOptimalLineup(squad, [left], scores);
  const html = app.renderXiModeCards('happiness', result, scores, squad);
  assert.equal((html.match(/class="xi-pitch"/g) || []).length, 1);
  assert.equal((html.match(/xi-remaining-card/g) || []).length, 1);
  assert.match(html, /Dissatisfied \(-80\)/);
  assert.match(html, /Dissatisfied \(-20\)/);
  assert.doesNotMatch(html, /xi-average/);
  assert.doesNotMatch(html, /PA meta/);
  app.state.xiView = 'happiness';
  assert.equal(app.xiViewFiltersHtml, undefined);
});
test('unhappy XI honors position proficiency and excludes unknown scores', () => {
  const app = loadApp();
  app.state.xiProfThreshold = 15;
  const below = player(1, ['DL'], -100);
  below.posProficiency.DL = 14;
  const known = player(2, ['DL'], 10);
  const unknown = player(3, ['DR'], null);
  const squad = [below, known, unknown];
  const result = app.findOptimalLineup(squad, [left, right], app.indexPositionScores(squad, 'happiness'));
  assert.equal(result.lineup[0].player.id, 2);
  assert.equal(result.lineup[1].player, null);
});

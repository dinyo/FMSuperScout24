'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness');

const ATTRS = [
  'Corners', 'Crossing', 'Dribbling', 'Finishing', 'FirstTouch', 'FreeKicks', 'Heading',
  'LongShots', 'LongThrows', 'Marking', 'Passing', 'PenaltyTaking', 'Tackling', 'Technique',
  'Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions',
  'Determination', 'Flair', 'Leadership', 'OffTheBall', 'Positioning', 'Teamwork', 'Vision',
  'WorkRate', 'Acceleration', 'Agility', 'Balance', 'JumpingReach', 'NaturalFitness',
  'Pace', 'Stamina', 'Strength',
];

function xiPlayer(id, positions, proficiency, attributeValue) {
  return {
    id,
    name: `Player ${id}`,
    posArr: positions,
    posProficiency: proficiency,
    attrs: Object.fromEntries(ATTRS.map(attr => [attr, attributeValue])),
  };
}

test('Best XI filters by slot proficiency and scores the exact FM position', () => {
  const app = loadApp();
  app.state.xiProfThreshold = 15;
  const slot = { role: 'fb', line: 'df', side: 'L', t: 75, l: 15 };
  const betterRawAt15 = xiPlayer(1, ['DL', 'AML'], { DL: 15, AML: 20 }, 20);
  const weakerAt20 = xiPlayer(2, ['DL'], { DL: 20 }, 1);
  const belowThreshold = xiPlayer(3, ['DL'], { DL: 14 }, 20);

  const expectedDl = app.metaScoresByPosition(betterRawAt15, betterRawAt15.attrs).find(score => score.pos === 'DL');
  const belowDl = app.bestMetaForSlot(belowThreshold, slot);
  const result = app.findOptimalLineup([betterRawAt15, weakerAt20, belowThreshold], [slot]);

  assert.equal(belowDl, null, 'DL proficiency 14 is below the default threshold of 15');
  assert.ok(expectedDl.effectiveMeta > app.bestMetaForSlot(weakerAt20, slot).effectiveMeta);
  assert.equal(result.lineup[0].player.id, betterRawAt15.id);
  assert.equal(result.lineup[0].score, expectedDl.effectiveMeta, 'the displayed score is DL meta, not the player’s AML meta');
});

test('Best XI maximizes filled slots before meta and assigns each player once', () => {
  const app = loadApp();
  app.state.xiProfThreshold = 15;
  const formation = [
    { role: 'fb', line: 'df', side: 'L', t: 75, l: 15 },
    { role: 'fb', line: 'df', side: 'R', t: 75, l: 85 },
  ];
  const rightOnly = xiPlayer(10, ['DR'], { DR: 15 }, 20);
  const leftOnly = xiPlayer(11, ['DL'], { DL: 15 }, 1);
  const result = app.findOptimalLineup([rightOnly, leftOnly], formation);

  assert.deepEqual(result.lineup.map(slot => slot.player && slot.player.id), [leftOnly.id, rightOnly.id]);
  assert.equal(new Set(result.lineup.map(slot => slot.player.id)).size, 2);
  assert.equal(result.lineup.filter(slot => slot.player).length, 2);
});

test('automatic formation chooses the highest player coverage first', () => {
  const app = loadApp();
  app.state.xiProfThreshold = 15;
  const squad = [
    xiPlayer(20, ['GK'], { GK: 15 }, 12),
    xiPlayer(21, ['DC'], { DC: 15 }, 12),
    xiPlayer(22, ['DC'], { DC: 15 }, 12),
    xiPlayer(23, ['DL'], { DL: 15 }, 12),
    xiPlayer(24, ['DR'], { DR: 15 }, 12),
  ];
  const formationKeys = Object.keys(app.XI_FORMATIONS).filter(key => key !== 'custom' && key !== 'custom_active');
  const maxCoverage = Math.max(...formationKeys.map(key =>
    app.findOptimalLineup(squad, app.XI_FORMATIONS[key]).lineup.filter(slot => slot.player).length,
  ));
  const best = app.autoDetectBestFormation(squad);

  assert.equal(best.result.lineup.filter(slot => slot.player).length, maxCoverage);
});

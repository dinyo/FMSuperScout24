// Model tests for FMSuperScout. Run them with `node --test`.
// These dependency-free tests exercise the real frontend functions through the harness.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness');

const M = loadApp();
// Use a fixed context instead of local storage or a dump.
M.state.cur = '£';
M.state.refYear = 2027;
M.state.refDoy = 1;
M.state.meta = { gameDate: '2027-01-01', gameYear: 2027, myClub: 'Testclub', myClubRep: 6000 };
M.state.players = [];

// Representative player with fields matching the plugin dump.
function player(over = {}) {
  return Object.assign({
    id: 1, name: 'Test Player', birthYear: 2006, birthDoy: 1, age: 21,
    club: 'Other Club', clubRep: 3000, worldRep: 2000, wage: 20000,
    ca: 120, pa: 150, pos: 'ST', posArr: ['ST'], nat: ['Netherlands'], foot: 'Right',
    value: 5_000_000, expires: '2028-06-30',
    attrs: {
      Finishing: 14, Passing: 11, Technique: 13, FirstTouch: 13, Dribbling: 12, Marking: 5, Tackling: 6,
      Composure: 13, Decisions: 12, Determination: 14, OffTheBall: 13, Anticipation: 12, WorkRate: 12,
      Pace: 15, Acceleration: 15, Strength: 12, Stamina: 13, Agility: 13, Balance: 12,
      Corners: 6, FreeKicks: 7,
      Consistency: 14, ImportantMatches: 12, InjuryProneness: 8, Versatility: 10, Dirtiness: 5,
    },
  }, over);
}

// ---------- parseMoney ----------
test('parseMoney: units and edge cases (£)', () => {
  assert.equal(M.parseMoney('10M'), 10_000_000);
  assert.equal(M.parseMoney('50K'), 50_000);
  assert.equal(M.parseMoney('1.8m'), 1_800_000);
  assert.equal(M.parseMoney('2B'), 2_000_000_000);
  assert.equal(M.parseMoney('1,5M'), 1_500_000); // Comma as the decimal separator.
  assert.equal(M.parseMoney(''), null);
  assert.equal(M.parseMoney('   '), null);
});

test('parseMoney: currencies convert back to internal GBP', () => {
  const near = (a, b) => Math.abs(a - b) < 1; // Division can introduce floating-point noise.
  M.state.cur = '€';
  assert.ok(near(M.parseMoney('1.16M'), 1_000_000), '€1,16M → £1M');
  M.state.cur = '$';
  assert.ok(near(M.parseMoney('1.35M'), 1_000_000), '$1,35M → £1M');
  M.state.cur = '£';
  assert.equal(M.parseMoney('1M'), 1_000_000);
});

// ---------- monthsUntil ----------
test('monthsUntil: relative to the in-game date', () => {
  assert.equal(M.monthsUntil(null), null);
  const half = M.monthsUntil('2027-07-01'); // About six months after 2027-01-01.
  assert.ok(half > 5.5 && half < 6.5, `verwacht ~6, kreeg ${half}`);
  assert.ok(M.monthsUntil('2026-07-01') < 0, 'verleden = negatief');
});

// ---------- projectAttrs (potential) ----------
test('projectAttrs: PA <= CA returns no projection', () => {
  assert.equal(M.projectAttrs(player({ ca: 150, pa: 150 })), null);
  assert.equal(M.projectAttrs(player({ ca: 150, pa: 120 })), null);
});

test('projectAttrs: grows without exceeding 20 or projecting hidden attributes', () => {
  const p = player({ ca: 100, pa: 160, age: 18 });
  const proj = M.projectAttrs(p);
  for (const k of Object.keys(p.attrs)) {
    if (['Consistency', 'ImportantMatches', 'Versatility', 'InjuryProneness', 'Dirtiness'].includes(k)) {
      assert.equal(proj[k], undefined, `Hidden attribute ${k} should not be projected`);
    } else {
      assert.ok(proj[k] >= p.attrs[k], `${k} should not decrease`);
      assert.ok(proj[k] <= 20, `${k} should not exceed 20`);
    }
  }
});

test('projectAttrs: physical growth slows with age while mental growth continues', () => {
  // getAge prefers birthYear over age; refYear is 2027.
  const young = M.projectAttrs(player({ ca: 145, pa: 162, birthYear: 2005 })); // 22
  const old = M.projectAttrs(player({ ca: 145, pa: 162, birthYear: 1996 })); // 31
  const baseAttrs = player().attrs;
  const base = { attrs: baseAttrs };
  // A young player's pace should grow at least as much as an older player's.
  const paceGrowYoung = young.Pace - base.attrs.Pace;
  const paceGrowOld = old.Pace - base.attrs.Pace;
  assert.ok(paceGrowYoung >= paceGrowOld, 'Younger players should grow physically at least as much');
  assert.ok(paceGrowOld <= 1, 'Older players should gain little pace');
  // Mental attributes can still improve at an older age.
  assert.ok(old.Determination >= base.attrs.Determination, 'Mental attributes can still grow with age');
});

// ---------- roleScore ----------
test('roleScore: better attributes produce a higher role score', () => {
  const roles = M.ROLES || [];
  assert.ok(roles.length, 'At least one role should be defined');
  const role = roles[0];
  const weak = player();
  const strong = player();
  for (const k of Object.keys(strong.attrs)) strong.attrs[k] = Math.min(20, weak.attrs[k] + 4);
  const sWeak = M.roleScore(weak, role);
  const sStrong = M.roleScore(strong, role);
  assert.ok(sStrong >= sWeak, `A stronger profile should score at least as high (${sStrong} vs ${sWeak})`);
});

test('advValue & advLabel: reads staff attributes for staff members', () => {
  const staffMember = { id: 1, name: 'Test Scout', staffAttrs: { Aanvallen: 16, Oordeel_vermogen: 18 } };
  assert.equal(M.advValue(staffMember, 'Oordeel_vermogen'), 18);
  assert.equal(M.advValue(staffMember, 'Aanvallen'), 16);
  assert.equal(M.advValue(staffMember, 'UnknownAttr'), null);

  assert.equal(M.advLabel('Oordeel_vermogen'), 'Judging Player Ability');
  assert.equal(M.advLabel('Aanvallen'), 'Attacking');
});


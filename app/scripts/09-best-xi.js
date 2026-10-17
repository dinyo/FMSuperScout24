// ================= BEST XI AND TACTICS =================
const xiSlot = (role, line, side, t, l) => ({ role, line, side, t, l });
const xiGoalkeeper = () => [xiSlot('gk', 'gk', 'C', 90, 50)];
const xiBackFour = () => [
  xiSlot('fb', 'df', 'L', 75, 15),
  xiSlot('cd', 'df', 'CL', 75, 35),
  xiSlot('cd', 'df', 'CR', 75, 65),
  xiSlot('fb', 'df', 'R', 75, 85),
];
const xiBackFive = () => [
  xiSlot('wb', 'df', 'L', 65, 12),
  xiSlot('cd', 'df', 'CL', 75, 30),
  xiSlot('cd', 'df', 'C', 75, 50),
  xiSlot('cd', 'df', 'CR', 75, 70),
  xiSlot('wb', 'df', 'R', 65, 88),
];
const XI_FORMATIONS = {
  '4-2-4 DM Wide': [
    xiSlot('af', 'fw', 'CL', 15, 35),
    xiSlot('af', 'fw', 'CR', 15, 65),
    xiSlot('wing', 'am', 'L', 30, 15),
    xiSlot('wing', 'am', 'R', 30, 85),
    xiSlot('dm', 'dm', 'CL', 55, 35),
    xiSlot('dm', 'dm', 'CR', 55, 65),
    ...xiBackFour(),
    ...xiGoalkeeper(),
  ],
  '4-2-3-1 DM AM Wide': [
    xiSlot('af', 'fw', 'C', 15, 50),
    xiSlot('wing', 'am', 'L', 30, 15),
    xiSlot('am', 'am', 'C', 30, 50),
    xiSlot('wing', 'am', 'R', 30, 85),
    xiSlot('dm', 'dm', 'CL', 55, 35),
    xiSlot('dm', 'dm', 'CR', 55, 65),
    ...xiBackFour(),
    ...xiGoalkeeper(),
  ],
  '4-3-3 DM Wide': [
    { role: 'af', line: 'fw', side: 'C', t: 15, l: 50 },
    { role: 'wing', line: 'am', side: 'L', t: 25, l: 15 },
    { role: 'wing', line: 'am', side: 'R', t: 25, l: 85 },
    { role: 'cm', line: 'cm', side: 'CL', t: 45, l: 30 },
    { role: 'cm', line: 'cm', side: 'CR', t: 45, l: 70 },
    { role: 'dm', line: 'dm', side: 'C', t: 60, l: 50 },
    { role: 'fb', line: 'df', side: 'L', t: 75, l: 15 },
    { role: 'cd', line: 'df', side: 'CL', t: 75, l: 35 },
    { role: 'cd', line: 'df', side: 'CR', t: 75, l: 65 },
    { role: 'fb', line: 'df', side: 'R', t: 75, l: 85 },
    { role: 'gk', line: 'gk', side: 'C', t: 90, l: 50 },
  ],
  '4-4-2': [
    { role: 'af', line: 'fw', side: 'CL', t: 15, l: 35 },
    { role: 'af', line: 'fw', side: 'CR', t: 15, l: 65 },
    { role: 'wing', line: 'cm', side: 'L', t: 45, l: 15 },
    { role: 'cm', line: 'cm', side: 'CL', t: 45, l: 35 },
    { role: 'cm', line: 'cm', side: 'CR', t: 45, l: 65 },
    { role: 'wing', line: 'cm', side: 'R', t: 45, l: 85 },
    { role: 'fb', line: 'df', side: 'L', t: 75, l: 15 },
    { role: 'cd', line: 'df', side: 'CL', t: 75, l: 35 },
    { role: 'cd', line: 'df', side: 'CR', t: 75, l: 65 },
    { role: 'fb', line: 'df', side: 'R', t: 75, l: 85 },
    { role: 'gk', line: 'gk', side: 'C', t: 90, l: 50 },
  ],
  '5-3-2 DM WB': [
    { role: 'af', line: 'fw', side: 'CL', t: 15, l: 35 },
    { role: 'af', line: 'fw', side: 'CR', t: 15, l: 65 },
    { role: 'cm', line: 'cm', side: 'CL', t: 45, l: 35 },
    { role: 'cm', line: 'cm', side: 'CR', t: 45, l: 65 },
    { role: 'dm', line: 'dm', side: 'C', t: 57, l: 50 },
    ...xiBackFive(),
    ...xiGoalkeeper(),
  ],
  '5-2-3 DM Wide': [
    xiSlot('af', 'fw', 'C', 15, 50),
    xiSlot('wing', 'am', 'L', 25, 15),
    xiSlot('wing', 'am', 'R', 25, 85),
    xiSlot('dm', 'dm', 'CL', 55, 35),
    xiSlot('dm', 'dm', 'CR', 55, 65),
    ...xiBackFive(),
    ...xiGoalkeeper(),
  ],
  '4-4-2 Diamond Narrow': [
    xiSlot('af', 'fw', 'CL', 15, 35),
    xiSlot('af', 'fw', 'CR', 15, 65),
    xiSlot('am', 'am', 'C', 30, 50),
    xiSlot('cm', 'cm', 'CL', 45, 35),
    xiSlot('cm', 'cm', 'CR', 45, 65),
    xiSlot('dm', 'dm', 'C', 58, 50),
    ...xiBackFour(),
    ...xiGoalkeeper(),
  ],
  '5-2-2-1 DM AM': [
    xiSlot('af', 'fw', 'C', 15, 50),
    xiSlot('am', 'am', 'CL', 30, 38),
    xiSlot('am', 'am', 'CR', 30, 62),
    xiSlot('dm', 'dm', 'CL', 55, 35),
    xiSlot('dm', 'dm', 'CR', 55, 65),
    ...xiBackFive(),
    ...xiGoalkeeper(),
  ],
  '5-2-1-2 DM AM': [
    xiSlot('af', 'fw', 'CL', 15, 35),
    xiSlot('af', 'fw', 'CR', 15, 65),
    xiSlot('am', 'am', 'C', 30, 50),
    xiSlot('dm', 'dm', 'CL', 55, 35),
    xiSlot('dm', 'dm', 'CR', 55, 65),
    ...xiBackFive(),
    ...xiGoalkeeper(),
  ],
  '5-3-2': [
    xiSlot('af', 'fw', 'CL', 15, 35),
    xiSlot('af', 'fw', 'CR', 15, 65),
    xiSlot('cm', 'cm', 'CL', 45, 30),
    xiSlot('cm', 'cm', 'C', 45, 50),
    xiSlot('cm', 'cm', 'CR', 45, 70),
    ...xiBackFive(),
    ...xiGoalkeeper(),
  ],
  '4-2-4': [
    xiSlot('af', 'fw', 'CL', 15, 35),
    xiSlot('af', 'fw', 'CR', 15, 65),
    xiSlot('wing', 'am', 'L', 30, 15),
    xiSlot('wing', 'am', 'R', 30, 85),
    xiSlot('cm', 'cm', 'CL', 50, 35),
    xiSlot('cm', 'cm', 'CR', 50, 65),
    ...xiBackFour(),
    ...xiGoalkeeper(),
  ],
  '5-4-1': [
    xiSlot('af', 'fw', 'C', 15, 50),
    xiSlot('wing', 'cm', 'L', 45, 15),
    xiSlot('cm', 'cm', 'CL', 45, 35),
    xiSlot('cm', 'cm', 'CR', 45, 65),
    xiSlot('wing', 'cm', 'R', 45, 85),
    ...xiBackFive(),
    ...xiGoalkeeper(),
  ],
  '4-1-4-1': [
    xiSlot('af', 'fw', 'C', 15, 50),
    xiSlot('wing', 'cm', 'L', 40, 15),
    xiSlot('cm', 'cm', 'CL', 40, 35),
    xiSlot('cm', 'cm', 'CR', 40, 65),
    xiSlot('wing', 'cm', 'R', 40, 85),
    xiSlot('dm', 'dm', 'C', 55, 50),
    ...xiBackFour(),
    ...xiGoalkeeper(),
  ],
  '3-4-3': [
    xiSlot('af', 'fw', 'C', 15, 50),
    xiSlot('wing', 'am', 'L', 25, 20),
    xiSlot('wing', 'am', 'R', 25, 80),
    xiSlot('cm', 'cm', 'CL', 45, 35),
    xiSlot('cm', 'cm', 'CR', 45, 65),
    xiSlot('wb', 'dm', 'L', 55, 15),
    xiSlot('wb', 'dm', 'R', 55, 85),
    xiSlot('cd', 'df', 'CL', 75, 30),
    xiSlot('cd', 'df', 'C', 75, 50),
    xiSlot('cd', 'df', 'CR', 75, 70),
    ...xiGoalkeeper(),
  ],
};
const XI_FM_PRESET_KEYS = [
  '4-2-4 DM Wide',
  '4-2-3-1 DM AM Wide',
  '4-3-3 DM Wide',
  '4-4-2',
  '5-2-3 DM Wide',
  '5-3-2 DM WB',
  '4-4-2 Diamond Narrow',
  '5-2-2-1 DM AM',
  '5-2-1-2 DM AM',
];
const XI_SELECTABLE_PRESET_KEYS = [
  ...XI_FM_PRESET_KEYS,
  '5-3-2',
  '4-2-4',
  '5-4-1',
  '4-1-4-1',
  '3-4-3',
];
const XI_FORMATION_ALIASES = {
  '4-3-3': '4-3-3 DM Wide',
  '4-2-3-1': '4-2-3-1 DM AM Wide',
};
if (XI_FORMATION_ALIASES[state.bestXiFormation]) {
  state.bestXiFormation = XI_FORMATION_ALIASES[state.bestXiFormation];
  try {
    localStorage.setItem('fmss_xi_formation', state.bestXiFormation);
  } catch {}
}

// Maps a Best XI slot to a meta group name, so we use position-specific weights when scoring.
// wing/if disambiguation: cm-line = wide mid (WM), am-line = attacking wing (AM).
function slotMetaGroup(slot) {
  switch (slot.role) {
    case 'gk':
      return 'GK';
    case 'cd':
    case 'bpd':
      return 'DC';
    case 'fb':
    case 'wb':
      return 'FB';
    case 'dm':
    case 'dlp':
    case 'bwm':
      return 'DM';
    case 'cm':
    case 'b2b':
    case 'ap':
      return 'MC';
    case 'wing':
    case 'if':
      return slot.line === 'cm' ? 'WM' : 'AM';
    case 'am':
      return 'AM';
    case 'af':
    case 'poacher':
    case 'tm':
    case 'cf':
      return 'ST';
    default:
      return null;
  }
}

// Returns the specific FM position codes that a slot requires.
// Only positions consistent with the slot's meta group are included, so proficiency
// lookups are always against the right position (AML ≠ AMC even though both are 'AM' group).
function slotFmPositions(slot) {
  const { role, side, line } = slot;
  switch (role) {
    case 'gk':
      return ['GK'];
    case 'cd':
    case 'bpd':
      return ['DC'];
    case 'fb':
      // Full-back role → classic DR/DL positions
      if (side === 'L' || side === 'CL') return ['DL'];
      if (side === 'R' || side === 'CR') return ['DR'];
      return ['DL', 'DR'];
    case 'wb':
      // Wing-back role → WBR/WBL positions; DR=20/WBR=7 at a WBR slot uses WBR proficiency
      if (side === 'L' || side === 'CL') return ['WBL'];
      if (side === 'R' || side === 'CR') return ['WBR'];
      return ['WBL', 'WBR'];
    case 'dm':
    case 'dlp':
    case 'bwm':
      return ['DM'];
    case 'cm':
    case 'b2b':
    case 'ap':
      return ['MC'];
    case 'wing':
    case 'if':
      // am-line = AM weight table → AML/AMR; cm-line = WM weight table → ML/MR
      if (line === 'am') {
        if (side === 'L' || side === 'CL') return ['AML'];
        if (side === 'R' || side === 'CR') return ['AMR'];
        return ['AML', 'AMR'];
      } else {
        if (side === 'L' || side === 'CL') return ['ML'];
        if (side === 'R' || side === 'CR') return ['MR'];
        return ['ML', 'MR'];
      }
    case 'am':
      return ['AMC'];
    case 'af':
    case 'poacher':
    case 'tm':
    case 'cf':
      return ['ST'];
    default:
      return [];
  }
}

function canPlaySlot(p, slot) {
  const pos = p.posArr || [];
  if (!pos.length) return false;
  const role = slot.role;
  const side = slot.side;

  if (role === 'gk') return pos.includes('GK');
  if (role === 'cd' || role === 'bpd') return pos.includes('DC');
  if (role === 'fb' || role === 'wb') {
    if (side === 'L' || side === 'CL') return pos.includes('DL') || pos.includes('WBL');
    if (side === 'R' || side === 'CR') return pos.includes('DR') || pos.includes('WBR');
    return pos.includes('DL') || pos.includes('DR') || pos.includes('WBL') || pos.includes('WBR');
  }
  if (role === 'dm' || role === 'dlp' || role === 'bwm') return pos.includes('DM');
  if (role === 'cm' || role === 'b2b' || role === 'ap') return pos.includes('MC');
  if (role === 'wing' || role === 'if') {
    if (side === 'L' || side === 'CL') return pos.includes('AML') || pos.includes('ML');
    if (side === 'R' || side === 'CR') return pos.includes('AMR') || pos.includes('MR');
    return pos.includes('AML') || pos.includes('AMR') || pos.includes('ML') || pos.includes('MR');
  }
  if (role === 'am') return pos.includes('AMC');
  if (role === 'af' || role === 'poacher' || role === 'tm' || role === 'cf')
    return pos.includes('ST');
  return false;
}

function bestMetaForSlot(
  p,
  slot,
  scores,
  slotPositions,
  profThreshold = state.xiProfThreshold,
) {
  if (!p.attrs || !canPlaySlot(p, slot)) return null;
  const hasProfData = hasPositionProficiency(p);
  const allowedPositions = slotPositions || slotFmPositions(slot);
  let best = null;
  for (const pos of allowedPositions) {
    const entry = (scores || new Map(metaScoresByPosition(p, p.attrs).map((entry) => [entry.pos, entry]))).get(pos);
    if (!entry) continue;
    if (
      hasProfData
        ? entry.prof == null || entry.prof < profThreshold
        : !(p.posArr || []).includes(pos)
    )
      continue;
    if (!best || entry.effectiveMeta > best.effectiveMeta) best = entry;
  }
  return best && Number.isFinite(best.effectiveMeta) ? best : null;
}

function indexPositionScores(squad, scoreMode = 'meta', currentPositionScores = null) {
  const byPlayer = new Map();
  for (const p of squad) {
    const byPosition = new Map();
    if (p.attrs) {
      const currentScores = currentPositionScores?.get(p)
        ? [...currentPositionScores.get(p).values()]
        : metaScoresByPosition(p, p.attrs);
      const projectedAttrs = scoreMode === 'metapa' ? projectAttrs(p) : null;
      const projectedScores = projectedAttrs ? metaScoresByPosition(p, projectedAttrs) : [];
      const projectedByPosition = new Map(projectedScores.map((entry) => [entry.pos, entry]));
      for (const entry of currentScores) {
        if (scoreMode === 'happiness') {
          const happiness = xiPlayingTimeScore(p);
          if (happiness != null) byPosition.set(entry.pos, { ...entry, effectiveMeta: -happiness });
          continue;
        }
        const projected = projectedByPosition.get(entry.pos);
        byPosition.set(
          entry.pos,
          scoreMode === 'metapa' && projected && projected.effectiveMeta > entry.effectiveMeta
            ? { ...entry, effectiveMeta: projected.effectiveMeta }
            : entry,
        );
      }
    }
    byPlayer.set(p, byPosition);
  }
  return byPlayer;
}

function solveMinCostAssignment(costs) {
  const rowCount = costs.length;
  if (!rowCount) return [];
  const columnCount = costs[0].length;
  if (columnCount < rowCount)
    throw new Error('Assignment matrix needs at least as many columns as rows.');

  // Hungarian algorithm for a rectangular matrix where rows <= columns.
  const rowPotential = new Array(rowCount + 1).fill(0);
  const columnPotential = new Array(columnCount + 1).fill(0);
  const matchedRow = new Array(columnCount + 1).fill(0);
  const previousColumn = new Array(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row++) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minReducedCost = new Array(columnCount + 1).fill(Infinity);
    const usedColumn = new Array(columnCount + 1).fill(false);

    do {
      usedColumn[currentColumn] = true;
      const currentRow = matchedRow[currentColumn];
      let delta = Infinity;
      let nextColumn = 0;

      for (let column = 1; column <= columnCount; column++) {
        if (usedColumn[column]) continue;
        const reducedCost =
          costs[currentRow - 1][column - 1] - rowPotential[currentRow] - columnPotential[column];
        if (reducedCost < minReducedCost[column]) {
          minReducedCost[column] = reducedCost;
          previousColumn[column] = currentColumn;
        }
        if (minReducedCost[column] < delta) {
          delta = minReducedCost[column];
          nextColumn = column;
        }
      }

      for (let column = 0; column <= columnCount; column++) {
        if (usedColumn[column]) {
          rowPotential[matchedRow[column]] += delta;
          columnPotential[column] -= delta;
        } else {
          minReducedCost[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    do {
      const nextColumn = previousColumn[currentColumn];
      matchedRow[currentColumn] = matchedRow[nextColumn];
      currentColumn = nextColumn;
    } while (currentColumn !== 0);
  }

  const assignment = new Array(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column++) {
    if (matchedRow[column] > 0) assignment[matchedRow[column] - 1] = column - 1;
  }
  return assignment;
}

function findOptimalLineup(squad, formation, positionScores = null) {
  // Index exact FM positions once so slot checks do not repeatedly scan each player's scores.
  // autoDetectBestFormation shares this index across every formation it evaluates.
  positionScores ||= indexPositionScores(squad);
  const groupForSlot = formation.map(slotMetaGroup);
  const positionsForSlot = formation.map(slotFmPositions);

  const candidatesForSlot = formation.map((slot, slotIndex) => {
    return squad
      .map((p) => {
        const scores = positionScores.get(p);
        const bestPositionScore = bestMetaForSlot(p, slot, scores, positionsForSlot[slotIndex]);
        return bestPositionScore
          ? {
              player: p,
              score: bestPositionScore.effectiveMeta,
              group: bestPositionScore.group,
              pos: bestPositionScore.pos,
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 11);
  });

  // Eleven candidates per slot are sufficient: at most ten other slots can use
  // higher-ranked players, so a lower-ranked candidate can never be required.
  const playersById = new Map();
  candidatesForSlot.forEach((list) =>
    list.forEach((candidate) => playersById.set(candidate.player.id, candidate.player)),
  );
  const candidatePlayers = [...playersById.values()];
  const allScores = candidatesForSlot.flatMap((list) => list.map((candidate) => candidate.score));
  const minScore = allScores.length ? Math.min(...allScores) : 0;
  const maxScore = allScores.length ? Math.max(...allScores) : 0;
  const maxAbsScore = Math.max(Math.abs(minScore), Math.abs(maxScore));
  const slotCount = formation.length;
  const cardinalityBonus = (2 * maxAbsScore + 1) * (slotCount + 1);
  const forbiddenCost = cardinalityBonus + Math.abs(minScore) + 1;
  const candidateMaps = candidatesForSlot.map(
    (list) => new Map(list.map((candidate) => [candidate.player.id, candidate])),
  );

  // Candidate assignments first maximize the number of filled positions, then
  // maximize effective meta. Dummy columns represent vacant positions.
  const costs = candidateMaps.map((candidateMap) => [
    ...candidatePlayers.map((player) => {
      const candidate = candidateMap.get(player.id);
      return candidate ? -(cardinalityBonus + candidate.score) : forbiddenCost;
    }),
    ...new Array(slotCount).fill(0),
  ]);
  const assignedColumns = solveMinCostAssignment(costs);
  const lineup = formation.map((slot, slotIdx) => {
    const col = assignedColumns[slotIdx];
    const candidate =
      col >= 0 && col < candidatePlayers.length
        ? candidateMaps[slotIdx].get(candidatePlayers[col].id)
        : null;
    return candidate
      ? {
          player: candidate.player,
          score: candidate.score,
          group: candidate.group || groupForSlot[slotIdx],
          pos: candidate.pos,
          role: slot.role,
          t: slot.t,
          l: slot.l,
        }
      : {
          player: null,
          score: 0,
          group: groupForSlot[slotIdx],
          pos: slotFmPositions(slot)[0] || '',
          role: slot.role,
          t: slot.t,
          l: slot.l,
        };
  });

  return { lineup, score: lineup.reduce((sum, slot) => sum + slot.score, 0) };
}
function autoDetectBestFormation(squad, scoreMode = 'meta') {
  let bestFormationKey = null,
    bestResult = null,
    highestFilledCount = -1,
    highestAvgScore = -Infinity;
  const positionScores = indexPositionScores(squad, scoreMode);
  XI_SELECTABLE_PRESET_KEYS.forEach((fKey) => {
    const formation = XI_FORMATIONS[fKey];
    const res = findOptimalLineup(squad, formation, positionScores);
    if (res && res.lineup) {
      const filledCount = res.lineup.filter((slot) => slot.player).length;
      const avg = xiAverageScore(res) ?? -Infinity;
      if (
        filledCount > highestFilledCount ||
        (filledCount === highestFilledCount && avg > highestAvgScore)
      ) {
        highestFilledCount = filledCount;
        highestAvgScore = avg;
        bestFormationKey = fKey;
        bestResult = res;
      }
    }
  });
  return { key: bestFormationKey, result: bestResult };
}

function triggerBestFormationAuto() {
  const myClub = (state.meta.myClub || '').toLowerCase();
  if (!myClub) {
    showToast(text('bestxi_autoNoClub'), 'warning');
    return;
  }
  const squad = state.players.filter(
    (p) =>
      (p.club || '').toLowerCase() === myClub &&
      xiTeamFilterMatches(p) &&
      !state.xiIgnored.has(p.id),
  );
  const best = autoDetectBestFormation(squad, 'meta');
  if (best && best.key) {
    state.bestXiFormation = best.key;
    try {
      localStorage.setItem('fmss_xi_formation', best.key);
    } catch {}
    renderBestXI();
    showToast(
      tf('bestxi_autoToast', {
        f: best.key,
        s: xiAverageDisplay(best.result),
      }),
      'check',
    );
  } else {
    showToast(text('bestxi_autoFail'), 'warning');
  }
}
window.triggerBestFormationAuto = triggerBestFormationAuto;

function xiIgnorePlayer(id) {
  state.xiIgnored.add(id);
  try {
    localStorage.setItem('fmss_xi_ignored', JSON.stringify([...state.xiIgnored]));
  } catch {}
  renderBestXI();
}
function xiResetIgnored() {
  state.xiIgnored.clear();
  try {
    localStorage.setItem('fmss_xi_ignored', '[]');
  } catch {}
  renderBestXI();
}

function xiProfFilterHtml() {
  return `<label class="xi-prof-filter">${escHtml(text('bestxi_minProf'))}
    <input id="xi-prof-threshold" type="number" min="1" max="20" step="1" value="${state.xiProfThreshold}" onchange="handleXiProfThresholdChange()">
  </label>`;
}

function xiTeamFilterMatches(player) {
  return xiSelectedTeamGroups().has(teamGroup(player.teamType));
}

function xiSelectedTeamGroups() {
  const saved = Array.isArray(state.xiTeamFilter) ? state.xiTeamFilter : ['first'];
  return new Set(saved.filter((group) => ['first', 'res', 'youth'].includes(group)));
}

function xiTeamFiltersHtml() {
  const selected = xiSelectedTeamGroups();
  const options = [
    ['first', 'mt_first'],
    ['res', 'mt_res'],
    ['youth', 'mt_youth'],
  ];
  return `<div class="xi-team-filters" role="group" aria-label="${escHtml(text('vsTeamFilter'))}">
    <span>${escHtml(text('vsTeamFilter'))}</span>
    ${options.map(([key, label]) => `<label class="xi-team-filter"><input type="checkbox" data-xi-team="${key}" ${selected.has(key) ? 'checked' : ''} onchange="handleXiTeamFilter('${key}', this.checked)">${escHtml(text(label))}</label>`).join('')}
  </div>`;
}

function handleXiTeamFilter(group, checked) {
  if (!['first', 'res', 'youth'].includes(group)) return;
  const selected = xiSelectedTeamGroups();
  if (checked) selected.add(group);
  else selected.delete(group);
  state.xiTeamFilter = [...selected];
  try {
    localStorage.setItem('fmss_xi_team_filter', JSON.stringify(state.xiTeamFilter));
  } catch {}
  renderBestXI();
}

function xiAverageScore(result) {
  const players = (result?.lineup || []).filter(
    (slot) => slot.player && Number.isFinite(slot.score),
  );
  return players.length
    ? players.reduce((sum, slot) => sum + slot.score, 0) / players.length
    : null;
}
function xiAverageDisplay(result) {
  return fmtMeta(xiAverageScore(result) ?? 0);
}

function handleXiProfThresholdChange() {
  const value = parseInt($('xi-prof-threshold')?.value, 10);
  state.xiProfThreshold = Number.isFinite(value) ? Math.max(1, Math.min(20, value)) : 15;
  try {
    localStorage.setItem('fmss_xi_prof_threshold', String(state.xiProfThreshold));
  } catch {}
  renderBestXI();
}

function renderXiPitch(lineup, title, { interactive = true, happiness = false } = {}) {
  const slots = lineup || [];
  let html = `<div class="xi-pitch">
    <div class="xi-pitch-title">${escHtml(title)}</div>
    <div class="xi-field-halfway"></div><div class="xi-field-circle"></div>
    <div class="xi-field-box xi-field-box--top"></div><div class="xi-field-box xi-field-box--bottom"></div>`;

  slots.forEach((slot) => {
    const player = slot.player;
    const score = player ? happiness ? escHtml(xiPlayingTimeText(player)) : fmtMeta(slot.score, slot.group) : '&#8211;';
    const name = player ? escHtml(player.name) : escHtml(text('bestxi_vacantPost'));
    const cls = player ? happiness ? xiPlayingTimeClass(player) : metaClass(slot.score, slot.group) : '';
    const side =
      slot.l < 30 ? ` ${text('bestxi_left')}` : slot.l > 70 ? ` ${text('bestxi_right')}` : '';
    const nameAction = player && interactive
      ? `onclick="showDetail(state.players.find(p=>p.id===${player.id}))"`
      : '';
    const ignore = player && interactive
      ? `<button type="button" class="xi-ignore" onclick="event.stopPropagation();xiIgnorePlayer(${player.id})" aria-label="${escHtml(text('bestxi_ignore'))}" title="${escHtml(text('bestxi_ignore'))}">&#215;</button>`
      : '';
    html += `<div class="xi-player-slot ${!player ? 'xi-player-slot--vacant' : ''}" style="top:${slot.t}%;left:${slot.l}%">
      <div class="xi-slot-score v ${cls}" ${nameAction}>${score}</div>
      <div class="xi-slot-name" title="${name}" ${nameAction}>${name}</div>
      <div class="xi-slot-role">${escHtml(roleName(slot.role) + side)}</div>
      ${ignore}
    </div>`;
  });

  return html + '</div>';
}

function xiPlayerPositionsAtThreshold(player) {
  const proficiency = player.posProficiency || {};
  const hasProfData = hasPositionProficiency(player);
  return POS_ORDER.filter((pos) =>
    hasProfData
      ? Number(proficiency[pos] || 0) >= state.xiProfThreshold
      : (player.posArr || []).includes(pos),
  ).map((pos) => ({
    pos,
    proficiency: hasProfData ? Number(proficiency[pos]) : null,
    score: null,
    group: POS_TO_META_GROUP[pos],
  }));
}

function renderXiModeCards(mode, result, positionScores, squad) {
  const isPaMeta = mode === 'metapa';
  const happiness = mode === 'happiness';
  const label = happiness ? 'Unhappy playing time' : text(isPaMeta ? 'c_metapa' : 'c_meta');
  const averageLabel = text(isPaMeta ? 'bestxi_avgPaScore' : 'bestxi_avgScore');
  const average = xiAverageScore(result);
  const averageDisplay = average == null
    ? '<span class="dim">&#8211;</span>'
    : `<span>${fmtMeta(average)}</span>`;
  const titularIds = new Set((result?.lineup || []).map((slot) => slot.player?.id).filter(Boolean));
  const remainingPlayers = squad.filter((player) => !titularIds.has(player.id));

  return `<section class="xi-panel-card xi-visual-card">
    <div class="xi-card-title">${escHtml(label)}</div>
    ${renderXiPitch(result?.lineup, happiness ? 'Most unhappy by position' : text('tabBestxi'), { happiness })}
    ${happiness ? '' : `<div class="xi-average"><span>${escHtml(averageLabel)}</span>${averageDisplay}</div>`}
  </section>${renderXiRemainingCard(remainingPlayers, positionScores, mode)}`;
}

function renderXiRemainingCard(players, positionScores, scoreMode) {
  const happiness = scoreMode === 'happiness';
  const scoreLabel = happiness ? 'Playing time happiness' : text(scoreMode === 'metapa' ? 'c_metapa' : 'c_meta');
  const groups = new Map(POS_ORDER.map((pos) => [pos, []]));
  for (const player of players) {
    for (const position of xiPlayerPositionsAtThreshold(player)) {
      position.score = positionScores.get(player)?.get(position.pos)?.effectiveMeta ?? null;
      if (groups.has(position.pos)) groups.get(position.pos).push({ player, ...position });
    }
  }
  for (const rows of groups.values()) {
    rows.sort(
      (a, b) =>
        (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
        String(a.player.name || '').localeCompare(String(b.player.name || ''), FORMAT_LOCALE),
    );
  }
  const visibleGroups = [...groups].filter(([, rows]) => rows.length);
  const visiblePlayerIds = new Set(
    visibleGroups.flatMap(([, rows]) => rows.map((row) => row.player.id)),
  );
  const list = visibleGroups
    .map(
      ([pos, rows]) => `<section class="xi-position-list">
    <h3>${pos}<span>${rows.length}</span></h3>
    ${rows
      .map(
        ({ player, proficiency, score, group }) => `<div class="xi-remaining-row">
      <span class="xi-remaining-name" title="${escHtml(player.name)}" onclick="showDetail(state.players.find(p=>p.id===${player.id}))">${escHtml(player.name)}</span>
      <span class="xi-remaining-prof">${proficiency == null ? '–' : proficiency}</span>
      <span class="v ${happiness ? xiPlayingTimeClass(player) : score == null ? 'dim' : metaClass(score, group)}">${happiness ? escHtml(xiPlayingTimeText(player)) : score == null ? '&#8211;' : fmtMeta(score, group)}</span>
      <button type="button" class="xi-remaining-ignore" aria-label="${escHtml(text('bestxi_ignore'))}" title="${escHtml(text('bestxi_ignore'))}" onclick="xiIgnorePlayer(${player.id})">&#215;</button>
    </div>`,
      )
      .join('')}
  </section>`,
    )
    .join('');
  return `<section class="xi-panel-card xi-remaining-card">
    <div class="xi-remaining-title"><strong>${escHtml(text('bestxi_remainingTitle'))} &middot; ${escHtml(scoreLabel)}</strong><span>${visiblePlayerIds.size}</span></div>
    <div class="xi-remaining-columns"><span>${escHtml(text('c_name'))}</span><span>${escHtml(text('bestxi_minProf'))}</span><span>${escHtml(scoreLabel)}</span><span></span></div>
    ${list ? `<div class="xi-remaining-list">${list}</div>` : `<div class="xi-remaining-empty">${escHtml(text('bestxi_remainingEmpty'))}</div>`}
  </section>`;
}

function renderBestXI() {
  const box = $('bestxi');
  if (!box) return;

  if (state.bestXiFormation === 'custom') {
    renderInteractiveMap();
    return;
  }

  const myClub = (state.meta.myClub || '').toLowerCase();
  const hasIgnored = state.xiIgnored.size > 0;

  let html = `<div class="an-head" style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; flex-wrap: wrap; gap: 10px;">
    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <h2 style="margin:0;">${escHtml(text('bestxi_title'))}</h2>
        <button onclick="triggerBestFormationAuto()" style="padding: 5px 12px; background: #d97706; color: #fff; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 12px;">⚡ ${escHtml(text('bestxi_autoFind'))}</button>
        <button onclick="state.bestXiFormation = 'custom'; renderBestXI();" style="padding: 5px 12px; background: #7c3aed; color: #fff; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 12px;">✏️ ${escHtml(text('bestxi_editTactic'))}</button>
        ${hasIgnored ? `<button onclick="xiResetIgnored()" style="padding: 5px 12px; background: #dc2626; color: #fff; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 12px;">↺ ${escHtml(text('bestxi_resetIgnored'))}</button>` : ''}
    </div>
    <div class="xi-controls">
      ${xiProfFilterHtml()}
      <select id="xi-formation" onchange="handleFormationChange()" style="padding: 5px 10px; background: #1e293b; color: #fff; border: 1px solid #334155; border-radius: 5px; font-weight: bold; cursor: pointer;">
        ${XI_SELECTABLE_PRESET_KEYS
          .map(
            (f) =>
              `<option value="${f}" ${state.bestXiFormation === f ? 'selected' : ''}>${f}</option>`,
          )
          .join('')}
        <option value="custom" ${state.bestXiFormation === 'custom' || state.bestXiFormation === 'custom_active' ? 'selected' : ''}>${escHtml(text('bestxi_customOpt'))}</option>
      </select>
    </div>
  </div>`;

  if (!myClub) {
    box.innerHTML =
      html +
      xiTeamFiltersHtml() +
      `<div class="an-empty" style="text-align:center; padding: 20px;">${escHtml(text('bestxi_noClub'))}</div>`;
    return;
  }

  // Unavailable players stay visible in their own panel and are excluded from the XI.
  const fullSquad = state.players.filter(
    (p) => (p.club || '').toLowerCase() === myClub && xiTeamFilterMatches(p),
  );
  const squad = fullSquad.filter((p) => !state.xiIgnored.has(p.id));
  const ignoredPlayers = fullSquad.filter((p) => state.xiIgnored.has(p.id));

  const formation =
    state.bestXiFormation === 'custom_active'
      ? XI_FORMATIONS['custom_active']
      : XI_FORMATIONS[state.bestXiFormation];
  if (!formation) return;

  const metaScores = indexPositionScores(squad, 'meta');
  const paMetaScores = indexPositionScores(squad, 'metapa', metaScores);
  const metaResult = findOptimalLineup(squad, formation, metaScores);
  const paMetaResult = findOptimalLineup(squad, formation, paMetaScores);
  const layoutHtml = `<div class="xi-comparison">
    ${renderXiModeCards('meta', metaResult, metaScores, squad)}
    ${renderXiModeCards('metapa', paMetaResult, paMetaScores, squad)}
  </div>`;

  // Unavailable panel — shown when any player is ignored
  let ignoredHtml = '';
  if (ignoredPlayers.length > 0) {
    ignoredHtml = `<div style="margin: 0 20px 20px; background: #1e293b; border: 1px solid #7f1d1d; border-radius: 10px; padding: 12px 16px;">
      <div style="font-size:11px; font-weight:bold; color:#fca5a5; text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px;">🚫 ${escHtml(text('bestxi_ignored'))}</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${ignoredPlayers
          .map((p) => {
            return `<div style="display:flex; align-items:center; gap:5px; background:#0f172a; border:1px solid #7f1d1d; border-radius:6px; padding:4px 8px;">
            <span style="font-size:11px; color:#fecaca; cursor:pointer;" onclick="showDetail(state.players.find(q=>q.id===${p.id}))">${escHtml(p.name)}</span>
            <button onclick="state.xiIgnored.delete(${p.id}); try{localStorage.setItem('fmss_xi_ignored',JSON.stringify([...state.xiIgnored]))}catch{}; renderBestXI();" style="padding:1px 5px; background:rgba(74,222,128,0.2); color:#4ade80; border:1px solid #4ade80; border-radius:3px; font-size:10px; cursor:pointer;">+</button>
          </div>`;
          })
          .join('')}
      </div>
    </div>`;
  }

  box.innerHTML = html + xiTeamFiltersHtml() + layoutHtml + ignoredHtml;
}

let customSelectedSlots = jread('fmss_xi_custom', []);
// Restore the custom formation saved by the previous session.
if (state.bestXiFormation === 'custom_active') {
  if (customSelectedSlots.length === 11) {
    XI_FORMATIONS['custom_active'] = customSelectedSlots;
  } else {
    state.bestXiFormation = '4-3-3 DM Wide'; // Fallback for incomplete saved data.
  }
}
const INTERACTIVE_MAP = [
  { id: 'fw_C', role: 'af', line: 'fw', side: 'C', label: 'ST' },
  { id: 'fw_CL', role: 'af', line: 'fw', side: 'CL', label: 'ST-L' },
  { id: 'fw_CR', role: 'af', line: 'fw', side: 'CR', label: 'ST-R' },
  { id: 'am_L', role: 'wing', line: 'am', side: 'L', label: 'AML' },
  { id: 'am_CL', role: 'am', line: 'am', side: 'CL', label: 'AMC-L' },
  { id: 'am_C', role: 'am', line: 'am', side: 'C', label: 'AMC' },
  { id: 'am_CR', role: 'am', line: 'am', side: 'CR', label: 'AMC-R' },
  { id: 'am_R', role: 'wing', line: 'am', side: 'R', label: 'AMR' },
  { id: 'cm_L', role: 'wing', line: 'cm', side: 'L', label: 'ML' },
  { id: 'cm_CL', role: 'cm', line: 'cm', side: 'CL', label: 'MC-L' },
  { id: 'cm_C', role: 'cm', line: 'cm', side: 'C', label: 'MC' },
  { id: 'cm_CR', role: 'cm', line: 'cm', side: 'CR', label: 'MC-R' },
  { id: 'cm_R', role: 'wing', line: 'cm', side: 'R', label: 'MR' },
  { id: 'dm_L', role: 'wb', line: 'dm', side: 'L', label: 'WBL' },
  { id: 'dm_CL', role: 'dm', line: 'dm', side: 'CL', label: 'DM-L' },
  { id: 'dm_C', role: 'dm', line: 'dm', side: 'C', label: 'DM' },
  { id: 'dm_CR', role: 'dm', line: 'dm', side: 'CR', label: 'DM-R' },
  { id: 'dm_R', role: 'wb', line: 'dm', side: 'R', label: 'WBR' },
  { id: 'df_L', role: 'fb', line: 'df', side: 'L', label: 'DL' },
  { id: 'df_CL', role: 'cd', line: 'df', side: 'CL', label: 'DC-L' },
  { id: 'df_C', role: 'cd', line: 'df', side: 'C', label: 'DC' },
  { id: 'df_CR', role: 'cd', line: 'df', side: 'CR', label: 'DC-R' },
  { id: 'df_R', role: 'fb', line: 'df', side: 'R', label: 'DR' },
  { id: 'gk_C', role: 'gk', line: 'gk', side: 'C', label: 'GK' },
];

function handleFormationChange() {
  const select = document.getElementById('xi-formation');
  if (!select) return;
  if (select.value === 'custom') {
    state.bestXiFormation = 'custom';
    try {
      localStorage.setItem('fmss_xi_formation', 'custom');
    } catch {}
    if (customSelectedSlots.length === 0) {
      customSelectedSlots = JSON.parse(JSON.stringify(XI_FORMATIONS['4-3-3 DM Wide']));
    }
    renderInteractiveMap();
  } else {
    state.bestXiFormation = select.value;
    try {
      localStorage.setItem('fmss_xi_formation', select.value);
    } catch {}
    renderBestXI();
  }
}

function renderInteractiveMap() {
  const box = $('bestxi');
  if (!box) return;
  const lineHeights = { fw: 12, am: 28, cm: 44, dm: 60, df: 76, gk: 91 };
  const sideWidths = { L: 12, CL: 31, C: 50, CR: 69, R: 88 };
  const isReady = customSelectedSlots.length === 11;

  let html = `<div class="an-head" style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px;">
      <h2>${escHtml(tf('tactic_title', { n: customSelectedSlots.length }))}</h2>
      <div class="xi-controls">
          ${xiProfFilterHtml()}
          <select id="xi-formation" onchange="handleFormationChange()" style="padding: 5px 10px; background: #1e293b; color: #fff; border: 1px solid #334155; border-radius: 5px; font-weight: bold; cursor: pointer;">
              ${XI_SELECTABLE_PRESET_KEYS
                .map((f) => `<option value="${f}">${f}</option>`)
                .join('')}
              <option value="custom" selected>${escHtml(text('bestxi_customOpt'))}</option>
          </select>
          <button onclick="confirmCustomTactics()" ${!isReady ? 'disabled' : ''} style="padding: 6px 14px; background: ${isReady ? '#8b5cf6' : '#334155'}; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: ${isReady ? 'pointer' : 'not-allowed'}; font-size: 12px;">${escHtml(text('tactic_confirm'))}</button>
      </div>
  </div>`;

  let pitchHtml = `<div style="position:relative; width:100%; max-width:700px; height:780px; background-color:#12301c; margin:20px auto; border-radius:12px; border:2px solid #2a3441; overflow:hidden;">`;
  INTERACTIVE_MAP.forEach((slot) => {
    const topPct = lineHeights[slot.line];
    const leftPct = sideWidths[slot.side] || 50;
    const isActivated = customSelectedSlots.some(
      (s) => s.line === slot.line && s.side === slot.side && s.role === slot.role,
    );
    const btnStyle = isActivated
      ? 'background: #8b5cf6; color: #fff; border: 2px solid #c4b5fd;'
      : 'background: rgba(15,23,42,0.6); color: #94a3b8; border: 2px dashed #475569;';
    pitchHtml += `<button onclick="toggleCustomSlot('${slot.line}', '${slot.side}', '${slot.role}')" style="position:absolute; top:${topPct}%; left:${leftPct}%; transform:translate(-50%, -50%); width:52px; height:42px; border-radius:8px; font-weight:bold; font-size:9px; cursor:pointer; z-index:20; ${btnStyle}">${slot.label}</button>`;
  });
  pitchHtml += `</div>`;
  box.innerHTML = html + xiTeamFiltersHtml() + pitchHtml;
}

function toggleCustomSlot(line, side, role) {
  const index = customSelectedSlots.findIndex((s) => s.line === line && s.side === side);
  if (index !== -1) {
    customSelectedSlots.splice(index, 1);
  } else {
    if (customSelectedSlots.length >= 11) {
      showToast(text('tactic_maxStarters'), 'warning');
      return;
    }
    customSelectedSlots.push({
      role,
      line,
      side,
      t:
        line === 'fw'
          ? 15
          : line === 'am'
            ? 30
            : line === 'cm'
              ? 45
              : line === 'dm'
                ? 60
                : line === 'df'
                  ? 75
                  : 90,
      l: side === 'L' ? 15 : side === 'CL' ? 33 : side === 'C' ? 50 : side === 'CR' ? 67 : 85,
    });
  }
  renderInteractiveMap();
}

function confirmCustomTactics() {
  if (customSelectedSlots.length !== 11) return;
  XI_FORMATIONS['custom_active'] = customSelectedSlots;
  state.bestXiFormation = 'custom_active';
  try {
    localStorage.setItem('fmss_xi_formation', 'custom_active');
  } catch {}
  try {
    localStorage.setItem('fmss_xi_custom', JSON.stringify(customSelectedSlots));
  } catch {}
  renderBestXI();
}

let clubListRows = [],
  clubListSortKey = 'name',
  clubListSortDir = 1;
let clubListScrollQueued = false;
const CLUB_LIST_ROW_H = 34;
let clubBestXiResults = new Map();
let clubBestXiContext = null;
let activeClubDetail = null;
let clubBestXiRun = 0;
function clubKey(club) {
  const id = Number(club?.id) || 0;
  return id > 0 ? `id:${id}` : `name:${normStr(club?.name || '')}`;
}
function clubXiContextIsCurrent() {
  const teamGroups = [...xiSelectedTeamGroups()].sort().join(',');
  return !!clubBestXiContext &&
    clubBestXiContext.players === state.players &&
    clubBestXiContext.clubs === state.clubs &&
    clubBestXiContext.meta === META_PRESET &&
    clubBestXiContext.profThreshold === state.xiProfThreshold &&
    clubBestXiContext.teamGroups === teamGroups;
}
function syncClubXiContext() {
  if (clubXiContextIsCurrent()) return false;
  clubBestXiResults.clear();
  clubBestXiContext = {
    players: state.players,
    clubs: state.clubs,
    meta: META_PRESET,
    profThreshold: state.xiProfThreshold,
    teamGroups: [...xiSelectedTeamGroups()].sort().join(','),
  };
  const status = $('club-xi-status');
  if (status) status.textContent = text('clubXiNeedsCalculate');
  if (activeClubDetail && !$('detail').classList.contains('hidden'))
    renderClubBestXiDetail(activeClubDetail);
  return true;
}
function clubXiResult(club) {
  return clubBestXiResults.get(clubKey(club)) || null;
}
function calculateClubBestXi(club, playersById, playersByName) {
  const id = Number(club?.id) || 0;
  const players = id > 0 && playersById.has(id)
    ? playersById.get(id)
    : playersByName.get(normStr(club?.name || '')) || [];
  const best = autoDetectBestFormation(players, 'meta');
  if (!best?.key || !best.result) return null;
  return {
    formation: best.key,
    lineup: best.result.lineup,
    average: xiAverageScore(best.result),
    filled: best.result.lineup.filter((slot) => slot.player).length,
  };
}
function clubXiPlayersIndex() {
  const selectedGroups = xiSelectedTeamGroups();
  const byId = new Map();
  const byName = new Map();
  const add = (map, key, player) => {
    if (!key) return;
    let squad = map.get(key);
    if (!squad) map.set(key, (squad = []));
    squad.push(player);
  };
  for (const player of state.players || []) {
    if (!selectedGroups.has(teamGroup(player.teamType))) continue;
    const id = Number(player.clubId) || 0;
    if (id > 0) add(byId, id, player);
    const name = normStr(player.club || '');
    if (name) add(byName, name, player);
  }
  return { byId, byName };
}
function calculateDisplayedClubBestXi() {
  const button = $('club-xi-calculate');
  if (!button || button.disabled) return;
  syncClubXiContext();
  const clubs = clubListRows.slice();
  if (!clubs.length) {
    const status = $('club-xi-status');
    if (status) status.textContent = text('clubXiNoClubs');
    return;
  }

  const run = ++clubBestXiRun;
  const status = $('club-xi-status');
  const { byId, byName } = clubXiPlayersIndex();
  let index = 0;
  button.disabled = true;
  const processBatch = () => {
    if (run !== clubBestXiRun) return;
    if (!clubXiContextIsCurrent()) {
      syncClubXiContext();
      button.disabled = false;
      if (status) status.textContent = text('clubXiResultsCleared');
      renderClubListVisible();
      return;
    }
    const end = Math.min(index + 12, clubs.length);
    let activeClubUpdated = false;
    for (; index < end; index++) {
      const club = clubs[index];
      const result = calculateClubBestXi(club, byId, byName);
      if (result) {
        clubBestXiResults.set(clubKey(club), result);
        activeClubUpdated ||= activeClubDetail === club;
      }
    }
    if (status)
      status.textContent = tf('clubXiCalculating', {
        done: index.toLocaleString(FORMAT_LOCALE),
        total: clubs.length.toLocaleString(FORMAT_LOCALE),
      });
    renderClubListVisible();
    if (activeClubUpdated)
      renderClubBestXiDetail(activeClubDetail);
    if (index < clubs.length) {
      setTimeout(processBatch, 0);
      return;
    }
    sortClubListRows();
    renderClubListVisible();
    button.disabled = false;
    if (status) status.textContent = tf('clubXiCalculated', { n: clubs.length.toLocaleString(FORMAT_LOCALE) });
  };
  processBatch();
}
function renderClubBestXiDetail(club) {
  const result = clubXiResult(club);
  const formationName = result?.formation || text('clubXiNotCalculated');
  const average = result?.average == null ? '–' : fmtMeta(result.average);
  const lineup = result
    ? `<div class="club-xi-mini">${renderXiPitch(result.lineup, club.name, { interactive: false })}</div>
       <div class="club-xi-player-count">${tf('clubXiPlayers', { n: result.filled })}</div>`
    : `<p class="club-xi-empty">${escHtml(text('clubXiRunForClub'))}</p>`;
  $('detail-body').innerHTML = `<section class="club-xi-detail">
    <div class="club-xi-kicker">${escHtml(text('clubXiTitle'))}</div>
    <h2>${escHtml(club.name || '')}</h2>
    <div class="sub">${escHtml([club.div || club.league, club.nation].filter(Boolean).join(' · '))}</div>
    <div class="club-xi-summary"><div><span>${escHtml(text('clubXiFormation'))}</span><b>${escHtml(formationName)}</b></div><div><span>${escHtml(text('clubXiAverage'))}</span><b>${escHtml(average)}</b></div></div>
    ${lineup}
  </section>`;
}
function showClubBestXiDetail(club) {
  if (!club) return;
  if (state.selected) metaPositionScoresCache.delete(state.selected);
  state.selected = null;
  activeClubDetail = club;
  syncClubXiContext();
  $('detail').classList.remove('popup', 'hidden');
  $('detail-backdrop').classList.add('hidden');
  renderClubBestXiDetail(club);
}
window.showClubBestXiDetail = showClubBestXiDetail;
const CLUB_LIST_COLS = [
  { key: 'name', label: 'clubColName', get: (c) => c.name || '' },
  { key: 'nation', label: 'clubColNation', get: (c) => c.nation || '' },
  {
    key: 'league',
    label: 'clubColLeague',
    get: (c) => c.div || c.league || '',
  },
  {
    key: 'reputation',
    label: 'clubColReputation',
    num: true,
    get: (c) => c.reputation ?? c.rep,
  },
  {
    key: 'bestXi',
    label: 'clubColBestXi',
    num: true,
    get: (c) => clubXiResult(c)?.average,
  },
  {
    key: 'balance',
    label: 'clubColBalance',
    money: true,
    get: (c) => clubFinanceValue(c, ['balance', 'clubBalance', 'club_balance']),
  },
  {
    key: 'transferBudget',
    label: 'clubColTransferBudget',
    money: true,
    get: (c) => clubFinanceValue(c, ['transferBudget', 'transfer_budget']),
  },
  {
    key: 'remainingTransfer',
    label: 'clubColTransferRemaining',
    money: true,
    get: (c) =>
      clubFinanceValue(c, [
        'remainingTransfer',
        'transferRemaining',
        'transferBudgetRemaining',
        'remainingTransferBudget',
        'remaining_transfer',
      ]),
  },
  {
    key: 'wageBudget',
    label: 'clubColWageBudget',
    money: true,
    wage: true,
    get: (c) => clubFinanceValue(c, ['wageBudget', 'wage_budget']),
  },
  {
    key: 'wageUsed',
    label: 'clubColWageUsed',
    money: true,
    wage: true,
    get: (c) => {
      const used = clubFinanceValue(c, ['wageUsed', 'wage_used']);
      if (used != null) return used;
      const budget = clubFinanceValue(c, ['wageBudget', 'wage_budget']);
      const remaining = clubFinanceValue(c, [
        'remainingWage',
        'wageRemaining',
        'wageBudgetRemaining',
        'remainingWageBudget',
        'remaining_wage',
      ]);
      return budget != null && remaining != null ? Number(budget) - Number(remaining) : null;
    },
  },
  {
    key: 'trainingFacilities',
    label: 'clubColTrainingFacilities',
    num: true,
    get: (c) =>
      clubDataValue(c, [
        'trainingFacilities',
        'trainingFacility',
        'trainingFac',
        'training_facilities',
      ]),
  },
  {
    key: 'youthTrainingFacilities',
    label: 'clubColYouthTrainingFacilities',
    num: true,
    get: (c) =>
      clubDataValue(c, [
        'youthTrainingFacilities',
        'youthTrainingFacility',
        'youthFacilities',
        'youth_training_facilities',
      ]),
  },
  {
    key: 'juniorCoaching',
    label: 'clubColJuniorCoaching',
    num: true,
    get: (c) => clubDataValue(c, ['juniorCoaching', 'junior_coaching']),
  },
  {
    key: 'youthRecruitment',
    label: 'clubColYouthRecruitment',
    num: true,
    get: (c) =>
      clubDataValue(c, [
        'youthRecruitment',
        'youthRecruitmentNet',
        'youthRecruitmentNetwork',
        'youth_recruitment',
      ]),
  },
];
const CLUB_FILTER_RANGE_KEYS = [
  'reputation',
  'transferBudget',
  'remainingTransfer',
  'wageBudget',
  'wageUsed',
  'balance',
  'trainingFacilities',
  'youthTrainingFacilities',
  'juniorCoaching',
  'youthRecruitment',
];
const CLUB_LIST_COL_BY_KEY = new Map(CLUB_LIST_COLS.map((col) => [col.key, col]));
const CLUB_LIST_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});
const CLUB_FINANCE_SANITY_CHECKS = [
  { keys: ['balance', 'clubBalance', 'club_balance'], limit: 100_000_000_000, absolute: true },
  { keys: ['transferBudget', 'transfer_budget'], limit: 1_000_000_000 },
  {
    keys: [
      'remainingTransfer',
      'transferRemaining',
      'transferBudgetRemaining',
      'remainingTransferBudget',
      'remaining_transfer',
    ],
    limit: 1_000_000_000,
  },
  { keys: ['wageBudget', 'wage_budget'], limit: 100_000_000 },
  { keys: ['wageUsed', 'wage_used'], limit: 100_000_000 },
  {
    keys: [
      'remainingWage',
      'wageRemaining',
      'wageBudgetRemaining',
      'remainingWageBudget',
      'remaining_wage',
    ],
    limit: 100_000_000,
  },
];
let CLUB_FINANCE_VALID_CACHE = new WeakMap();
function clubDataValue(club, keys) {
  for (const key of keys) if (club?.[key] != null && club[key] !== '') return club[key];
  return null;
}
function clubFinanceIsValid(club) {
  if (!club || typeof club !== 'object') return false;
  if (CLUB_FINANCE_VALID_CACHE.has(club)) return CLUB_FINANCE_VALID_CACHE.get(club);
  const seniorCount = state._clubSeniorSquadCounts?.get(Number(club?.id)) || 0;
  if (seniorCount < 11) {
    CLUB_FINANCE_VALID_CACHE.set(club, false);
    return false;
  }
  for (const check of CLUB_FINANCE_SANITY_CHECKS) {
    const candidate = clubDataValue(club, check.keys);
    if (candidate == null || candidate === '') continue;
    const amount = Number(candidate);
    if (!Number.isFinite(amount) || (check.absolute ? Math.abs(amount) : amount) > check.limit) {
      CLUB_FINANCE_VALID_CACHE.set(club, false);
      return false;
    }
  }
  CLUB_FINANCE_VALID_CACHE.set(club, true);
  return true;
}
function clubFinanceValue(club, keys) {
  if (!clubFinanceIsValid(club)) return null;
  const value = clubDataValue(club, keys);
  if (value == null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return value;
}
function clubListValue(col, club) {
  const value = col.get(club);
  if (value == null || value === '') return null;
  if (col.num || col.money || col.wage) {
    const number = Number(value);
    return Number.isFinite(number) ? number : String(value);
  }
  return String(value);
}
function fmtClubMoney(value, col) {
  const converted = Number(value) * (CUR_RATE[state.cur] || 1) * (col?.wage ? wageFactor() : 1);
  if (!Number.isFinite(converted)) return '–';
  return `${state.cur}\u00a0${Math.ceil(converted).toLocaleString(FORMAT_LOCALE, { maximumFractionDigits: 0 })}`;
}
function renderClubListHeader() {
  const head = $('club-list-head');
  if (!head) return;
  head.innerHTML = CLUB_LIST_COLS.map((col) => {
    const sorted = clubListSortKey === col.key;
    const suffix = col.wage ? ' ' + wageSuf() : '';
    const arrow = sorted ? (clubListSortDir > 0 ? ' ▲' : ' ▼') : '';
    return `<th data-club-sort="${col.key}" class="${sorted ? 'sorted' : ''}">${escHtml(text(col.label) + suffix)}${arrow}</th>`;
  }).join('');
}
function sortClubListRows() {
  const col = CLUB_LIST_COLS.find((x) => x.key === clubListSortKey) || CLUB_LIST_COLS[0];
  const rows = clubListRows;
  const values = rows.map((club) => clubListValue(col, club));
  const order = rows.map((_, index) => index);
  order.sort((a, b) => {
    const av = values[a],
      bv = values[b];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const compare =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : CLUB_LIST_COLLATOR.compare(String(av), String(bv));
    return compare * clubListSortDir;
  });
  clubListRows = order.map((index) => rows[index]);
}
function renderClubList() {
  if (!$('club-filter-name')) return;
  applyClubListFilters();
}
let clubIndexPlayersSource = null,
  clubIndexPlayersCount = -1,
  clubIndexPlayerData = null;
function clubIndexPlayers(players) {
  if (players === clubIndexPlayersSource && players.length === clubIndexPlayersCount)
    return clubIndexPlayerData;
  const seniorPlayers = [],
    activeClubIds = new Set();
  for (const player of players) {
    if (player.teamType != null && player.teamType !== 0) continue;
    seniorPlayers.push(player);
    const id = Number(player.clubId) || 0;
    if (id > 0) activeClubIds.add(id);
  }
  clubIndexPlayersSource = players;
  clubIndexPlayersCount = players.length;
  clubIndexPlayerData = { seniorPlayers, activeClubIds };
  return clubIndexPlayerData;
}
let clubLeagueSource = null,
  clubLeaguePlayerCount = -1,
  clubLeaguePlayersSource = null,
  clubLeagueIndexCache = [];
function buildClubLeagueIndex() {
  const clubs = state.clubs || [],
    players = state.players || [];
  if (
    clubs === clubLeagueSource &&
    players === clubLeaguePlayersSource &&
    players.length === clubLeaguePlayerCount
  )
    return clubLeagueIndexCache;
  clubLeagueSource = clubs;
  clubLeaguePlayersSource = players;
  clubLeaguePlayerCount = players.length;
  const { seniorPlayers, activeClubIds } = clubIndexPlayers(players);
  const byLeague = new Map();
  const add = (info, reputation, active) => {
    if (!info) return;
    let league = byLeague.get(info.key);
    if (!league)
      byLeague.set(info.key, (league = { ...info, strength: 0, count: 0, active: false }));
    league.count++;
    league.strength = Math.max(league.strength, Number(reputation) || 0);
    league.active ||= active;
  };
  for (const club of clubs)
    if (club.div || club.league) {
      const hasActiveList = activeClubIds.size > 0;
      const active = !hasActiveList || activeClubIds.has(Number(club.id));
      add(
        divisionInfo(club.div || club.league, club.nation, club.divisionId),
        club.reputation,
        active,
      );
    }
  const clubsById = clubCatalogById();
  for (const player of seniorPlayers)
    if (player.div) {
      const active = !activeClubIds.size || activeClubIds.has(Number(player.clubId));
      add(playerDivisionInfo(player, clubsById), player.clubRep, active);
    }
  const myLeagues = state.myDivs || new Set();
  clubLeagueIndexCache = [...byLeague.values()]
    .map((league) => ({
      ...league,
      name: league.label,
      norm: normStr(league.label),
      queryNorm: normStr(league.raw),
      mine: myLeagues.has(league.label),
    }))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        b.strength - a.strength ||
        b.count - a.count ||
        a.label.localeCompare(b.label, FORMAT_LOCALE),
    );
  return clubLeagueIndexCache;
}
let clubNationSource = null,
  clubNationPlayerCount = -1,
  clubNationPlayersSource = null,
  clubNationIndexCache = [];
function buildClubNationIndex() {
  const clubs = state.clubs || [],
    players = state.players || [];
  if (
    clubs === clubNationSource &&
    players === clubNationPlayersSource &&
    players.length === clubNationPlayerCount
  )
    return clubNationIndexCache;
  clubNationSource = clubs;
  clubNationPlayersSource = players;
  clubNationPlayerCount = players.length;
  const { activeClubIds } = clubIndexPlayers(players);
  const byNation = new Map();
  for (const club of clubs) {
    const nation = String(club.nation || '').trim();
    if (!nation) continue;
    const key = normStr(nation);
    let entry = byNation.get(key);
    if (!entry)
      byNation.set(
        key,
        (entry = {
          name: nation,
          norm: key,
          strength: 0,
          count: 0,
          active: false,
          mine: false,
        }),
      );
    const active = !activeClubIds.size || activeClubIds.has(Number(club.id));
    entry.active ||= active;
    entry.strength = Math.max(entry.strength, Number(club.reputation) || 0);
    entry.count++;
    entry.mine ||=
      Number(state.meta.myClubId) > 0
        ? Number(club.id) === Number(state.meta.myClubId)
        : normStr(club.name) === normStr(state.meta.myClub);
  }
  clubNationIndexCache = [...byNation.values()]
    .map((entry) => ({
      ...entry,
      label: entry.name,
      queryNorm: entry.norm,
    }))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        b.strength - a.strength ||
        b.count - a.count ||
        a.name.localeCompare(b.name, FORMAT_LOCALE),
    );
  return clubNationIndexCache;
}
function clubFilterDisplayNumber(key, club) {
  const col = CLUB_LIST_COL_BY_KEY.get(key);
  const value = col && clubListValue(col, club);
  if (typeof value !== 'number') return null;
  return col.money
    ? Math.ceil(value * (CUR_RATE[state.cur] || 1) * (col.wage ? wageFactor() : 1))
    : value;
}
function applyClubListFilters() {
  if (!$('club-filter-name')) return;
  syncClubXiContext();
  const name = foldSearchText($('club-filter-name').value.trim());
  const nation = normStr($('club-filter-nation').value.trim());
  const league = normStr($('club-filter-league').value.trim());
  const ranges = CLUB_FILTER_RANGE_KEYS.map((key) => ({
    key,
    min: document.querySelector(`[data-club-min="${key}"]`)?.value ?? '',
    max: document.querySelector(`[data-club-max="${key}"]`)?.value ?? '',
  })).filter((range) => range.min !== '' || range.max !== '');
  clubListRows = (state.clubs || []).filter((c) => {
    if (!c || !c.name) return false;
    if (name && !(c._clubNameQ ??= foldSearchText(c.name)).includes(name)) return false;
    if (nation && !(c._clubNationQ ??= normStr(c.nation || '')).includes(nation)) return false;
    if (league) {
      const clubLeague =
        c._clubLeagueLabel ??=
          divisionInfo(c.div || c.league, c.nation, c.divisionId)?.label || c.div || c.league || '';
      if (!(c._clubLeagueQ ??= normStr(clubLeague)).includes(league)) return false;
    }
    for (const range of ranges) {
      const value = clubFilterDisplayNumber(range.key, c);
      if (
        value == null ||
        (range.min !== '' && value < Number(range.min)) ||
        (range.max !== '' && value > Number(range.max))
      )
        return false;
    }
    return true;
  });
  sortClubListRows();
  renderClubListHeader();
  const count = $('club-list-count');
  if (count)
    count.textContent = tf('clubListCount', {
      n: clubListRows.length.toLocaleString(FORMAT_LOCALE),
    });
  const wrap = $('club-list-table-wrap');
  if (wrap) wrap.scrollTop = 0;
  renderClubListVisible();
}
function renderClubListVisible() {
  const wrap = $('club-list-table-wrap'),
    body = $('club-list-body');
  if (!wrap || !body) return;
  syncClubXiContext();
  const total = clubListRows.length;
  const first = Math.max(0, Math.floor(wrap.scrollTop / CLUB_LIST_ROW_H) - 8);
  const count = Math.ceil(wrap.clientHeight / CLUB_LIST_ROW_H) + 16;
  const last = Math.min(total, first + count);
  const cols = CLUB_LIST_COLS;
  if (!total) {
    body.innerHTML = `<tr><td class="club-list-empty dim" colspan="${cols.length}">${escHtml(text('clubs_noResults'))}</td></tr>`;
    return;
  }
  const spacer = (height) =>
    height > 0
      ? `<tr class="club-list-spacer"><td colspan="${cols.length}" style="height:${height}px"></td></tr>`
      : '';
  const rows = clubListRows
    .slice(first, last)
    .map((club, i) => {
      const cells = cols
        .map((col) => {
          const value = clubListValue(col, club);
          if (col.key === 'name')
            return `<td><button type="button" class="club-list-name" aria-label="${escHtml(tf('clubXiOpen', { name: club.name || '' }))}">${escHtml(value || '')}</button></td>`;
          let display = '–';
          if (value != null) {
            if (col.money)
              display = typeof value === 'number' ? fmtClubMoney(value, col) : String(value);
            else if (col.key === 'bestXi' && typeof value === 'number')
              display = fmtMeta(value);
            else if (col.num && typeof value === 'number')
              display = value.toLocaleString(FORMAT_LOCALE);
            else display = String(value);
          }
          const bestXi = col.key === 'bestXi' ? clubXiResult(club) : null;
          const tip = col.key === 'bestXi'
            ? bestXi?.average == null
              ? text(bestXi ? 'clubXiNoScore' : 'clubXiNeedsCalculate')
              : bestXi.formation
            : value == null
              ? text('clubDataMissing')
              : '';
          const title = tip ? ` title="${escHtml(tip)}"` : '';
          return `<td class="${col.num || col.money || col.wage ? 'num' : ''} ${value == null ? 'dim' : ''}"${title}>${escHtml(display)}</td>`;
        })
        .join('');
      return `<tr class="club-list-row ${(first + i) % 2 ? 'even' : ''}" data-club-key="${escHtml(clubKey(club))}" style="height:${CLUB_LIST_ROW_H}px">${cells}</tr>`;
    })
    .join('');
  body.innerHTML =
    spacer(first * CLUB_LIST_ROW_H) + rows + spacer((total - last) * CLUB_LIST_ROW_H);
}

$('club-xi-calculate')?.addEventListener('click', calculateDisplayedClubBestXi);
if ($('club-xi-calculate')) $('club-xi-calculate').textContent = text('clubXiCalculate');
$('club-list-body')?.addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-club-key]');
  if (!row) return;
  const club = (state.clubs || []).find((item) => clubKey(item) === row.dataset.clubKey);
  if (club) showClubBestXiDetail(club);
});

function xiPlayingTimeScore(player) {
  const value = player.playingTimeHappiness;
  return typeof value === 'number' && Number.isFinite(value) && value >= -100 && value <= 100 ? value : null;
}
function xiPlayingTimeText(player) {
  const value = xiPlayingTimeScore(player);
  return value == null ? 'Unknown' : `${player.playingTimeHappinessStatus || 'Score'} (${value})`;
}
function xiPlayingTimeClass(player) {
  const value = xiPlayingTimeScore(player);
  return value == null ? 'dim' : value < 0 ? 'xi-happiness-low' : 'dim';
}

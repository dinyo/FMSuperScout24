// ---------- squad needs analysis ----------
// Position groups with target squad sizes and their corresponding pitch codes.
const SQUAD_GROUPS = [
  { id: 'gk', label: 'Goalkeeper', pos: ['GK'], target: 2 },
  { id: 'cb', label: 'Central defender', pos: ['DC'], target: 4 },
  { id: 'fb', label: 'Full back', pos: ['DL', 'DR', 'WBL', 'WBR'], target: 4 },
  { id: 'dm', label: 'Defensive mid', pos: ['DM'], target: 2 },
  { id: 'cm', label: 'Central midfielder', pos: ['MC'], target: 3 },
  { id: 'wing', label: 'Winger', pos: ['ML', 'MR', 'AML', 'AMR'], target: 4 },
  { id: 'am', label: 'Attacking mid', pos: ['AMC'], target: 2 },
  { id: 'st', label: 'Striker', pos: ['ST'], target: 3 },
];
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function legacyAnalyseSquad() {
  const club = (state.meta.myClub || '').toLowerCase();
  if (!club) return null;
  if (
    analysisDataCache &&
    analysisDataCache.players === state.players &&
    analysisDataCache.playerCount === state.players.length &&
    analysisDataCache.shortlist === state.shortlist &&
    analysisDataCache.shortlistVersion === analysisShortlistVersion &&
    analysisDataCache.club === club
  )
    return analysisDataCache.data;
  const squad = [],
    shortlist = [];
  for (const p of state.players) {
    const isOwnClub = (p.club || '').toLowerCase() === club;
    if (isOwnClub) squad.push(p);
    else if (state.shortlist.has(p.id)) shortlist.push(p);
  }
  const data = { squad, shortlist };
  analysisDataCache = {
    players: state.players,
    playerCount: state.players.length,
    shortlist: state.shortlist,
    shortlistVersion: analysisShortlistVersion,
    club,
    data,
  };
  return data;
  const groups = SQUAD_GROUPS.map((g) => {
    const set = new Set(g.pos);
    const members = squad
      .filter((p) => (p.posArr || []).some((x) => set.has(x)))
      .sort((a, b) => (b.ca || 0) - (a.ca || 0));
    const cas = members.map((p) => p.ca || 0);
    const ages = members.map((p) => getAge(p)).filter((x) => x != null);
    const bestCa = cas.length ? Math.max(...cas) : 0;
    const youngTalents = members
      .filter((p) => {
        const a = getAge(p);
        return a > 0 && a <= 21 && (p.pa || 0) > 0;
      })
      .sort((a, b) => (b.pa || 0) - (a.pa || 0));
    const succ = youngTalents.find((p) => (p.pa || 0) >= bestCa); // Young talent already at the target level.
    // Determine squad depth.
    let status = 'ok';
    if (members.length < Math.ceil(g.target / 2)) status = 'short';
    else if (members.length < g.target) status = 'thin';
    const avgAge = avg(ages);
    const aging = avgAge >= 28.5 && !succ && members.length > 0;
    // Build the recommendation and scouting parameters.
    let rec = null,
      scout = null;
    const suggPa = Math.max(bestCa, Math.round(avg(cas) + 12) || 120);
    const np = state.hideCapa ? 'Np' : ''; // Use labels without numbers when CA/PA are hidden.
    if (status === 'short') {
      const n = g.target - members.length;
      rec = tf('anRecShort' + np, { n, pa: suggPa });
      scout = { pos: g.pos, minPa: Math.max(80, suggPa - 20) };
    } else if (aging) {
      rec = tf('anRecAging' + np, { age: 23, pa: bestCa });
      scout = { pos: g.pos, maxAge: 23, minPa: bestCa };
    } else if (!succ && members.length) {
      rec = tf('anRecSucc' + np, { age: 23, pa: bestCa });
      scout = { pos: g.pos, maxAge: 23, minPa: bestCa };
    } else if (status === 'thin') {
      rec = tf('anRecThin' + np, { pa: suggPa });
      scout = { pos: g.pos, minPa: suggPa };
    }
    // Used to prioritize sorting and summary metrics.
    const prio =
      status === 'short'
        ? 3
        : aging
          ? 2.5
          : !succ && members.length
            ? 1.5
            : status === 'thin'
              ? 1
              : 0;
    return {
      g,
      members,
      count: members.length,
      avgAge,
      avgCa: avg(cas),
      bestCa,
      youngTalents,
      succ,
      status,
      aging,
      rec,
      scout,
      prio,
    };
  });
  return { squad, groups, shortlist };
}
function analyseSquad() {
  const club = (state.meta.myClub || '').toLowerCase();
  if (!club) return null;
  if (
    analysisDataCache &&
    analysisDataCache.players === state.players &&
    analysisDataCache.playerCount === state.players.length &&
    analysisDataCache.shortlist === state.shortlist &&
    analysisDataCache.shortlistVersion === analysisShortlistVersion &&
    analysisDataCache.club === club
  )
    return analysisDataCache.data;
  const squad = [],
    shortlist = [];
  for (const player of state.players) {
    const isOwnClub = (player.club || '').toLowerCase() === club;
    if (isOwnClub) squad.push(player);
    else if (state.shortlist.has(player.id)) shortlist.push(player);
  }
  const data = { squad, shortlist };
  analysisDataCache = {
    players: state.players,
    playerCount: state.players.length,
    shortlist: state.shortlist,
    shortlistVersion: analysisShortlistVersion,
    club,
    data,
  };
  return data;
}
// Replace {key} placeholders with their supplied values.
function tf(key, vars) {
  return text(key).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
}

// ---------- club squad versus transfer shortlist ----------
// The formation is deliberately read from state.bestXiFormation: this makes the
// selector here and the one in Best XI two views of the same tactical choice.
const VS_POSITION_ORDER = ['GK', 'DC', 'FB', 'DM', 'MC', 'WM', 'AM', 'ST'];
const VS_TEAM_GROUPS = ['first', 'res', 'youth'];
const VS_POSITION_LABELS = {
  GK: 'GK',
  DC: 'DC',
  FB: 'FB',
  DM: 'DM',
  MC: 'MC',
  WM: 'WM',
  AM: 'AM',
  ST: 'ST',
};

function vsFormation() {
  return XI_FORMATIONS[state.bestXiFormation] || XI_FORMATIONS['4-3-3 DM Wide'];
}

function vsSelectedTeamGroups() {
  return new Set(
    Array.isArray(state.vsTeamFilter)
      ? state.vsTeamFilter.filter((group) => VS_TEAM_GROUPS.includes(group))
      : ['first'],
  );
}
function analysisSelectedTeamGroups() {
  return new Set(
    Array.isArray(state.anTeamFilter)
      ? state.anTeamFilter.filter((group) => VS_TEAM_GROUPS.includes(group))
      : ['first'],
  );
}
function myPlayerSelectedTeamGroups() {
  const selected = Array.isArray(state.myPlayerTeamFilter)
    ? state.myPlayerTeamFilter.filter((group) => VS_TEAM_GROUPS.includes(group))
    : ['first'];
  return new Set(selected);
}
function renderMyPlayerTeamFilters() {
  const box = $('myplayer-team-filters');
  if (!box) return;
  box.innerHTML = renderTeamGroupFilters('myplayer-team-filter', myPlayerSelectedTeamGroups());
  box.querySelectorAll('.myplayer-team-filter').forEach(
    (input) =>
      (input.onchange = (e) => {
        const selected = myPlayerSelectedTeamGroups();
        if (e.target.checked) selected.add(e.target.dataset.vsTeam);
        else selected.delete(e.target.dataset.vsTeam);
        state.myPlayerTeamFilter = [...selected];
        try {
          localStorage.setItem(
            'fmss_myplayer_team_filter',
            JSON.stringify(state.myPlayerTeamFilter),
          );
        } catch {}
        applyFilters();
      }),
  );
}
function vsTeamFilterMatches(p, selected) {
  return selected.size === VS_TEAM_GROUPS.length || selected.has(teamGroup(p.teamType));
}
function renderTeamGroupFilters(inputClass, selected) {
  const labels = { first: 'mt_first', res: 'mt_res', youth: 'mt_youth' };
  const options = VS_TEAM_GROUPS.map(
    (group) =>
      `<label><input class="${inputClass}" type="checkbox" data-vs-team="${group}" ${selected.has(group) ? 'checked' : ''}>${escHtml(text(labels[group]))}</label>`,
  ).join('');
  return `<div class="team-group-filters" role="group" aria-label="${escHtml(text('vsTeamFilter'))}"><span>${escHtml(text('vsTeamFilter'))}</span>${options}</div>`;
}

function vsPositionGroups() {
  const groups = new Set(vsFormation().map(slotMetaGroup).filter(Boolean));
  return VS_POSITION_ORDER.filter((group) => groups.has(group));
}

function vsScoreForGroup(p, group) {
  if (!p.attrs) return null;
  const scores = metaScoresByPosition(p, p.attrs).filter((x) => x.group === group);
  return scores.length ? scores[0].effectiveMeta : null;
}

function vsPlayerSort(group, sortKey) {
  return (a, b) => {
    const av =
      sortKey === 'meta'
        ? vsScoreForGroup(a, group)
        : sortKey === 'age'
          ? getAge(a)
          : sortKey === 'name'
            ? a.name
            : a.ca || 0;
    const bv =
      sortKey === 'meta'
        ? vsScoreForGroup(b, group)
        : sortKey === 'age'
          ? getAge(b)
          : sortKey === 'name'
            ? b.name
            : b.ca || 0;
    if (sortKey === 'name') return String(av || '').localeCompare(String(bv || ''));
    return (Number(bv) || -Infinity) - (Number(av) || -Infinity);
  };
}

function vsPlayerTable(players, group, title, kind, limit) {
  const sortKey = state.vsSorts[`${group}:${kind}`] || 'meta';
  const rows = players.slice().sort(vsPlayerSort(group, sortKey)).slice(0, limit);
  const options = [
    ['meta', text('c_meta')],
    ['ca', 'CA'],
    ['age', text('anAvgAge')],
    ['name', text('c_name')],
  ]
    .map(
      ([key, label]) =>
        `<option value="${key}" ${sortKey === key ? 'selected' : ''}>${escHtml(label)}</option>`,
    )
    .join('');
  const noRows = `<tr><td colspan="5" class="vs-empty">–</td></tr>`;
  return `<div class="vs-table-box">
    <div class="vs-table-head"><b>${escHtml(title)}</b><label>${escHtml(text('vsSort'))} <select class="vs-sort" data-vs-group="${group}" data-vs-kind="${kind}">${options}</select></label></div>
    <table class="vs-table"><thead><tr><th>${escHtml(text('c_name'))}</th><th>${escHtml(text('c_pos'))}</th><th>${escHtml(text('c_meta'))}</th>${state.hideCapa ? '' : '<th>CA</th>'}<th>${escHtml(text('anAvgAge'))}</th></tr></thead>
    <tbody>${
      rows.length
        ? rows
            .map((p) => {
              const score = vsScoreForGroup(p, group);
              return `<tr data-vs-player="${p.id}"><td>${escHtml(p.name || '–')}</td><td>${escHtml((p.posArr || []).join(', '))}</td><td>${score == null ? '–' : fmtMeta(score, group)}</td>${state.hideCapa ? '' : `<td>${p.ca || '–'}</td>`}<td>${getAge(p) || '–'}</td></tr>`;
            })
            .join('')
        : noRows
    }</tbody></table>
  </div>`;
}

function legacyRenderVsShortlist(squad) {
  const clubIds = new Set(squad.map((p) => p.id));
  const shortlist = state.players.filter((p) => state.shortlist.has(p.id) && !clubIds.has(p.id));
  const formationOptions = Object.keys(XI_FORMATIONS)
    .filter((key) => key !== 'custom_active')
    .map(
      (key) =>
        `<option value="${key}" ${state.bestXiFormation === key || (key === 'custom' && state.bestXiFormation === 'custom_active') ? 'selected' : ''}>${key === 'custom' ? text('bestxi_customOpt') : key}</option>`,
    )
    .join('');
  const positions = vsPositionGroups()
    .map((group) => {
      const clubCount = Math.max(0, Number(state.vsClubCounts[group] ?? 5));
      const shortlistCount = Math.max(0, Number(state.vsShortlistCounts[group] ?? 5));
      const clubPlayers = squad.filter((p) => vsScoreForGroup(p, group) != null);
      const shortPlayers = shortlist.filter((p) => vsScoreForGroup(p, group) != null);
      return `<article class="vs-position">
      <div class="vs-position-head"><h3>${VS_POSITION_LABELS[group]}</h3><div class="vs-limits">
        <label>${escHtml(text('anPlayers'))} <input class="vs-count" data-vs-group="${group}" data-vs-kind="club" type="number" min="0" max="99" value="${clubCount}"></label>
        <label>${escHtml(text('shortlist'))} <input class="vs-count" data-vs-group="${group}" data-vs-kind="shortlist" type="number" min="0" max="99" value="${shortlistCount}"></label>
      </div></div>
      <div class="vs-tables">${vsPlayerTable(clubPlayers, group, text('c_club'), 'club', clubCount)}${vsPlayerTable(shortPlayers, group, text('shortlist'), 'shortlist', shortlistCount)}</div>
    </article>`;
    })
    .join('');
  return `<section class="vs-shortlist"><div class="vs-head"><div><h2>${escHtml(text('vsTitle'))}</h2><p>${escHtml(text('vsDescription'))}</p></div><label>${escHtml(text('vsFormation'))} <select id="vs-formation">${formationOptions}</select></label></div>${positions}</section>`;
}

// The compact lists above were the first version of this view.  Keep the data
// helpers local, but replace the UI below with full player-style tables.
function vsPositionSlots() {
  const seen = new Set();
  return vsFormation()
    .flatMap((slot) => slotFmPositions(slot))
    .filter((pos) => {
      if (seen.has(pos)) return false;
      seen.add(pos);
      return true;
    })
    .sort((a, b) => (POS_RANK[a] ?? 99) - (POS_RANK[b] ?? 99));
}
function vsPlayersByPosition(players, positions, threshold, selectedTeams = null) {
  const allowed = new Set(positions),
    result = new Map(positions.map((pos) => [pos, []]));
  const allTeamsSelected = !selectedTeams || selectedTeams.size === VS_TEAM_GROUPS.length;
  for (const p of players) {
    if (!allTeamsSelected && !selectedTeams.has(teamGroup(p.teamType))) continue;
    const proficiency = p.posProficiency;
    if (hasPositionProficiency(p)) {
      for (const pos in proficiency) {
        if (
          Object.hasOwn(proficiency, pos) &&
          allowed.has(pos) &&
          Number(proficiency[pos]) >= threshold
        )
          result.get(pos).push(p);
      }
    } else {
      const seen = new Set();
      for (const pos of p.posArr || []) {
        if (allowed.has(pos) && !seen.has(pos)) {
          result.get(pos).push(p);
          seen.add(pos);
        }
      }
    }
  }
  return result;
}
function vsScoreForPosition(p, pos) {
  if (!p.attrs) return null;
  let cached = vsPositionMetaCache.get(p);
  if (!cached || cached.attrs !== p.attrs) {
    cached = {
      attrs: p.attrs,
      scores: new Map(metaScoresByPosition(p, p.attrs).map((x) => [x.pos, x.effectiveMeta])),
    };
    vsPositionMetaCache.set(p, cached);
  }
  return cached.scores.get(pos) ?? null;
}
function vsPotentialScoresByPosition(p) {
  if (!p.attrs) return new Map();
  const age = getAge(p);
  let cached = vsPotentialMetaCache.get(p);
  if (
    cached &&
    cached.attrs === p.attrs &&
    cached.ca === p.ca &&
    cached.pa === p.pa &&
    cached.age === age
  )
    return cached.scores;
  const currentCache = vsPositionMetaCache.get(p);
  const current =
    currentCache && currentCache.attrs === p.attrs
      ? currentCache.scores
      : new Map(metaScoresByPosition(p, p.attrs).map((x) => [x.pos, x.effectiveMeta]));
  vsPositionMetaCache.set(p, { attrs: p.attrs, scores: current });
  const projectedAttrs = projectAttrs(p);
  const projected = projectedAttrs
    ? new Map(metaScoresByPosition(p, projectedAttrs).map((x) => [x.pos, x.effectiveMeta]))
    : new Map();
  const scores = new Map();
  for (const [pos, value] of current) scores.set(pos, Math.max(value, projected.get(pos) ?? value));
  vsPotentialMetaCache.set(p, {
    attrs: p.attrs,
    ca: p.ca,
    pa: p.pa,
    age,
    scores,
  });
  return scores;
}
function vsPotentialScoreForPosition(p, pos) {
  return vsPotentialScoresByPosition(p).get(pos) ?? null;
}
function vsMeetsProficiency(p, pos) {
  if (!hasPositionProficiency(p)) return (p.posArr || []).includes(pos);
  return (p.posProficiency[pos] || 0) >= state.vsProfThreshold;
}
function vsColConfig() {
  const keys = PLAYER_COLS.filter((c) => !c.star).map((c) => c.key);
  if (!state.vsColCfg || !Array.isArray(state.vsColCfg.order)) {
    state.vsColCfg = {
      order: [...keys],
      hidden: ['interest', ...PLAYER_COLS.filter((c) => c.defHidden).map((c) => c.key)],
    };
  }
  state.vsColCfg.order = state.vsColCfg.order.filter((k) => keys.includes(k));
  keys.forEach((k) => {
    if (!state.vsColCfg.order.includes(k)) state.vsColCfg.order.push(k);
  });
  // Name anchors a comparison while the remaining columns scroll horizontally.
  state.vsColCfg.order = ['name', ...state.vsColCfg.order.filter((k) => k !== 'name')];
  state.vsColCfg.hidden = state.vsColCfg.hidden.filter((k) => k !== 'name');
  return state.vsColCfg;
}
function vsActiveCols() {
  const cfg = vsColConfig(),
    hidden = new Set(cfg.hidden),
    byKey = Object.fromEntries(PLAYER_COLS.map((c) => [c.key, c]));
  // This is deliberately one shared column set for the club and shortlist table.
  // No shortlist star here: the comparison is read-only and needs clean alignment.
  return cfg.order.filter((k) => !hidden.has(k)).map((k) => byKey[k]);
}
function vsValue(p, col, pos) {
  return col.key === 'meta' ? vsScoreForPosition(p, pos) : col.get ? col.get(p) : null;
}
function vsCell(p, col, pos) {
  if (col.key === 'meta') {
    const v = vsScoreForPosition(p, pos);
    return `<td class="num">${v == null ? '<span class="dim">–</span>' : fmtMeta(v, POS_TO_META_GROUP[pos] || pos)}</td>`;
  }
  if (col.render) return `<td class="${col.num ? 'num' : ''}">${col.render(p)}</td>`;
  let v = vsValue(p, col, pos);
  if (col.name) return `<td class="pname">${v ? escHtml(v) : '?'}</td>`;
  if (col.fmt) v = col.fmt(v);
  return `<td class="${col.num ? 'num' : ''} ${col.tdCls ? col.tdCls(p) : ''}">${v == null || v === '' ? '–' : escHtml(String(v))}</td>`;
}
function vsTopRows(players, col, pos, sort, limit) {
  const count = Math.max(0, Math.floor(Number(limit) || 0));
  if (!count) return [];
  const dir = sort.dir === 1 ? 1 : -1,
    top = [];
  const compare = (a, b) => {
    if (a.value == null) return b.value == null ? a.index - b.index : 1;
    if (b.value == null) return -1;
    const order =
      typeof a.value === 'number' && typeof b.value === 'number'
        ? a.value - b.value
        : String(a.value).localeCompare(String(b.value));
    return order * dir || a.index - b.index;
  };
  let index = 0;
  for (const p of players) {
    const item = { p, value: vsValue(p, col, pos), index: index++ };
    let low = 0,
      high = top.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (compare(item, top[middle]) < 0) high = middle;
      else low = middle + 1;
    }
    if (low < count) {
      top.splice(low, 0, item);
      if (top.length > count) top.pop();
    }
  }
  return top.map((item) => item.p);
}
function vsPlayerTableFull(players, pos, title, kind, limit) {
  const cols = vsActiveCols(),
    id = kind;
  const saved = state.vsSorts[id] || state.vsSorts.shared;
  const sort = saved && typeof saved === 'object' ? saved : { key: 'meta', dir: -1 };
  const col = cols.find((c) => c.key === sort.key) || cols.find((c) => c.key === 'meta');
  const rows = vsTopRows(players, col, pos, sort, limit);
  const widths = cols.map((c) => state.vsColW[c.key] || c.w || 90);
  const colgroup = `<colgroup>${cols.map((c, i) => `<col data-vs-key="${c.key}" style="width:${widths[i]}px">`).join('')}</colgroup>`;
  const heads = cols
    .map(
      (c) =>
        `<th data-vs-col="${c.key}" class="${c.num ? 'num ' : ''}${c.key === sort.key ? 'sorted' : ''}">${colLabel(c)}${c.key === sort.key ? (sort.dir < 0 ? ' ▼' : ' ▲') : ''}<span class="vs-col-resize"></span></th>`,
    )
    .join('');
  const body = rows.length
    ? rows
        .map(
          (p) => `<tr data-vs-player="${p.id}">${cols.map((c) => vsCell(p, c, pos)).join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${cols.length}" class="vs-empty">–</td></tr>`;
  return `<div class="vs-table-box"><div class="vs-table-head"><b>${escHtml(title)}</b></div><div class="vs-table-scroll"><table class="vs-table" style="width:${widths.reduce((a, b) => a + b, 0)}px" data-vs-pos="${pos}" data-vs-kind="${kind}">${colgroup}<thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}
function vsFormationLabel() {
  if (state.bestXiFormation !== 'custom' && state.bestXiFormation !== 'custom_active')
    return state.bestXiFormation;
  const all = vsFormation().flatMap(slotFmPositions),
    seen = new Set();
  return all
    .filter((pos) => {
      if (seen.has(pos)) return false;
      seen.add(pos);
      return true;
    })
    .map((pos) => {
      const n = all.filter((x) => x === pos).length;
      return n > 1 ? `${pos} ×${n}` : pos;
    })
    .join(' · ');
}
function renderVsColumnWidth(key) {
  const cols = vsActiveCols();
  const width = state.vsColW[key] || cols.find((c) => c.key === key)?.w || 90;
  document.querySelectorAll(`.vs-table col[data-vs-key="${key}"]`).forEach((col) => {
    col.style.width = width + 'px';
  });
  const total = cols.reduce((sum, c) => sum + (state.vsColW[c.key] || c.w || 90), 0);
  document.querySelectorAll('.vs-table').forEach((table) => {
    table.style.width = total + 'px';
  });
}
function renderVsShortlist(squad) {
  const clubIds = new Set(squad.map((p) => p.id));
  const shortlist = state.players.filter((p) => state.shortlist.has(p.id) && !clubIds.has(p.id));
  const positions = vsPositionSlots()
    .map((pos) => {
      const clubCount = Math.max(0, Number(state.vsClubCounts[pos] ?? 5)),
        shortlistCount = Math.max(0, Number(state.vsShortlistCounts[pos] ?? 5));
      return `<article class="vs-position"><div class="vs-position-head"><h3>${pos}</h3><div class="vs-limits">
      <label>${escHtml(text('anPlayers'))} <input class="vs-count" data-vs-pos="${pos}" data-vs-kind="club" type="number" min="0" max="99" value="${clubCount}"></label>
      <label>${escHtml(text('shortlist'))} <input class="vs-count" data-vs-pos="${pos}" data-vs-kind="shortlist" type="number" min="0" max="99" value="${shortlistCount}"></label>
    </div></div><div class="vs-tables">${vsPlayerTableFull(
      squad.filter((p) => vsMeetsProficiency(p, pos)),
      pos,
      text('c_club'),
      'club',
      clubCount,
    )}${vsPlayerTableFull(
      shortlist.filter((p) => vsMeetsProficiency(p, pos)),
      pos,
      text('shortlist'),
      'shortlist',
      shortlistCount,
    )}</div></article>`;
    })
    .join('');
  return `<section class="vs-shortlist"><div class="vs-head"><div><h2>${escHtml(text('vsTitle'))}</h2><p>${escHtml(text('vsDescription'))}</p><div class="vs-formation">${escHtml(text('vsFormation'))}: <b>${escHtml(vsFormationLabel())}</b> <span>· ${escHtml(text('vsFormationHint'))}</span></div></div><label>${escHtml(text('profThresholdLabel'))} <input id="vs-prof-threshold" type="number" min="1" max="20" value="${state.vsProfThreshold}"></label></div>${positions}</section>`;
}

// Both sides share column visibility and widths while keeping separate sort states.
function renderVsShortlist(squad, shortlist) {
  const selectedTeams = vsSelectedTeamGroups();
  const positionSlots = vsPositionSlots();
  const clubByPosition = vsPlayersByPosition(
    squad,
    positionSlots,
    state.vsProfThreshold,
    selectedTeams,
  );
  const shortlistByPosition = vsPlayersByPosition(
    shortlist,
    positionSlots,
    state.vsProfThreshold,
    selectedTeams,
  );
  const positionCards = positionSlots
    .map((pos) => {
      const clubCount = Math.max(0, Number(state.vsClubCounts[pos] ?? 5)),
        shortlistCount = Math.max(0, Number(state.vsShortlistCounts[pos] ?? 5));
      return `<article class="vs-position"><div class="vs-position-head"><h3>${pos}</h3><div class="vs-limits">
      <label>${escHtml(text('anPlayers'))} <input class="vs-count" data-vs-pos="${pos}" data-vs-kind="club" type="number" min="0" max="99" value="${clubCount}"></label>
      <label>${escHtml(text('shortlist'))} <input class="vs-count" data-vs-pos="${pos}" data-vs-kind="shortlist" type="number" min="0" max="99" value="${shortlistCount}"></label>
    </div></div><div class="vs-tables">${vsPlayerTableFull(clubByPosition.get(pos), pos, text('c_club'), 'club', clubCount)}${vsPlayerTableFull(shortlistByPosition.get(pos), pos, text('shortlist'), 'shortlist', shortlistCount)}</div></article>`;
    })
    .join('');
  const positions = positionCards;
  const layoutLabel = state.vsLayout === 'side' ? text('vsLayoutStack') : text('vsLayoutSide');
  return `<section class="vs-shortlist ${state.vsLayout === 'side' ? 'vs-side' : ''}"><div class="vs-head"><div><h2>${escHtml(text('vsTitle'))}</h2><p>${escHtml(text('vsDescription'))}</p><div class="vs-formation">${escHtml(text('vsFormation'))}: <b>${escHtml(vsFormationLabel())}</b> <span>· ${escHtml(text('vsFormationHint'))}</span></div></div><div class="vs-controls"><label>${escHtml(text('profThresholdLabel'))} <input id="vs-prof-threshold" type="number" min="1" max="20" value="${state.vsProfThreshold}"></label><button id="vs-layout-toggle" type="button">${layoutLabel}</button></div></div>${positions}</section>`;
}

function renderVsTeamFilters() {
  return renderTeamGroupFilters('vs-team-filter', vsSelectedTeamGroups());
}

function openVsColMenu(x, y) {
  const old = $('vs-colmenu');
  if (old) old.remove();
  const cfg = vsColConfig(),
    hidden = new Set(cfg.hidden),
    menu = document.createElement('div');
  menu.id = 'vs-colmenu';
  menu.className = 'colmenu';
  menu.innerHTML =
    `<div class="cm-head">${text('colsTitle')}</div>` +
    PLAYER_COLS.filter((c) => !c.star)
      .map(
        (c) =>
          `<label class="cm-row"><input type="checkbox" data-k="${c.key}" ${hidden.has(c.key) ? '' : 'checked'}> ${colLabel(c)}</label>`,
      )
      .join('');
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 340) + 'px';
  document.body.appendChild(menu);
  menu.querySelectorAll('input').forEach(
    (input) =>
      (input.onchange = () => {
        const h = new Set(vsColConfig().hidden);
        input.checked ? h.delete(input.dataset.k) : h.add(input.dataset.k);
        state.vsColCfg.hidden = [...h];
        localStorage.setItem('fmss_vs_cols', JSON.stringify(state.vsColCfg));
        menu.remove();
        renderAnalysis();
      }),
  );
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#vs-colmenu')) {
    const menu = $('vs-colmenu');
    if (menu) menu.remove();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const menu = $('vs-colmenu');
    if (menu) menu.remove();
  }
});

function legacyRenderAnalysis() {
  const box = $('analysis');
  const data = analyseSquad();
  if (!data) {
    box.innerHTML = `<div class="an-empty">${text('anNoClub')}</div>`;
    return;
  }
  const { squad, groups } = data;
  const needs = groups.filter((x) => x.rec).sort((a, b) => b.prio - a.prio);
  const topNeed = needs[0];
  const statusLabel = {
    ok: text('anOk'),
    thin: text('anThin'),
    short: text('anShort'),
  };

  const caTile = state.hideCapa
    ? ''
    : `<div class="an-sum-item"><span class="an-sum-n">${Math.round(avg(squad.map((p) => p.ca || 0)))}</span><span class="an-sum-l">${text('anAvgCa')}</span></div>`;
  const summary = `<div class="an-summary">
    <div class="an-sum-item"><span class="an-sum-n">${squad.length}</span><span class="an-sum-l">${text('anSquadSize')}</span></div>
    ${caTile}
    <div class="an-sum-item"><span class="an-sum-n">${avg(squad.map((p) => getAge(p)).filter(Boolean)).toFixed(1)}</span><span class="an-sum-l">${text('anAvgAge')}</span></div>
    <div class="an-sum-item need"><span class="an-sum-l">${text('anBiggestNeed')}</span><span class="an-sum-need">${topNeed ? topNeed.g.label : '–'}</span></div>
  </div>`;

  const cards = groups
    .map((x) => {
      const st = x.aging ? 'aging' : x.status;
      const badge =
        x.status === 'short'
          ? `<span class="an-badge red">${text('anShort')}</span>`
          : x.aging
            ? `<span class="an-badge amber">${text('anAging')}</span>`
            : !x.succ && x.count
              ? `<span class="an-badge amber">${text('anNoSucc')}</span>`
              : x.status === 'thin'
                ? `<span class="an-badge amber">${text('anThin')}</span>`
                : `<span class="an-badge green">${text('anOk')}</span>`;
      const dots = Array.from(
        { length: x.g.target },
        (_, i) => `<span class="dot ${i < x.count ? 'on' : ''}"></span>`,
      ).join('');
      const depthDots =
        dots +
        (x.count > x.g.target ? `<span class="dot-extra">+${x.count - x.g.target}</span>` : '');
      const yt = x.youngTalents[0];
      return `<div class="an-card ${st}">
      <div class="an-card-top"><span class="an-pos">${x.g.label}</span>${badge}</div>
      <div class="an-depth" data-tip="${x.count}/${x.g.target}">${depthDots}</div>
      <div class="an-stats">
        <span><b>${x.count}</b> ${text('anPlayers')}</span>
        ${
          state.hideCapa
            ? ''
            : `<span><b>${Math.round(x.avgCa)}</b> ${text('anAvgCa')}</span>
        <span><b>${x.bestCa}</b> ${text('anTopCa')}</span>`
        }
        <span><b>${x.avgAge ? x.avgAge.toFixed(0) : '–'}</b> ${text('anAvgAge')}</span>
      </div>
      <div class="an-young">${text('anYoungTalent')}: ${yt ? `${escHtml(yt.name)} <span class="dim">(${getAge(yt)}${state.hideCapa ? '' : `, PA ${yt.pa || '·'}`})</span>` : text('anNone')}</div>
      ${x.rec ? `<div class="an-rec">${x.rec}</div>` : ''}
      ${x.scout ? `<button class="an-scout" data-grp="${x.g.id}">${text('anScout')} ${icon('arrowRight', 11)}</button>` : ''}
    </div>`;
    })
    .join('');

  box.innerHTML = `<div class="an-head"><h2>${text('anTitle')}</h2></div>${summary}<div class="an-grid">${cards}</div>${renderVsShortlist(squad)}`;
  box.querySelector('.vs-controls').insertAdjacentHTML('afterbegin', renderVsTeamFilters());
  box.querySelectorAll('.an-scout').forEach(
    (b) =>
      (b.onclick = () => {
        const grp = groups.find((x) => x.g.id === b.dataset.grp);
        if (grp && grp.scout) scoutFor(grp.scout);
      }),
  );
  box.querySelectorAll('.vs-team-filter').forEach(
    (input) =>
      (input.onchange = (e) => {
        const selected = vsSelectedTeamGroups();
        if (e.target.checked) selected.add(e.target.dataset.vsTeam);
        else selected.delete(e.target.dataset.vsTeam);
        state.vsTeamFilter = [...selected];
        try {
          localStorage.setItem('fmss_vs_team_filter', JSON.stringify(state.vsTeamFilter));
        } catch {}
        renderAnalysis();
      }),
  );
  box.querySelector('#vs-prof-threshold').onchange = (e) => {
    state.vsProfThreshold = Math.max(1, Math.min(20, Number(e.target.value) || 15));
    try {
      localStorage.setItem('fmss_vs_prof_threshold', state.vsProfThreshold);
    } catch {}
    renderAnalysis();
  };
  box.querySelector('#vs-layout-toggle').onclick = () => {
    state.vsLayout = state.vsLayout === 'side' ? 'stack' : 'side';
    try {
      localStorage.setItem('fmss_vs_layout', state.vsLayout);
    } catch {}
    renderAnalysis();
  };
  box.querySelectorAll('.vs-count').forEach(
    (input) =>
      (input.onchange = (e) => {
        const target =
          e.target.dataset.vsKind === 'club' ? state.vsClubCounts : state.vsShortlistCounts;
        target[e.target.dataset.vsPos] = Math.max(0, Math.min(99, Number(e.target.value) || 0));
        try {
          localStorage.setItem(
            e.target.dataset.vsKind === 'club' ? 'fmss_vs_club_counts' : 'fmss_vs_shortlist_counts',
            JSON.stringify(target),
          );
        } catch {}
        renderAnalysis();
      }),
  );
  box.querySelectorAll('.vs-table th[data-vs-col]').forEach(
    (th) =>
      (th.onclick = () => {
        const id = th.closest('.vs-table')?.dataset.vsKind || 'club';
        const old = state.vsSorts[id] || state.vsSorts.shared;
        const current = old && typeof old === 'object' ? old : { key: 'meta', dir: -1 };
        state.vsSorts[id] = {
          key: th.dataset.vsCol,
          dir:
            current.key === th.dataset.vsCol
              ? -current.dir
              : ['name', 'pos', 'club', 'nat'].includes(th.dataset.vsCol)
                ? 1
                : -1,
        };
        try {
          localStorage.setItem('fmss_vs_sorts', JSON.stringify(state.vsSorts));
        } catch {}
        renderAnalysis();
      }),
  );
  box.querySelectorAll('.vs-table thead').forEach(
    (head) =>
      (head.oncontextmenu = (e) => {
        e.preventDefault();
        openVsColMenu(e.clientX, e.clientY);
      }),
  );
  box.querySelectorAll('.vs-col-resize').forEach(
    (grip) =>
      (grip.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const th = grip.closest('th'),
          key = th.dataset.vsCol,
          startX = e.clientX,
          startW = th.getBoundingClientRect().width;
        const move = (ev) => {
          state.vsColW[key] = Math.max(40, Math.round(startW + ev.clientX - startX));
          renderVsColumnWidth(key);
        };
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          try {
            localStorage.setItem('fmss_vs_colw', JSON.stringify(state.vsColW));
          } catch {}
          renderAnalysis();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      }),
  );
  box
    .querySelectorAll('.vs-col-resize')
    .forEach((grip) => (grip.onclick = (e) => e.stopPropagation()));
  box.querySelectorAll('[data-vs-player]').forEach(
    (row) =>
      (row.onclick = (e) => {
        const player = state.players.find((p) => String(p.id) === row.dataset.vsPlayer);
        if (player) showDetail(player);
      }),
  );
}
function analysisMetricStats(players, getter) {
  let min = Infinity,
    max = -Infinity,
    total = 0,
    count = 0;
  for (const player of players) {
    const raw = getter(player);
    if (raw == null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
    total += value;
    count++;
  }
  return count ? { min, average: total / count, max } : null;
}
function analysisMetricText(key, value, ageDecimals = true, group = null) {
  if (value == null) return '–';
  if (key === 'meta' || key === 'metapa') return fmtMeta(value, group);
  if (key === 'age')
    return ageDecimals ? value.toFixed(1) : Math.round(value).toLocaleString(FORMAT_LOCALE);
  return Math.round(value).toLocaleString(FORMAT_LOCALE);
}
function analysisCardMetrics(pos) {
  return [
    {
      key: 'ca',
      label: 'CA',
      hidden: state.hideCapa,
      get: (player) => (player.ca > 0 ? player.ca : null),
    },
    {
      key: 'pa',
      label: 'PA',
      hidden: state.hideCapa,
      get: (player) => (player.pa > 0 ? player.pa : null),
    },
    {
      key: 'meta',
      label: text('c_meta'),
      hidden: state.hideMeta,
      get: (player) => vsScoreForPosition(player, pos),
    },
    {
      key: 'metapa',
      label: text('c_metapa'),
      hidden: state.hideMeta || state.hideCapa,
      get: (player) => vsPotentialScoreForPosition(player, pos),
    },
    {
      key: 'age',
      label: text('c_age'),
      hidden: false,
      get: (player) => (getAge(player) > 0 ? getAge(player) : null),
    },
  ].filter((metric) => !metric.hidden);
}
function renderAnalysisCardPlayers(players, pos, metrics) {
  const savedSort =
    state.anCardSort && typeof state.anCardSort === 'object' ? state.anCardSort : {};
  const sortKey = ['name', ...metrics.map((metric) => metric.key)].includes(savedSort.key)
    ? savedSort.key
    : 'age';
  const sortDir = savedSort.dir === 1 ? 1 : -1;
  const columns = [
    { key: 'name', label: text('c_name') },
    ...metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      metric,
    })),
  ];
  const valueFor = (player, column) =>
    column.key === 'name' ? player.name || '' : column.metric.get(player);
  const sortColumn = columns.find((item) => item.key === sortKey) || columns[0];
  const rows = players
    .map((player, index) => ({ player, index, value: valueFor(player, sortColumn) }))
    .sort((a, b) => {
      const av = a.value,
        bv = b.value;
      if (av == null || av === '') return bv == null || bv === '' ? 0 : 1;
      if (bv == null || bv === '') return -1;
      const result =
        sortKey === 'name'
          ? String(av).localeCompare(String(bv), FORMAT_LOCALE)
          : (Number(av) || 0) - (Number(bv) || 0);
      return result * sortDir || a.index - b.index;
    })
    .map((entry) => entry.player);
  const heads = columns
    .map((column) => {
      const sorted = column.key === sortKey;
      const arrow = sorted ? (sortDir < 0 ? ' ▼' : ' ▲') : '';
      return `<th data-an-sort="${column.key}" class="${column.key !== 'name' ? 'num ' : ''}${sorted ? 'sorted' : ''}">${escHtml(column.label)}${arrow}</th>`;
    })
    .join('');
  const body = rows
    .map(
      (player) =>
        `<tr data-an-player="${Number(player.id) || 0}">${columns
          .map((column) => {
            if (column.key === 'name')
              return `<td class="an-player-name">${escHtml(player.name || '?')}</td>`;
            return `<td class="num">${analysisMetricText(column.key, valueFor(player, column), false, POS_TO_META_GROUP[pos] || pos)}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  return `<div class="an-player-table-wrap"><table class="an-player-table"><thead><tr>${heads}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" class="an-player-empty">—</td></tr>`}</tbody></table></div>`;
}
function renderAnalysis() {
  const box = $('analysis');
  const data = analyseSquad();
  if (!data) {
    box.innerHTML = `<div class="an-empty">${text('anNoClub')}</div>`;
    return;
  }
  const { squad, shortlist } = data;
  const analysisTeams = analysisSelectedTeamGroups();
  const positions = vsPositionSlots();
  const squadByPosition = vsPlayersByPosition(
    squad,
    positions,
    state.anProfThreshold,
    analysisTeams,
  );
  const filteredSquad = squad.filter((player) => vsTeamFilterMatches(player, analysisTeams));
  const avgCa = analysisMetricStats(filteredSquad, (player) => (player.ca > 0 ? player.ca : null));
  const avgAge = analysisMetricStats(filteredSquad, (player) =>
    getAge(player) > 0 ? getAge(player) : null,
  );
  const summary = `<div class="an-summary">
    <div class="an-sum-item"><span class="an-sum-n">${filteredSquad.length}</span><span class="an-sum-l">${text('anSquadSize')}</span></div>
    ${state.hideCapa ? '' : `<div class="an-sum-item"><span class="an-sum-n">${analysisMetricText('ca', avgCa?.average)}</span><span class="an-sum-l">${text('anAvgCa')}</span></div>`}
    <div class="an-sum-item"><span class="an-sum-n">${analysisMetricText('age', avgAge?.average)}</span><span class="an-sum-l">${text('anAvgAge')}</span></div>
  </div>`;
  const cards = positions
    .map((pos) => {
      const players = squadByPosition.get(pos) || [];
      const metrics = analysisCardMetrics(pos);
      const rows = metrics
        .map((metric) => {
          const values = analysisMetricStats(players, metric.get);
          return `<div class="an-metric-row"><span class="an-metric-label">${escHtml(metric.label)}</span><span>${analysisMetricText(metric.key, values?.average, true, POS_TO_META_GROUP[pos] || pos)}</span><span>${analysisMetricText(metric.key, values?.min, false, POS_TO_META_GROUP[pos] || pos)}</span><span>${analysisMetricText(metric.key, values?.max, false, POS_TO_META_GROUP[pos] || pos)}</span></div>`;
        })
        .join('');
      return `<article class="an-card"><div class="an-card-top"><span class="an-pos">${pos}</span></div>
      <div class="an-player-total"><b>${players.length}</b><span>${text('anPlayerTotal')}</span></div>
      <div class="an-metric-table"><div class="an-metric-row an-metric-head"><span></span><span>${text('anAverage')}</span><span>${text('anLowest')}</span><span>${text('anHighest')}</span></div>${rows}</div>
      ${renderAnalysisCardPlayers(players, pos, metrics)}
    </article>`;
    })
    .join('');

  const cardControls = `<div class="an-card-controls">${renderTeamGroupFilters('an-team-filter', analysisTeams)}<label class="an-prof-filter">${escHtml(text('profThresholdLabel'))}<input id="an-prof-threshold" type="number" min="1" max="20" value="${state.anProfThreshold}"></label></div>`;
  box.innerHTML = `<div class="an-head"><h2>${text('anTitle')}</h2>${cardControls}</div>${summary}<div class="an-grid">${cards}</div>${renderVsShortlist(squad, shortlist)}`;
  box.querySelector('.vs-controls').insertAdjacentHTML('afterbegin', renderVsTeamFilters());
  box.querySelectorAll('.an-team-filter').forEach(
    (input) =>
      (input.onchange = (e) => {
        const selected = analysisSelectedTeamGroups();
        if (e.target.checked) selected.add(e.target.dataset.vsTeam);
        else selected.delete(e.target.dataset.vsTeam);
        state.anTeamFilter = [...selected];
        try {
          localStorage.setItem('fmss_an_team_filter', JSON.stringify(state.anTeamFilter));
        } catch {}
        renderAnalysis();
      }),
  );
  box.querySelector('#an-prof-threshold').onchange = (e) => {
    state.anProfThreshold = Math.max(1, Math.min(20, Number(e.target.value) || 15));
    e.target.value = state.anProfThreshold;
    try {
      localStorage.setItem('fmss_an_prof_threshold', String(state.anProfThreshold));
    } catch {}
    renderAnalysis();
  };
  box.querySelectorAll('.an-player-table th[data-an-sort]').forEach(
    (th) =>
      (th.onclick = () => {
        const key = th.dataset.anSort,
          current = state.anCardSort || { key: 'ca', dir: -1 };
        state.anCardSort = {
          key,
          dir: current.key === key ? -current.dir : key === 'name' ? 1 : -1,
        };
        try {
          localStorage.setItem('fmss_an_card_sort', JSON.stringify(state.anCardSort));
        } catch {}
        renderAnalysis();
      }),
  );
  box.querySelectorAll('.vs-team-filter').forEach(
    (input) =>
      (input.onchange = (e) => {
        const selected = vsSelectedTeamGroups();
        if (e.target.checked) selected.add(e.target.dataset.vsTeam);
        else selected.delete(e.target.dataset.vsTeam);
        state.vsTeamFilter = [...selected];
        try {
          localStorage.setItem('fmss_vs_team_filter', JSON.stringify(state.vsTeamFilter));
        } catch {}
        renderAnalysis();
      }),
  );
  box.querySelector('#vs-prof-threshold').onchange = (e) => {
    state.vsProfThreshold = Math.max(1, Math.min(20, Number(e.target.value) || 15));
    try {
      localStorage.setItem('fmss_vs_prof_threshold', state.vsProfThreshold);
    } catch {}
    renderAnalysis();
  };
  box.querySelector('#vs-layout-toggle').onclick = () => {
    state.vsLayout = state.vsLayout === 'side' ? 'stack' : 'side';
    try {
      localStorage.setItem('fmss_vs_layout', state.vsLayout);
    } catch {}
    renderAnalysis();
  };
  box.querySelectorAll('.vs-count').forEach(
    (input) =>
      (input.onchange = (e) => {
        const target =
          e.target.dataset.vsKind === 'club' ? state.vsClubCounts : state.vsShortlistCounts;
        target[e.target.dataset.vsPos] = Math.max(0, Math.min(99, Number(e.target.value) || 0));
        try {
          localStorage.setItem(
            e.target.dataset.vsKind === 'club' ? 'fmss_vs_club_counts' : 'fmss_vs_shortlist_counts',
            JSON.stringify(target),
          );
        } catch {}
        renderAnalysis();
      }),
  );
  box.querySelectorAll('.vs-table th[data-vs-col]').forEach(
    (th) =>
      (th.onclick = () => {
        const id = th.closest('.vs-table')?.dataset.vsKind || 'club';
        const old = state.vsSorts[id] || state.vsSorts.shared;
        const current = old && typeof old === 'object' ? old : { key: 'meta', dir: -1 };
        state.vsSorts[id] = {
          key: th.dataset.vsCol,
          dir:
            current.key === th.dataset.vsCol
              ? -current.dir
              : ['name', 'pos', 'club', 'nat'].includes(th.dataset.vsCol)
                ? 1
                : -1,
        };
        try {
          localStorage.setItem('fmss_vs_sorts', JSON.stringify(state.vsSorts));
        } catch {}
        renderAnalysis();
      }),
  );
  box.querySelectorAll('.vs-table thead').forEach(
    (head) =>
      (head.oncontextmenu = (e) => {
        e.preventDefault();
        openVsColMenu(e.clientX, e.clientY);
      }),
  );
  box.querySelectorAll('.vs-col-resize').forEach(
    (grip) =>
      (grip.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const th = grip.closest('th'),
          key = th.dataset.vsCol,
          startX = e.clientX,
          startW = th.getBoundingClientRect().width;
        const move = (ev) => {
          state.vsColW[key] = Math.max(40, Math.round(startW + ev.clientX - startX));
          renderVsColumnWidth(key);
        };
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          try {
            localStorage.setItem('fmss_vs_colw', JSON.stringify(state.vsColW));
          } catch {}
          renderAnalysis();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      }),
  );
  box
    .querySelectorAll('.vs-col-resize')
    .forEach((grip) => (grip.onclick = (e) => e.stopPropagation()));
  box.querySelectorAll('[data-vs-player]').forEach(
    (row) =>
      (row.onclick = (e) => {
        const player = state.players.find((p) => String(p.id) === row.dataset.vsPlayer);
        if (player) showDetail(player);
      }),
  );
  box.querySelectorAll('[data-an-player]').forEach(
    (row) =>
      (row.onclick = () => {
        const player = state.players.find((p) => Number(p.id) === Number(row.dataset.anPlayer));
        if (player) showDetail(player);
      }),
  );
}

// Set the requested position and filters, then open the Players tab.
function scoutFor(s) {
  setMode('players');
  $('btn-clear').onclick(); // Start with a clean set of filters.
  activePos.clear();
  const codes = new Set(s.pos);
  document.querySelectorAll('.pos-node').forEach((n) => {
    if (codes.has(n.dataset.pos)) {
      activePos.add(n.dataset.pos);
      n.classList.add('on');
    }
  });
  if (s.minPa) $('f-pa-min').value = s.minPa;
  if (s.maxAge) $('f-age-max').value = s.maxAge;
  applyFilters();
  showToast([...codes].join(', '), 'search');
}
$('detail-close').onclick = closeDetail;
$('detail-backdrop').onclick = closeDetail;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
});

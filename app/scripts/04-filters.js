// ---------- filters ----------
const FILTER_RESULT_CACHE = new Map();

function filterResultStamp() {
  const controls = readFilterControls();
  return {
    rows: state.mode === 'staff' ? state.staff : state.players,
    players: state.players,
    staff: state.staff,
    history: state.hist,
    historyMap: state.hist?.map,
    preset: META_PRESET,
    meta: state.meta,
    signature: JSON.stringify({
      mode: state.mode,
      controls,
      positions: [...activePos].sort(),
      advRules: state.mode === 'staff' ? state.advStaffF : state.advF,
      shortlistVersion: analysisShortlistVersion,
      myTeam: state.myTeam,
      myPlayerTeamFilter: state.myPlayerTeamFilter,
      profThreshold: state.profThreshold,
      role: state.role,
      metaViewPos: state.metaViewPos,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      histPeriod: state.histPeriod,
      refYear: state.refYear,
      refDoy: state.refDoy,
      nowTs: state._nowTs,
      currency: state.cur,
      wagePer: state.wagePer,
      hideCapa: state.hideCapa,
      hideMeta: state.hideMeta,
      myClub: state.meta.myClub,
      myClubId: state.meta.myClubId,
      myClubRep: state.meta.myClubRep,
      playerCount: state.players.length,
      staffCount: state.staff.length,
      colCfg: state.colCfg,
    }),
  };
}

function sameFilterResultStamp(a, b) {
  return (
    a.rows === b.rows &&
    a.players === b.players &&
    a.staff === b.staff &&
    a.history === b.history &&
    a.historyMap === b.historyMap &&
    a.preset === b.preset &&
    a.meta === b.meta &&
    a.signature === b.signature
  );
}

function restoreFilterResultCache(mode) {
  const cached = FILTER_RESULT_CACHE.get(mode);
  if (!cached || !sameFilterResultStamp(cached.stamp, filterResultStamp())) return false;
  state.filtered = cached.rows;
  state.nativeTransferCandidates = cached.nativeCandidates || [];
  return true;
}

function saveFilterResultCache() {
  FILTER_RESULT_CACHE.set(state.mode, {
    stamp: filterResultStamp(),
    rows: state.filtered,
    nativeCandidates: state.nativeTransferCandidates,
  });
}

const parseMoney = (s) => {
  if (!s) return null;
  s = s.trim().toUpperCase().replace(',', '.');
  const m = s.match(/^([\d.]+)\s*(K|M|B)?/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (m[2] === 'K') v *= 1e3;
  else if (m[2] === 'M') v *= 1e6;
  else if (m[2] === 'B') v *= 1e9;
  v /= CUR_RATE[state.cur] || 1; // entry in chosen currency → internal GBP
  return isNaN(v) ? null : v;
};
// Contract dates repeat often, so cache parsed dates instead of allocating Date objects on every
// filter pass. The current game date is cached per dump and cleared by loadDump().
const _expTsCache = new Map();
function monthsUntil(expires) {
  if (!expires) return null;
  let ts = _expTsCache.get(expires);
  if (ts === undefined) {
    ts = +new Date(expires);
    _expTsCache.set(expires, ts);
  }
  if (isNaN(ts)) return null;
  return (ts - (state._nowTs ??= +gameNow())) / (1000 * 60 * 60 * 24 * 30.44);
}

function applyFilters() {
  if (state.mode === 'club-list') {
    renderClubList();
    $('chipbar').innerHTML = '';
    return;
  }
  let rows = state.mode === 'staff' ? state.staff : state.players;
  const name = foldSearchText($('f-name').value.trim());
  const ageMin = +$('f-age-min').value || 0,
    ageMax = +$('f-age-max').value || 99;
  const caMin = +$('f-ca-min').value || 0,
    caMax = +$('f-ca-max').value || 999;
  const paMin = +$('f-pa-min').value || 0,
    paMax = +$('f-pa-max').value || 999;
  const metaMin = +$('f-meta-min').value || 0,
    metaMax = +$('f-meta-max').value || 99;
  const mpMin = +$('f-metapa-min').value || 0,
    mpMax = +$('f-metapa-max').value || 99;
  // Meta-score only exists for players with attributes (staff and goalkeepers are excluded).
  const wantMeta = state.mode !== 'staff' && (metaMin > 0 || metaMax < 99);
  const wantMetaPa = state.mode !== 'staff' && !state.hideCapa && (mpMin > 0 || mpMax < 99);
  const price = parseMoney($('f-price').value);
  const fee = $('f-fee').disabled ? null : parseMoney($('f-fee').value);
  // Max. wage entry follows the selected display period; internally we compare weekly.
  const wageIn = parseMoney($('f-wage').value);
  const wage = wageIn == null ? null : wageIn / wageFactor();
  const nat = foldSearchText($('f-nat').value.trim());
  // Development: only active with history and visible CA (growth is CA-derived).
  const devOn = histReady() && !state.hideCapa && state.mode !== 'staff';
  const gMinRaw = $('f-growth-min').value,
    gMaxRaw = $('f-growth-max').value;
  const gMin = devOn && gMinRaw !== '' ? +gMinRaw : null;
  const gMax = devOn && gMaxRaw !== '' ? +gMaxRaw : null;
  const onlyNew = devOn && $('f-new').checked;
  const hMin = +$('f-height-min').value || 0,
    hMax = +$('f-height-max').value || 999;
  const footF = $('f-foot').value;
  // Wonderkids: staff has no PA growth, and without visible PA the filter is clogged.
  const onlyWk = state.mode !== 'staff' && !state.hideCapa && $('f-wonderkid').checked;
  const onlyEu = $('f-eu').checked,
    onlyMyClub = $('f-myclub').checked;
  const interestSelect = $('f-interest');
  const interestFilter = interestSelect.disabled || interestSelect.value === ''
    ? -1
    : Number(interestSelect.value);
  const tstatus = $('f-tstatus').value,
    contractF = $('f-contract').value;
  const onlySl = state.mode !== 'staff' && ($('f-shortlist').checked || state.mode === 'shortlist');
  const advRules = activeAdvRules();
  const nativeCandidates = [];
  const needsNativeFields = state.mode !== 'staff' && state.nativeTransfer?.available &&
    (price != null || fee != null || interestFilter >= 0);
  const sortsNativeFields = state.mode !== 'staff' && state.nativeTransfer?.available &&
    ['value', 'fee', 'interest'].includes(state.sortKey);
  const selectedPositions = activePos.size ? [...activePos] : null;
  const myPlayerTeams = state.mode === 'myplayer' ? myPlayerSelectedTeamGroups() : null;
  const staffRole = $('f-staffrole').value;
  const onlyRecruitableStaff = state.mode === 'staff' && $('f-staff-recruitable').checked;
  const gsel = $('f-gender').value; // '' = both, 'm' = men, 'v' = women
  const divVal = foldSearchText($('f-div').value.trim()); // substring search, case- and accent-insensitive
  const myClub = foldSearchText(state.meta.myClub || '');
  const myClubId = Number(state.meta.myClubId) || 0;
  if (state.mode === 'shortlist') rows = state.players;

  state.filtered = rows.filter((p) => {
    if (!p.name || !p.name.trim() || p.name.trim() === '?') return false; // hide nameless stubs
    if (onlySl && !state.shortlist.has(p.id)) return false;
    // Cache normalized search text per player so accent folding happens only once.
    // A ZERO character (\u0000) as a separator can never be used in the
    // search term, so the match semantics (name or club contains the term) is identical.
    if (
      name &&
      !(p._q ??= foldSearchText((p.name || '') + '\u0000' + (p.club || ''))).includes(name)
    )
      return false;
    const age = getAge(p);
    if (age < ageMin || age > ageMax) return false;
    if ((p.ca ?? 0) < caMin || (p.ca ?? 0) > caMax) return false;
    if ((p.pa ?? 0) < paMin || (p.pa ?? 0) > paMax) return false;
    if (wantMeta) {
      const s = metaScore(p);
      if (s == null || s < metaMin || s > metaMax) return false;
    }
    if (wantMetaPa) {
      const s = metaPaScore(p);
      if (s == null || s < mpMin || s > mpMax) return false;
    }
    if (wage != null && (p.wage ?? Infinity) > wage) return false;
    if (
      nat &&
      !(p._natQ ??= [
        ...(p.nat || []).flatMap((nation) => [nation, natLabel(nation)]),
        natsLabel(p),
      ].map(foldSearchText).join('\u0000')).includes(nat)
    )
      return false;
    if (onlyWk && !isWonderkid(p)) return false;
    if (onlyNew && !isNewSince(p)) return false;
    // Unknown growth (new, or too thin baseline) falls outside a set limit,
    // just like with height: otherwise "growth ≥ 10" would be full of new players.
    if (gMin != null || gMax != null) {
      const g = caGrowth(p);
      if (g == null || (gMin != null && g < gMin) || (gMax != null && g > gMax)) return false;
    }
    // Height/foot: unknown falls outside a set filter, just like with the attribute rules.
    if (hMin > 0 || hMax < 999) {
      const h = p.height || 0;
      if (h < hMin || h > hMax) return false;
    }
    if (footF && p.foot !== footF) return false;
    if (onlyEu && !isEu(p)) return false;
    // Include own players, players loaned out by My Club, and players loaned into My Club.
    // See loanStatus() for their colors.
    if (onlyMyClub) {
      const playerClubId = Number(p.clubId) || 0,
        ownerClubId = Number(p.ownerClubId) || 0;
      if (myClubId && (playerClubId || ownerClubId)) {
        if (playerClubId !== myClubId && ownerClubId !== myClubId) return false;
      } else {
        const cl = (p.club || '').toLowerCase(),
          ow = (p.ownerClub || '').toLowerCase();
        if (cl !== myClub && ow !== myClub) return false;
      }
    }
    // Team Chips (1st/2nd/Youth) — only active together with "My Club" and teamType data (plugin v0.1.10+).
    if (
      onlyMyClub &&
      state.myTeam !== 'all' &&
      state.mode !== 'staff' &&
      state.mode !== 'myplayer'
    ) {
      const tt = p.teamType;
      const playerClubId = Number(p.clubId) || 0;
      if (myClubId && playerClubId && playerClubId !== myClubId) return false;
      if (teamGroup(tt) !== state.myTeam) return false;
    }
    if (myPlayerTeams && !myPlayerTeams.has(teamGroup(p.teamType)))
      return false;
    if (contractF === 'free' && !isFree(p)) return false;
    if (contractF === 'exp6' || contractF === 'exp12') {
      const m = monthsUntil(p.expires);
      if (m == null || m > (contractF === 'exp6' ? 6 : 12)) return false;
    }
    // Match players listed for transfer, listed for loan (plugin v0.1.36+), or either status.
    if (tstatus === 'sale' && !p.listed) return false;
    if (tstatus === 'loan' && !p.loanListed) return false;
    if (tstatus === 'any' && !p.listed && !p.loanListed) return false;
    for (const r of advRules) {
      const av = advValue(p, r.k);
      if (av == null || av <= 0) return false; // unknown attribute counts as no match
      if (r.min && av < r.min) return false;
      if (r.max && av > r.max) return false;
    }
    if (selectedPositions) {
      const prof = p.posProficiency;
      const hasProfData = hasPositionProficiency(p);
      const pass = hasProfData
        ? selectedPositions.some((pos) => (prof[pos] ?? 0) >= state.profThreshold)
        : (p.posArr || []).some((x) => activePos.has(x)); // old dump fallback
      if (!pass) return false;
    }
    if (state.mode === 'staff' && staffRole && staffRoleKey(p) !== staffRole) return false;
    if (onlyRecruitableStaff && !isRecruitableStaff(p)) return false;
    if (gsel === 'm' && p.gender === 1) return false;
    if (gsel === 'v' && p.gender !== 1) return false;
    if (divVal && !(p._divisionQ ??= foldSearchText(playerDivisionLabel(p))).includes(divVal))
      return false;
    if ((needsNativeFields || sortsNativeFields) && !p.nativeTransferRead) {
      nativeCandidates.push(p);
      if (needsNativeFields) return false;
    }
    if (price != null && (fmValue(p).v ?? Infinity) > price) return false;
    if (fee != null && (fmAskingPrice(p).v ?? Infinity) > fee) return false;
    if (interestFilter >= 0 && gameInterestOrder(gameInterestLabel(p)) < interestFilter) return false;
    return true;
  });
  state.nativeTransferCandidates = nativeCandidates;
  sortRows();
  saveFilterResultCache();
  renderChips(buildChips());
  updateSecDots();
  persistFilterTab();
  // Only the rows; the column headings do not depend on filters. Callers who use the
  // If the view, hidden stats, or dump changes the column set, refresh it there.
  // renderTable() — a full header rebuild + remeasurement per keystroke was a waste.
  renderVisible();
}

// Mark section headers that contain active filters, including when those sections are collapsed.
function updateSecDots() {
  const val = (id) => {
    const e = $(id);
    return e ? e.value.trim() : '';
  };
  const on = {
    position: activePos.size > 0,
    role: !!$('f-role').value,
    staffrole:
      !!$('f-staffrole').value || (state.mode === 'staff' && $('f-staff-recruitable').checked),
    quality:
      [
        'f-age-min',
        'f-age-max',
        'f-ca-min',
        'f-ca-max',
        'f-pa-min',
        'f-pa-max',
        'f-meta-min',
        'f-meta-max',
        'f-metapa-min',
        'f-metapa-max',
      ].some((id) => val(id)) ||
      activeAdvRules().length > 0 ||
      (!state.hideCapa && $('f-wonderkid').checked),
    development:
      histReady() &&
      !state.hideCapa &&
      (['f-growth-min', 'f-growth-max'].some((id) => val(id)) || $('f-new').checked),
    physical: ['f-height-min', 'f-height-max'].some((id) => val(id)) || !!$('f-foot').value,
    financial:
      state.mode === 'staff'
        ? !!val('f-wage')
        : ['f-price', 'f-fee', 'f-wage'].some((id) => val(id)),
    origin: !!(val('f-nat') || $('f-eu').checked || val('f-div')),
    availability:
      (state.mode !== 'staff' &&
        ((!$('f-interest').disabled && $('f-interest').value !== '') ||
          !!$('f-tstatus').value || $('f-shortlist').checked)) ||
      !!$('f-contract').value ||
      $('f-myclub').checked,
  };
  document.querySelectorAll('.fsection[data-sec]').forEach((sec) => {
    const k = sec.dataset.sec;
    if (k in on) sec.classList.toggle('f-on', !!on[k]);
  });
}

// ---------- active filter chips ----------
const escHtml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
function buildChips() {
  const chips = [];
  const add = (label, clear) => chips.push({ label, clear });
  const clearInput = (id) => () => {
    $(id).value = '';
  };
  const uncheck = (id) => () => {
    $(id).checked = false;
    if (id === 'f-myclub' && state.mode === 'myplayer') setMode('players');
  };
  const range = (minId, maxId, label) => {
    const lo = $(minId).value,
      hi = $(maxId).value;
    if (lo || hi)
      add(`${label} ${lo || '…'}–${hi || '…'}`, () => {
        $(minId).value = '';
        $(maxId).value = '';
      });
  };
  const v = (id) => $(id).value.trim();

  if (v('f-name')) add(`${text('chipSearch')}: "${v('f-name')}"`, clearInput('f-name'));
  if (activePos.size)
    add(`${text('position')}: ${[...activePos].join(', ')}`, () => {
      activePos.clear();
      document.querySelectorAll('.pos-node').forEach((n) => n.classList.remove('on'));
    });
  if (state.mode === 'staff' && $('f-staffrole').value)
    add($('f-staffrole').value, () => {
      $('f-staffrole').value = '';
    });
  if ($('f-gender').value)
    add(text($('f-gender').value === 'm' ? 'dbMen' : 'dbWomen'), () => {
      $('f-gender').value = '';
    });
  if ($('f-div').value.trim())
    add(`${text('divLabel')}: ${$('f-div').value.trim()}`, () => {
      $('f-div').value = '';
    });
  range('f-age-min', 'f-age-max', text('age'));
  range('f-ca-min', 'f-ca-max', 'CA');
  range('f-pa-min', 'f-pa-max', 'PA');
  range('f-meta-min', 'f-meta-max', text('c_meta'));
  range('f-metapa-min', 'f-metapa-max', text('c_metapa'));
  if (!state.hideCapa && $('f-wonderkid').checked)
    add(text('wonderkidOnly'), uncheck('f-wonderkid'));
  if (histReady() && !state.hideCapa) {
    if ($('f-new').checked) add(text('onlyNew'), uncheck('f-new'));
    range('f-growth-min', 'f-growth-max', text('growthRange'));
  }
  range('f-height-min', 'f-height-max', text('heightCm'));
  if ($('f-foot').value)
    add(`${text('foot')}: ${$('f-foot').selectedOptions[0].textContent}`, () => {
      $('f-foot').value = '';
    });
  if (v('f-price')) add(`${text('maxvalue')} ${v('f-price')}`, clearInput('f-price'));
  if (v('f-fee')) add(`${text('maxfee')} ${v('f-fee')}`, clearInput('f-fee'));
  if (v('f-wage')) add(`${text('maxwage')} ${v('f-wage')}`, clearInput('f-wage'));
  if (v('f-nat')) add(`${text('nat')}: ${v('f-nat')}`, clearInput('f-nat'));
  if ($('f-eu').checked) add(text('euonly'), uncheck('f-eu'));
  if (!$('f-interest').disabled && $('f-interest').value !== '')
    add(`${text('interestmin')} ${$('f-interest').selectedOptions[0].textContent}`, () => {
      $('f-interest').value = '';
    });
  if ($('f-tstatus').value)
    add(`${text('tstatus')}: ${$('f-tstatus').selectedOptions[0].textContent}`, () => {
      $('f-tstatus').value = '';
    });
  if ($('f-contract').value)
    add(`${text('contractF')}: ${$('f-contract').selectedOptions[0].textContent}`, () => {
      $('f-contract').value = '';
    });
  for (const r of activeAdvRules())
    add(advChipTxt(r), () => {
      if (state.mode === 'staff') state.advStaffF = state.advStaffF.filter((x) => x !== r);
      else state.advF = state.advF.filter((x) => x !== r);
      saveAdv();
    });
  if ($('f-myclub').checked && state.mode !== 'myplayer') add(text('myclub'), uncheck('f-myclub'));
  if (state.mode === 'staff' && $('f-staff-recruitable').checked)
    add(text('staffRecruitableOnly'), () => {
      $('f-staff-recruitable').checked = false;
    });
  if ($('f-shortlist').checked && state.mode !== 'shortlist' && state.mode !== 'staff')
    add(text('onlyshortlist'), uncheck('f-shortlist'));
  return chips;
}
function renderChips(chips) {
  const bar = $('chipbar');
  const n = state.filtered.length.toLocaleString();
  bar.innerHTML =
    `<span class="chip-count"><b>${n}</b> ${text('results')}</span>` +
    chips
      .map(
        (c, i) =>
          `<button class="chip" data-i="${i}" title="${text('clear')}">${escHtml(c.label)}<span class="x">${icon('x', 10)}</span></button>`,
      )
      .join('') +
    (chips.length > 1 ? `<button class="chip-clear">${text('clearAll')}</button>` : '');
  bar.querySelectorAll('.chip').forEach(
    (el) =>
      (el.onclick = () => {
        chips[+el.dataset.i].clear();
        applyFilters();
      }),
  );
  const ca = bar.querySelector('.chip-clear');
  if (ca) ca.onclick = () => $('btn-clear').onclick();
}
// ---------- saved filter presets ----------
// A preset stores the filter fields, selected positions, and tactical role.
// Presets are saved in localStorage; saving with the same name overwrites the old preset.
const PRESET_TEXT_IDS = [
  'f-name',
  'f-age-min',
  'f-age-max',
  'f-ca-min',
  'f-ca-max',
  'f-pa-min',
  'f-pa-max',
  'f-meta-min',
  'f-meta-max',
  'f-metapa-min',
  'f-metapa-max',
  'f-growth-min',
  'f-growth-max',
  'f-height-min',
  'f-height-max',
  'f-price',
  'f-fee',
  'f-wage',
  'f-nat',
  'f-div',
];
const PRESET_CHECK_IDS = ['f-eu', 'f-myclub', 'f-shortlist', 'f-wonderkid', 'f-new'];
// Store the reference period with the preset so growth filters use the same date range when restored.
const PRESET_SELECT_IDS = [
  'f-interest',
  'f-interest-kind',
  'f-staffrole',
  'f-role',
  'f-contract',
  'f-tstatus',
  'f-foot',
  'f-hist-period',
  'f-gender',
];
function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem('fmss_presets') || '[]');
  } catch {
    return [];
  }
}
function storePresets(list) {
  localStorage.setItem('fmss_presets', JSON.stringify(list));
}
function snapshotFilters() {
  const s = { text: {}, check: {}, select: {}, pos: [...activePos] };
  for (const id of PRESET_TEXT_IDS) {
    const v = $(id).value.trim();
    if (v) s.text[id] = v;
  }
  for (const id of PRESET_CHECK_IDS) if ($(id).checked) s.check[id] = true;
  if (!$('f-staff-recruitable').checked) s.check['f-staff-recruitable'] = false;
  for (const id of PRESET_SELECT_IDS) {
    const v = $(id).value;
    if (v && v !== '0') s.select[id] = v;
  }
  const adv = state.advF.filter((r) => r.k && (r.min || r.max));
  if (adv.length) s.adv = adv.map((r) => ({ ...r }));
  const advStaff = (state.advStaffF || []).filter((r) => r.k && (r.min || r.max));
  if (advStaff.length) s.advStaff = advStaff.map((r) => ({ ...r }));
  return s;
}
// The history period always has a default value, so ignore it when checking whether a preset
// contains active filters. Otherwise every new preset would appear non-empty.
const presetIsEmpty = (s) =>
  !s.pos.length &&
  !Object.keys(s.text).length &&
  !Object.keys(s.check).length &&
  !Object.keys(s.select).some((k) => k !== 'f-hist-period') &&
  !(s.adv || []).length &&
  !(s.advStaff || []).length;
function applyPreset(s) {
  $('btn-clear').onclick(); // clean slate
  $('f-role').value = ''; // Use the role saved in this preset, not the previous selection.
  for (const [id, v] of Object.entries(s.text || {})) if ($(id)) $(id).value = v;
  for (const [id, value] of Object.entries(s.check || {}))
    if ($(id)) $(id).checked = value !== false;
  if (s.select?.['f-staffrole']) {
    const selectedRole = s.select['f-staffrole'];
    const oldRole = state.staff.find(
      (p) => p.job === selectedRole || currentJobLabel(p) === selectedRole,
    );
    if (oldRole) s.select['f-staffrole'] = staffRoleKey(oldRole);
  }
  for (const [id, v] of Object.entries(s.select || {})) if ($(id)) $(id).value = v;
  // Old presets (before contract status select) stored this as separate checkboxes.
  const oc = s.check || {};
  if (oc['f-free']) $('f-contract').value = 'free';
  else if (oc['f-exp6']) $('f-contract').value = 'exp6';
  else if (oc['f-exp12']) $('f-contract').value = 'exp12';
  // Same before the transfer status select (v1.2): transfer list checkbox → "for sale".
  if (oc['f-listed']) $('f-tstatus').value = 'sale';
  state.advF = (s.adv || []).map((r) => ({ ...r }));
  state.advStaffF = (s.advStaff || []).map((r) => ({ ...r }));
  saveAdv();
  const codes = new Set(s.pos || []);
  activePos.clear();
  document.querySelectorAll('.pos-node').forEach((n) => {
    const on = codes.has(n.dataset.pos);
    n.classList.toggle('on', on);
    if (on) activePos.add(n.dataset.pos);
  });
  // Apply the role and sorting behavior used by the normal role selector.
  state.role = $('f-role').value;
  localStorage.setItem('fmss_role', state.role);
  if (state.role) {
    state.sortKey = 'role';
    state.sortDir = -1;
  } else if (state.sortKey === 'role') {
    state.sortKey = 'ca';
    state.sortDir = -1;
  }
  // Load history for the selected period before applying growth filters.
  const per = (s.select || {})['f-hist-period'];
  if (per && HIST_PERIODS.includes(per) && per !== state.histPeriod && histReady()) {
    setHistPeriod(per).then(applyFilters);
    return;
  }
  applyFilters();
}
// Small in-app dialog in the style of the app (no system popups such as prompt/confirm).
// opts: { title, body?, input? (placeholder → shows input field), confirmLabel, danger?, onConfirm(value) }
function presetDialog(opts) {
  const m = $('preset-modal');
  m.innerHTML = `<div class="pm-card">
    <div class="pm-title">${opts.title}</div>
    ${opts.body ? `<div class="pm-body">${opts.body}</div>` : ''}
    ${opts.input != null ? `<input type="text" id="pm-input" maxlength="40" placeholder="${opts.input}">` : ''}
    <div class="pm-actions">
      <button class="pm-cancel">${text('cancelBtn')}</button>
      <button class="pm-ok${opts.danger ? ' danger' : ''}">${opts.confirmLabel}</button>
    </div>
  </div>`;
  m.classList.remove('hidden');
  const esc = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const close = () => {
    m.classList.add('hidden');
    document.removeEventListener('keydown', esc, true);
  };
  const ok = () => {
    const inp = $('pm-input');
    const v = inp ? inp.value.trim() : null;
    if (inp && !v) {
      inp.focus();
      return;
    } // Do nothing when the name is empty.
    close();
    opts.onConfirm(v);
  };
  document.addEventListener('keydown', esc, true); // capture: before global Esc handlers
  m.querySelector('.pm-cancel').onclick = close;
  m.querySelector('.pm-ok').onclick = ok;
  m.onclick = (e) => {
    if (e.target === m) close();
  };
  const inp = $('pm-input');
  if (inp) {
    inp.focus();
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') ok();
    };
  }
}
// Dropdown: button shows the last applied preset; the menu below has per preset
// a cross to remove (with confirmation). state.presetSel is just a label,
// the chips above the table remain the source of truth for what is active.
function closePresetMenu() {
  $('preset-dd-menu').classList.add('hidden');
  $('preset-dd-btn').classList.remove('open');
}
function renderPresets() {
  const btn = $('preset-dd-btn'),
    menu = $('preset-dd-menu'),
    label = $('preset-dd-label');
  const list = loadPresets();
  const has = list.length > 0;
  btn.disabled = !has;
  if (!has) {
    state.presetSel = null;
    closePresetMenu();
  }
  label.textContent = has ? state.presetSel || text('presetPick') : text('presetNone');
  menu.innerHTML = list
    .map(
      (p, i) =>
        `<div class="pd-item" data-i="${i}"><span class="pd-name">${escHtml(p.name)}</span><button class="pd-del" data-del="${i}" title="${text('deleteBtn')}">${icon('x', 11)}</button></div>`,
    )
    .join('');
  menu.querySelectorAll('.pd-item').forEach(
    (el) =>
      (el.onclick = (e) => {
        if (e.target.closest('.pd-del')) return; // cross has its own handler
        const p = loadPresets()[+el.dataset.i];
        closePresetMenu();
        if (p) {
          applyPreset(p.state); // erase everything first (also reset presetSel)
          state.presetSel = p.name;
          label.textContent = p.name;
          showToast(p.name, 'search');
        }
      }),
  );
  menu.querySelectorAll('.pd-del').forEach(
    (x) =>
      (x.onclick = (e) => {
        e.stopPropagation();
        const p = loadPresets()[+x.dataset.del];
        if (!p) return;
        presetDialog({
          title: text('presetDelTitle'),
          body: tf('presetDelConfirm', { name: escHtml(p.name) }),
          confirmLabel: text('deleteBtn'),
          danger: true,
          onConfirm: () => {
            const cur = loadPresets();
            const idx = cur.findIndex((q) => q.name === p.name);
            if (idx >= 0) {
              cur.splice(idx, 1);
              storePresets(cur);
            }
            if (state.presetSel === p.name) state.presetSel = null;
            renderPresets();
          },
        });
      }),
  );
}
$('preset-dd-btn').onclick = (e) => {
  e.stopPropagation();
  const m = $('preset-dd-menu');
  m.classList.toggle('hidden');
  $('preset-dd-btn').classList.toggle('open', !m.classList.contains('hidden'));
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('#preset-dd')) closePresetMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePresetMenu();
});
$('btn-preset-save').onclick = () => {
  const snap = snapshotFilters();
  if (presetIsEmpty(snap)) {
    showToast(text('presetEmptyFilters'));
    return;
  }
  presetDialog({
    title: text('presetSaveTitle'),
    input: text('presetNamePrompt'),
    confirmLabel: text('saveBtn'),
    onConfirm: (name) => {
      const list = loadPresets().filter((p) => p.name !== name); // same name = overwrite
      list.push({ name, state: snap });
      storePresets(list);
      state.presetSel = name;
      renderPresets();
      showToast(text('presetSaved'), 'check');
    },
  });
};

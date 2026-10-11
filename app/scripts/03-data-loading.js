// ---------- positions and pitch ----------
const PITCH = [
  ['GK', 50, 93],
  ['DR', 76, 78],
  ['DC', 50, 80],
  ['DL', 24, 78],
  ['WBR', 89, 64],
  ['WBL', 11, 64],
  ['DM', 50, 57],
  ['MR', 89, 42],
  ['MC', 50, 42],
  ['ML', 11, 42],
  ['AMR', 83, 24],
  ['AMC', 50, 24],
  ['AML', 17, 24],
  ['ST', 50, 9],
];
const activePos = new Set();
// Keep the sidebar filters independent for each table tab. The old shared sidebar let
// a search in Players silently carry over to Shortlist or My Player.
const FILTER_TAB_MODES = new Set(['players', 'staff', 'shortlist', 'myplayer']);
const FILTER_TAB_STORAGE_KEY = 'fmss_filter_tabs_v1';
let filterTabSnapshots = {};
try {
  const stored = JSON.parse(localStorage.getItem(FILTER_TAB_STORAGE_KEY) || '{}');
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) filterTabSnapshots = stored;
} catch {
  /* ignore a malformed saved filter set */
}
if (HIST_PERIODS.includes(state.histPeriod)) $('f-hist-period').value = state.histPeriod;
if ($('f-prof-threshold')) $('f-prof-threshold').value = state.profThreshold;
const FILTER_CONTROL_IDS = [...document.querySelectorAll('#filters [id^="f-"]')].map((el) => el.id);
const FILTER_CONTROL_DEFAULTS = Object.fromEntries(
  FILTER_CONTROL_IDS.map((id) => {
    const el = $(id);
    return [id, el.type === 'checkbox' ? { checked: el.checked } : { value: el.value }];
  }),
);
let filterTabPersistTimer = null,
  filterTabPersistencePending = false;
function readFilterControls() {
  const controls = {};
  for (const id of FILTER_CONTROL_IDS) {
    const el = $(id);
    controls[id] = el.type === 'checkbox' ? { checked: el.checked } : { value: el.value };
  }
  return controls;
}
function writeFilterControls(controls = FILTER_CONTROL_DEFAULTS) {
  for (const id of FILTER_CONTROL_IDS) {
    const el = $(id),
      saved = controls[id] || FILTER_CONTROL_DEFAULTS[id];
    if (el.type === 'checkbox') el.checked = !!saved?.checked;
    else if (saved && Object.hasOwn(saved, 'value')) el.value = saved.value ?? '';
  }
}
function persistFilterTab(mode = state.mode) {
  if (!FILTER_TAB_MODES.has(mode) || (!state.players.length && !state.staff.length)) return;
  const rules = mode === 'staff' ? state.advStaffF : state.advF;
  filterTabSnapshots[mode] = {
    controls: readFilterControls(),
    positions: [...activePos],
    profThreshold: state.profThreshold,
    myTeam: state.myTeam,
    adv: (rules || []).map((rule) => ({ ...rule })),
  };
  filterTabPersistencePending = true;
  clearTimeout(filterTabPersistTimer);
  filterTabPersistTimer = setTimeout(flushFilterTabPersistence, 250);
}
function flushFilterTabPersistence() {
  clearTimeout(filterTabPersistTimer);
  filterTabPersistTimer = null;
  if (!filterTabPersistencePending) return;
  filterTabPersistencePending = false;
  try {
    localStorage.setItem(FILTER_TAB_STORAGE_KEY, JSON.stringify(filterTabSnapshots));
  } catch {}
}
window.addEventListener('pagehide', flushFilterTabPersistence);
function restoreFilterTab(mode) {
  if (!FILTER_TAB_MODES.has(mode)) return;
  const snapshot = filterTabSnapshots[mode];
  const legacyRole = !snapshot && mode === 'players' ? state.role || '' : '';
  const legacyMetaViewPos = !snapshot && mode === 'players' ? state.metaViewPos : null;
  writeFilterControls(snapshot?.controls || FILTER_CONTROL_DEFAULTS);
  if (legacyRole) $('f-role').value = legacyRole;
  if (legacyMetaViewPos) $('f-meta-group').value = legacyMetaViewPos;
  activePos.clear();
  for (const pos of snapshot?.positions || []) activePos.add(pos);
  document
    .querySelectorAll('.pos-node')
    .forEach((node) => node.classList.toggle('on', activePos.has(node.dataset.pos)));
  state.profThreshold = Math.max(
    1,
    Math.min(20, parseInt(snapshot?.profThreshold ?? $('f-prof-threshold').value, 10) || 15),
  );
  $('f-prof-threshold').value = state.profThreshold;
  state.myTeam = snapshot?.myTeam || 'all';
  state.role = $('f-role').value || '';
  localStorage.setItem('fmss_role', state.role);
  state.metaViewPos = $('f-meta-group').value || null;
  localStorage.setItem('fmss_metaviewpos', state.metaViewPos || '');
  const historyPeriod = $('f-hist-period').value;
  if (HIST_PERIODS.includes(historyPeriod)) state.histPeriod = historyPeriod;
  if (snapshot && Array.isArray(snapshot.adv)) {
    if (mode === 'staff') state.advStaffF = snapshot.adv.map((rule) => ({ ...rule }));
    else state.advF = snapshot.adv.map((rule) => ({ ...rule }));
  } else if (mode === 'shortlist' || mode === 'myplayer') {
    state.advF = [];
  }
  updateAdvBtn();
}
function buildPitch() {
  const nodes = PITCH.map(
    ([pos, x, y]) =>
      `<g class="pos-node" data-pos="${pos}" transform="translate(${x},${y})">
       <circle r="7.5"></circle><text>${pos}</text></g>`,
  ).join('');
  $('pitch-wrap').innerHTML = `<svg viewBox="0 0 100 104" xmlns="http://www.w3.org/2000/svg">
       <rect x="1" y="1" width="98" height="102" rx="3" fill="#12301c" stroke="#2a3441"/>
       <line x1="1" y1="52" x2="99" y2="52" stroke="#2a4a34"/>
       <circle cx="50" cy="52" r="10" fill="none" stroke="#2a4a34"/>
       <rect x="30" y="1" width="40" height="14" fill="none" stroke="#2a4a34"/>
       <rect x="30" y="89" width="40" height="14" fill="none" stroke="#2a4a34"/>
       ${nodes}
     </svg>`;
  $('pitch-wrap')
    .querySelectorAll('.pos-node')
    .forEach((n) => {
      n.onclick = () => {
        const pos = n.dataset.pos;
        if (activePos.has(pos)) {
          activePos.delete(pos);
          n.classList.remove('on');
        } else {
          activePos.add(pos);
          n.classList.add('on');
        }
        applyFilters();
      };
    });
  const thr = $('f-prof-threshold');
  if (thr) {
    thr.value = state.profThreshold;
    thr.oninput = () => {
      const v = Math.max(1, Math.min(20, parseInt(thr.value, 10) || 1));
      state.profThreshold = v;
      localStorage.setItem('fmss_profthreshold', v);
      persistFilterTab();
      if (activePos.size) applyFilters();
    };
  }
}

// ---------- load data ----------
// Parse meta, player, staff, and club objects incrementally from the dump stream.
// Large saves can exceed the size limits for a single JavaScript string or JSON.parse().
// The parser relies on these top-level sections appearing in the expected dump structure.
// Intern repeated strings such as club, division, and date values to reduce peak memory use.
const INTERN_KEYS = ['club', 'ownerClub', 'div', 'pos', 'foot', 'expires', 'dob', 'job'];
function internStrings(obj, pool) {
  for (const k of INTERN_KEYS) {
    const v = obj[k];
    if (typeof v === 'string') {
      const c = pool.get(v);
      if (c !== undefined) obj[k] = c;
      else pool.set(v, v);
    }
  }
  for (const arrK of ['nat', 'posArr']) {
    const a = obj[arrK];
    if (a)
      for (let i = 0; i < a.length; i++) {
        const c = pool.get(a[i]);
        if (c !== undefined) a[i] = c;
        else pool.set(a[i], a[i]);
      }
  }
}

async function parseDumpStream(resp, total, onProgress) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  const data = { meta: {}, players: [], staff: [], clubs: [] };
  const pool = new Map();
  let buf = '',
    pos = 0; // unprocessed tail + scan position in it
  let depth = 0,
    inStr = false,
    esc = false;
  let key = '',
    keyStart = -1; // top-level key (at depth 1)
  let curKey = null; // active section: meta | players | staff | clubs
  let elemStart = -1,
    elemDepth = 0;
  let got = 0;
  let lastYield = performance.now();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    onProgress(got);
    buf += dec.decode(value, { stream: true });
    for (; pos < buf.length; pos++) {
      const c = buf.charCodeAt(pos);
      if (inStr) {
        if (esc) esc = false;
        else if (c === 92)
          esc = true; // \
        else if (c === 34) {
          // closing "
          inStr = false;
          if (keyStart >= 0) {
            key = buf.slice(keyStart, pos);
            keyStart = -1;
          }
        }
      } else if (c === 34) {
        // opening "
        inStr = true;
        if (depth === 1 && elemStart < 0) keyStart = pos + 1;
      } else if (c === 58) {
        // :
        if (depth === 1 && key) {
          curKey = key;
          key = '';
        }
      } else if (c === 123 || c === 91) {
        // { or [
        depth++;
        if (
          elemStart < 0 &&
          c === 123 &&
          ((curKey === 'meta' && depth === 2) ||
            ((curKey === 'players' || curKey === 'staff' || curKey === 'clubs') && depth === 3))
        ) {
          elemStart = pos;
          elemDepth = depth;
        }
      } else if (c === 125 || c === 93) {
        // } or ]
        if (elemStart >= 0 && depth === elemDepth) {
          const obj = JSON.parse(buf.slice(elemStart, pos + 1));
          if (curKey === 'meta') data.meta = obj;
          else if (curKey === 'clubs') {
            for (const k of ['name', 'shortName', 'nation', 'div']) {
              const value = obj[k];
              if (typeof value === 'string') {
                const canonical = pool.get(value);
                if (canonical !== undefined) obj[k] = canonical;
                else pool.set(value, value);
              }
            }
            data.clubs.push(obj);
          } else {
            internStrings(obj, pool);
            data[curKey].push(obj);
          }
          elemStart = -1;
        }
        depth--;
      }
    }
    // Discard processed bytes while retaining any incomplete value for the next chunk.
    const cut = Math.min(
      elemStart >= 0 ? elemStart : buf.length,
      keyStart >= 0 ? keyStart - 1 : buf.length,
      pos,
    );
    if (cut > 0) {
      buf = buf.slice(cut);
      pos -= cut;
      if (elemStart >= 0) elemStart -= cut;
      if (keyStart >= 0) keyStart -= cut;
    }
    // Yield periodically so the UI can paint progress and handle input while parsing.
    if (performance.now() - lastYield >= 25) {
      await new Promise((r) => setTimeout(r, 0));
      lastYield = performance.now();
    }
  }
  // A complete dump has data and a closed outer object. Reject truncated or partially written files.
  data._complete = depth === 0 && !inStr && got > 0;
  return data;
}

// Last retrieved /api/status (for the problem report: dump size on disk) and
// the last loading error, if there is a dump but it could not be read.
let lastStatus = null;
let loadError = null;

// A shortlist may contain a real player which is currently clubless. FM also keeps
// not-yet-created newgens in memory; those records are filtered from the normal list
// below, but must remain available when a saved shortlist explicitly refers to them.
function normalizeShortlistIds(values) {
  return new Set(
    (Array.isArray(values) ? values : [...(values || [])])
      .map(Number)
      .filter(Number.isSafeInteger)
      .filter((id) => id > 0 && id <= 0xffffffff),
  );
}

function restoreShortlistPlayers(ids) {
  const wanted = ids instanceof Set ? ids : normalizeShortlistIds(ids);
  const visible = new Set(state.players.map((p) => Number(p.id)));
  for (const p of state.allPlayers) {
    const id = Number(p.id);
    if (wanted.has(id) && !visible.has(id)) {
      state.players.push(p);
      visible.add(id);
    }
  }
}

async function loadDump(force = false) {
  let st = null;
  try {
    st = await (await fetch('/api/status')).json();
    lastStatus = st;
    if (!st.hasDump) {
      $('dump-info').textContent = '';
      loadError = null;
      renderEmptyState();
      return false;
    }
    // Set a marker before parsing and clear it after success or a handled failure.
    // If it remains on the next attempt, the previous parse likely crashed the tab (for example, OOM).
    // Show a recovery hint instead of retrying blindly; the Retry button can force another load.
    if (!force && localStorage.getItem('fmss_loadmark')) {
      localStorage.removeItem('fmss_loadmark');
      loadError = { msg: text('esErrCrash'), size: st.dumpSize, crash: true };
      $('empty-state').classList.remove('hidden');
      renderEmptyState();
      return false;
    }
    localStorage.setItem('fmss_loadmark', '1');
    const b = $('banner');
    b.className = 'scanning';
    b.innerHTML = bannerMsg('hourglass', text('loading'));
    b.onclick = null;
    // Streaming download and parsing, with real progress (bytes / Content-Length).
    const resp = await fetch('/api/dump');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const total = Number(resp.headers.get('Content-Length')) || 0;
    let data;
    if (resp.body && total > 0) {
      let lastUi = 0;
      data = await parseDumpStream(resp, total, (got) => {
        const now = performance.now();
        if (now - lastUi > 100) {
          // Refresh UI at most 10×/s
          lastUi = now;
          const mb = `${text('loading')} ${(got / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`;
          b.innerHTML = bannerProgress('hourglass', mb, got / total);
        }
      });
    } else {
      data = await resp.json();
      data._complete = true; // JSON.parse itself already throws at a truncated file
    }
    // Reject incomplete dumps instead of silently loading a partial player list.
    // The "generated" field exists in every metablock. "pluginVersion" is present from plugin
    // 0.1.34 onward; older plugins show a version warning instead of an incomplete-dump error.
    if (!data._complete || !data.meta || !data.meta.generated)
      throw new Error(text('dumpIncomplete'));
    b.className = 'hidden';
    // Remove ghost records. FM creates them in memory, including during youth intake, before
    // they exist in the game world. They have no club and use the 0xFFFF reputation sentinel.
    // They cannot be found in the game; real clubless players still have a reputation value.
    // Keep the raw player array as a lookup pool. The normal list still excludes FMs
    // pre-generated ghost players, except when a saved shortlist explicitly contains
    // their ID; otherwise a valid three-player shortlist could appear as only two.
    state.allPlayers = Array.isArray(data.players) ? data.players : [];
    const savedShortlistIds = normalizeShortlistIds([
      ...state.shortlist,
      ...(Array.isArray(data.meta?.gameShortlist) ? data.meta.gameShortlist : []),
    ]);
    state.players = state.allPlayers.filter(
      (p) => p.club || p.worldRep !== 0xffff || savedShortlistIds.has(Number(p.id)),
    );
    const seniorSquadCounts = new Map();
    for (const p of state.allPlayers)
      if (p.clubId && p.teamType === 0) {
        const id = Number(p.clubId);
        seniorSquadCounts.set(id, (seniorSquadCounts.get(id) || 0) + 1);
      }
    // The reader emits each player UID once, so counts need no per-club ID sets.
    state._clubSeniorSquadCounts = seniorSquadCounts;
    state.staff = data.staff || [];
    FILTER_RESULT_CACHE.clear();
    if (state.players.length) {
      const knownPlayerIds = new Set(state.players.map((p) => Number(p.id)));
      const playerShortlist = new Set(
        [...state.shortlist].map(Number).filter((id) => knownPlayerIds.has(id)),
      );
      if (playerShortlist.size !== state.shortlist.size) {
        state.shortlist = playerShortlist;
        localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
        $('sl-count').textContent = state.shortlist.size;
      }
    }
    state.clubs = data.clubs || [];
    state.meta = data.meta || {};
    // FM's current visible player/search result is authoritative when the plugin found it.
    // This imports thousands of in-game Interested results without selecting rows first.
    if (state.meta.gameShortlistFound && Array.isArray(state.meta.gameShortlist)) {
      const known = new Set(state.players.map((p) => Number(p.id)));
      // JSON from older/newer plugin builds may contain numeric IDs as strings.
      // Normalize before matching so a valid filtered game result is never dropped.
      state.shortlist = normalizeShortlistIds(state.meta.gameShortlist);
      state.shortlist = new Set([...state.shortlist].filter((id) => known.has(id)));
      localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
      $('sl-count').textContent = state.shortlist.size;
      showToast(`${state.shortlist.size} ← FM24`, 'check');
      $('shortlist-sync-status').textContent = tf('syncfound', {
        n: state.shortlist.size,
      });
    } else {
      $('shortlist-sync-status').textContent = text('syncmissing');
    }
    state._wageCeil = undefined; // recalculate wage cap for this dump
    state._clubWages = null; // rebuild wage rank cache (ask price).
    state._nowTs = undefined; // "now" time follows the new in-game date (monthsUntil)
    _expTsCache.clear(); // contract date → clear timestamp cache
    // Per-player caches (_meta/_ev/_fee/_int/_q) are tied to the parsed objects, so replacing the
    // player array releases them. Derive the reference year from the in-game date.
    if (state.meta.gameDate) {
      const g = parseGameDate(state.meta.gameDate);
      state.refYear = state.meta.gameYear || g.getFullYear();
      state.refDoy = Math.floor((g - new Date(g.getFullYear(), 0, 0)) / 864e5);
    } else if (state.meta.gameYear) {
      state.refYear = state.meta.gameYear;
    }
    state.dumpStamp = st.dumpTime;
    localStorage.removeItem('fmss_loadmark'); // loaded: no crash
    renderDumpInfo();
    renderClubBadge();
    renderVerWarn();
    renderMyTeamChips();
    loadError = null;
    renderEmptyState();
    $('empty-state').classList.add('hidden');
    buildStaffRoles();
    buildFootOptions();
    buildDivisions(); // Fill division filter as soon as there is dump data with divisions
    restoreFilterTab(state.mode);
    buildGenderFilter();
    renderMyTeamChips();
    renderTable(); // A new dump can change the available columns, such as the growth column.
    applyFilters();
    // Load history after the first render so the player list appears immediately.
    // Save this dump's snapshot before loading history; otherwise the latest date and
    // "new since" results would be missing.
    setTimeout(
      () =>
        postHistorySnapshot()
          .then(loadHistDeltas)
          .then(() => {
            renderDevSection();
            if (histReady()) {
              renderTable();
              applyFilters();
              renderIntakeBar();
            }
          }),
      100,
    );
    // Show the seasonal report before considering the Ko-fi prompt so both do not appear together.
    const loads = (+localStorage.getItem('fmss_loads') || 0) + 1;
    localStorage.setItem('fmss_loads', String(loads));
    maybeSeasonReport();
    if (loads >= 3) coffeeGlow();
    return true;
  } catch (e) {
    console.error('loadDump:', e);
    localStorage.removeItem('fmss_loadmark'); // Clear the marker after a handled error.
    $('dump-info').textContent = '!';
    // If a dump exists but could not be read, show the error instead of leaving the setup screen
    // visible with misleading instructions.
    if (st && st.hasDump) {
      loadError = { msg: String((e && e.message) || e), size: st.dumpSize };
      const b = $('banner');
      b.className = 'scanning error';
      b.onclick = null;
      b.innerHTML = bannerMsg('warning', text('esErrTitle'));
      $('empty-state').classList.remove('hidden');
    }
    renderEmptyState();
    return false;
  }
}

// ---------- development history ----------
// After each loaded dump, sends a compact snapshot (id → [ca, pa, value]) to the
// server, which stores delta-only (see server.js). Best effort and outside the loading path;
// only once per dump (reloading the same dump does not save anything twice).
let historySnapshotInFlight = null;
let dataClearInProgress = false;
async function postHistorySnapshot() {
  try {
    if (dataClearInProgress) return;
    const gd = state.meta.gameDate;
    if (!gd || !state.players.length) return;
    if (localStorage.getItem('fmss_hist_at') === String(state.dumpStamp)) return;
    const compact = {};
    for (const p of state.players) compact[p.id] = [p.ca ?? 0, p.pa ?? 0, p.value ?? null];
    const request = fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manager: state.meta.manager || 'default',
        gameDate: gd,
        players: compact,
      }),
    });
    historySnapshotInFlight = request;
    const r = await request;
    if (r.ok) localStorage.setItem('fmss_hist_at', String(state.dumpStamp));
  } catch {
    /* history is nice-to-have, never disturb loading */
  } finally {
    historySnapshotInFlight = null;
  }
}

// Show setup steps when no dump exists, or an error with its cause, file size, and recovery actions
// when a dump cannot be read. This avoids leaving users with an unexplained blank screen.
// On the first FM launch, BepInEx builds its interop map for 1–3 minutes in a console window.
// Until that setup is complete, New data cannot start a scan, so show the setup instructions.
let setupState = null;
function checkSetupState() {
  fetch('/api/setup')
    .then((r) => r.json())
    .then((s) => {
      setupState = s;
      renderEmptyState();
    })
    .catch(() => {});
}
function renderEmptyState() {
  const normal = $('es-normal'),
    errBox = $('es-error'),
    setupBox = $('es-setup');
  if (!errBox) return;
  const needsFirstRun =
    !loadError &&
    setupState &&
    setupState.known &&
    setupState.pluginInstalled &&
    !setupState.interopReady;
  if (setupBox) {
    setupBox.classList.toggle('hidden', !needsFirstRun);
    if (needsFirstRun)
      setupBox.innerHTML =
        `<h2>${escHtml(text('esSetupTitle'))}</h2><p>${escHtml(text('esSetupBody'))}</p>` +
        `<p class="es-setup-hint">${escHtml(text('esSetupHint'))}</p>`;
  }
  if (!loadError) {
    errBox.classList.add('hidden');
    if (normal) normal.classList.toggle('hidden', needsFirstRun);
    return;
  }
  if (normal) normal.classList.add('hidden');
  if (setupBox) setupBox.classList.add('hidden');
  const sizeLine = loadError.size
    ? `<p class="es-err-size">${tf('esErrSize', { mb: (loadError.size / 1048576).toFixed(0) })}</p>`
    : '';
  // Crash (tab-OOM): the message is the explanation + tip; there is no technical error detail.
  errBox.innerHTML =
    `<h2>${escHtml(text('esErrTitle'))}</h2>` +
    `<p class="es-err-msg">${escHtml(loadError.crash ? loadError.msg : text('esErrBig'))}</p>` +
    sizeLine +
    (loadError.crash ? '' : `<pre class="es-err-detail">${escHtml(loadError.msg)}</pre>`) +
    `<div class="es-help">` +
    `<button id="es-err-reload">${escHtml(text('esErrReload'))}</button>` +
    `<button id="es-err-fetch">${escHtml(text('fetch'))}</button>` +
    `<button id="es-err-report">${escHtml(text('reportBug'))}</button>` +
    `</div>`;
  errBox.classList.remove('hidden');
  $('es-err-reload').onclick = () => loadDump(true); // Force another attempt past the crash detector.
  // Request a fresh dump through the New data button path, including its FM-running check and timeout.
  $('es-err-fetch').onclick = () => $('btn-fetch').onclick();
  $('es-err-report').onclick = reportBug;
}
function renderDumpInfo() {
  const gd = $('game-date');
  if (!state.dumpStamp) {
    $('dump-info').textContent = '';
    if (gd) gd.textContent = '';
    return;
  }
  const when = new Date(state.dumpStamp);
  const n = state.players.length.toLocaleString();
  $('dump-info').textContent = n;
  $('dump-info').title =
    `${state.players.length.toLocaleString()} ${text('playersWord')} · ${state.staff.length.toLocaleString()} ${text('staffWord')}\n${when.toLocaleString()}`;
  // Exact in-game dates come from memory; derived dates use a tilde and tooltip because the day is approximate.
  if (gd) {
    const ds = state.meta.gameDate;
    if (!ds) {
      gd.innerHTML = '';
      gd.title = '';
    } else {
      const derived = state.meta.gameDateSource !== 'memory';
      const d = new Date(ds);
      const txt = isNaN(d)
        ? ds
        : d.toLocaleDateString(FORMAT_LOCALE, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
      gd.innerHTML = icon('calendar', 12) + ' ' + escHtml((derived ? '~ ' : '') + txt);
      gd.title = derived ? text('gameDateDerived') : text('gameDateMemory');
    }
  }
}
// Warn when the dump uses a different FM version than the supported memory offsets, since values
// may be incorrect. Also warn for dumps from plugins older than 0.1.34, which lack pluginVersion.
// They can still load, but users should scan again with a current plugin.
function renderVerWarn() {
  const el = $('ver-warn');
  const m = state.meta;
  if (m.gameVersion && m.versionOk === false) {
    el.innerHTML = bannerMsg(
      'warning',
      tf('verWarn', { v: m.gameVersion, s: m.supportedVersion || '26.3' }),
    );
    el.classList.remove('hidden');
  } else if (m.generated && !m.pluginVersion) {
    el.innerHTML = bannerMsg('warning', text('verWarnOldDump'));
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}
function renderClubBadge() {
  const mgr = state.meta.manager,
    club = state.meta.myClub,
    rep = state.meta.myClubRep;
  // Always escape FM data (memory names) before innerHTML.
  $('club-badge').innerHTML =
    mgr || club ? `${mgr ? escHtml(mgr) + ' · ' : ''}<b>${escHtml(club || '?')}</b>` : '';
  $('club-badge').title = text('clickClubFilter') + (rep ? ` · ${text('repWord')} ${rep}` : '');
}
function buildStaffRoles() {
  const cur = $('f-staffrole').value;
  const byJob = new Map();
  for (const s of state.staff) {
    const key = staffRoleKey(s);
    if (key && !byJob.has(key)) byJob.set(key, s);
  }
  const items = [...byJob]
    .map(([v, s]) => ({ v, l: jobLabel(s) }))
    .sort((a, b) => a.l.localeCompare(b.l, FORMAT_LOCALE));
  $('f-staffrole').innerHTML =
    `<option value="">${text('all')}</option>` +
    items.map((x) => `<option value="${escHtml(x.v)}">${escHtml(x.l)}</option>`).join('');
  const oldRole = state.staff.find((s) => s.job === cur);
  $('f-staffrole').value = items.some((x) => x.v === cur)
    ? cur
    : oldRole
      ? staffRoleKey(oldRole)
      : '';
}
// Show the gender filter only when both men and women are present.
// Single-gender databases do not need this control.
function buildGenderFilter() {
  const rows = state.mode === 'staff' ? state.staff : state.players;
  let men = false,
    women = false;
  for (const p of rows) {
    if (p.gender === 1) women = true;
    else men = true;
    if (men && women) break;
  }
  const mixed = men && women;
  $('fg-gender').style.display = mixed ? '' : 'none';
  if (!mixed && $('f-gender').value) {
    $('f-gender').value = '';
  }
}

// The plugin stores foot values as shown in the game.
// Build options from observed values and map known Dutch labels to English.
const FOOT_ORDER = { footR: 0, footL: 1, footB: 2 };
function buildFootOptions() {
  const cur = $('f-foot').value;
  const vals = [...new Set(state.players.map((p) => p.foot).filter(Boolean))].sort(
    (a, b) =>
      (FOOT_ORDER[FOOT_KEY[a.toLowerCase()]] ?? 9) - (FOOT_ORDER[FOOT_KEY[b.toLowerCase()]] ?? 9),
  );
  $('f-foot').innerHTML =
    `<option value="">${text('all')}</option>` +
    vals
      .map((v) => `<option value="${escHtml(v)}">${escHtml(footLabel({ foot: v }))}</option>`)
      .join('');
  $('f-foot').value = vals.includes(cur) ? cur : '';
}
// FM reuses competition names across countries (e.g. Premier League in England and Egypt).
// Keep the club's nation in the division identity so those competitions cannot be merged.
let clubCatalogSource = null;
let clubCatalogCache = null;
function clubCatalogById() {
  const clubs = state.clubs || [];
  // Division labels are used inside per-player filtering and sorting. Rebuilding this
  // map for every player made a division search O(players × clubs), freezing large saves.
  if (clubs === clubCatalogSource && clubCatalogCache) return clubCatalogCache;
  clubCatalogSource = clubs;
  clubCatalogCache = new Map(clubs.filter((c) => Number(c.id) > 0).map((c) => [Number(c.id), c]));
  return clubCatalogCache;
}
function divisionInfo(name, nation, id) {
  const raw = (name || '').trim();
  const country = (nation || '').trim();
  if (!raw) return null;
  const divisionId = Number(id) > 0 ? Number(id) : 0;
  return {
    raw,
    nation: country,
    divisionId,
    key: divisionId ? `id:${divisionId}` : `${normStr(country)}\u0000${normStr(raw)}`,
    label: country ? `${raw} (${country})` : raw,
  };
}
function playerDivisionInfo(p, clubsById = clubCatalogById()) {
  const club = Number(p.clubId) > 0 ? clubsById.get(Number(p.clubId)) : null;
  return divisionInfo(p.div, club?.nation, p.divisionId || club?.divisionId);
}
function playerDivisionLabel(p) {
  if (p._divisionLabel === undefined)
    p._divisionLabel = playerDivisionInfo(p)?.label || p.div || '';
  return p._divisionLabel;
}
// Division suggestions use the divisions supplied by the FM24 reader and rank them by
// the strongest club reputation in each division. Normalize names for tolerant searching.
function buildDivisions() {
  const byDiv = new Map();
  const clubsById = clubCatalogById();
  const seniorPlayers = state.players.filter((p) => p.teamType == null || p.teamType === 0);
  const activeClubIds = new Set(
    seniorPlayers.map((p) => Number(p.clubId) || 0).filter((id) => id > 0),
  );
  const add = (info, rep, amount = 1) => {
    if (!info) return;
    let d = byDiv.get(info.key);
    if (!d) byDiv.set(info.key, (d = { ...info, reputation: 0, count: 0 }));
    d.count += amount;
    d.reputation = Math.max(d.reputation, rep || 0);
  };
  for (const c of state.clubs || [])
    if (c.div && (!activeClubIds.size || activeClubIds.has(Number(c.id))))
      add(divisionInfo(c.div, c.nation, c.divisionId), +c.reputation || 0);
  for (const p of seniorPlayers) {
    add(playerDivisionInfo(p, clubsById), +p.clubRep || 0);
  }
  // FM24 does not expose a verified competition-reputation field here, so use the highest
  // club reputation in each division. The managed club's divisions receive a small tie-break.
  const myClub = (state.meta.myClub || '').toLowerCase();
  const myClubId = Number(state.meta.myClubId) || 0;
  state.myDivs = new Set([
    ...(state.clubs || [])
      .filter(
        (c) =>
          c.div &&
          (!activeClubIds.size || activeClubIds.has(Number(c.id))) &&
          (myClubId ? Number(c.id) === myClubId : normStr(c.name) === normStr(myClub)),
      )
      .map((c) => divisionInfo(c.div, c.nation, c.divisionId)?.label)
      .filter(Boolean),
    ...seniorPlayers
      .filter(
        (p) =>
          p.div && (myClubId ? Number(p.clubId) === myClubId : normStr(p.club) === normStr(myClub)),
      )
      .map((p) => playerDivisionInfo(p, clubsById)?.label)
      .filter(Boolean),
  ]);
  state.divIndex = [...byDiv.entries()]
    .map(([, d]) => ({
      ...d,
      name: d.label,
      norm: normStr(d.label),
      queryNorm: normStr(d.raw),
      strength: d.reputation,
      mine: state.myDivs.has(d.label),
    }))
    .sort(
      (a, b) =>
        b.strength - a.strength ||
        b.count - a.count ||
        a.label.localeCompare(b.label, FORMAT_LOCALE),
    );
  const wrap = $('fg-div');
  wrap.style.display = state.divIndex.length ? '' : 'none';
}
// Fold accents for text matching while preserving punctuation and non-Latin letters.
function foldSearchText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
// Normalize fuzzy-search text: lowercase it, remove diacritics, and keep letters, numbers, and spaces.
function normStr(s) {
  return foldSearchText(s)
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// Calculate Levenshtein distance with an early cutoff for word-level typo tolerance.
function editDist(a, b, max) {
  const m = a.length,
    n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let cur = [i],
      best = i;
    for (let j = 1; j <= n; j++) {
      const c =
        a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
      cur[j] = c;
      if (c < best) best = c;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[n];
}
// Rank league suggestions by match quality, league strength, and whether the league is the user's own.
function scoreDiv(entry, q) {
  // Strength breaks ties within a match class, while a bonus favors the current competition.
  const name = entry.norm,
    str = Math.min(300, entry.strength / 40) + (entry.active ? 800 : 0) + (entry.mine ? 400 : 0);
  if (!q) return str; // With an empty query, rank by league strength alone.
  // Class 1: a substring match outranks weaker matches; position breaks ties within the class.
  const idx = name.indexOf(q);
  if (idx >= 0) return 3000 + str - Math.min(450, idx * 15);
  // Class 2: a word starts with the query, allowing a small typo.
  let hit = false;
  const tolerance = q.length >= 6 ? 2 : q.length >= 4 ? 1 : 0;
  const words = (entry._words ??= name.split(' '));
  for (const w of words) {
    if (w.startsWith(q)) {
      hit = true;
      break;
    }
    if (tolerance && editDist(q, w.slice(0, q.length + tolerance), tolerance) <= tolerance) {
      hit = true;
      break;
    }
  }
  if (hit) return 2000 + str;
  // Class 3: use an ordered subsequence as a last resort.
  let i = 0;
  for (const c of name) if (c === q[i]) i++;
  return i === q.length ? 1000 + str : -1;
}
function renderCompetitionSuggest(inputId, boxId, entries, selection) {
  const input = $(inputId),
    box = $(boxId);
  if (!input || !box) return;
  const q = normStr(input.value);
  const idx = entries || [];
  const ranked = [];
  for (const e of idx) {
    const score = scoreDiv(e, q);
    if (!(score >= 0)) continue;
    let low = 0,
      high = ranked.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (score > ranked[middle].s) high = middle;
      else low = middle + 1;
    }
    if (low < 8) {
      ranked.splice(low, 0, { e, s: score });
      if (ranked.length > 8) ranked.pop();
    }
  }
  if (!ranked.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = ranked
    .map(
      (x, i) =>
        `<div class="ds-item" data-v="${escHtml(x.e.name)}" data-i="${i}">${escHtml(x.e.name)}</div>`,
    )
    .join('');
  box.classList.remove('hidden');
  box.querySelectorAll('.ds-item').forEach(
    (el) =>
      (el.onmousedown = (e) => {
        e.preventDefault();
        input.value = el.dataset.v;
        box.classList.add('hidden');
        selection();
      }),
  );
}
function bindCompetitionSuggest(inputId, boxId, getEntries, onInput, onSelection = onInput) {
  const input = $(inputId),
    box = $(boxId);
  if (!input || !box) return;
  let selected = -1,
    timer = null;
  const render = () => {
    selected = -1;
    renderCompetitionSuggest(inputId, boxId, getEntries(), onSelection);
  };
  input.addEventListener('input', () => {
    render();
    clearTimeout(timer);
    timer = setTimeout(onInput, 150);
  });
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 120));
  input.addEventListener('keydown', (e) => {
    if (box.classList.contains('hidden')) {
      if (e.key === 'Enter') {
        clearTimeout(timer);
        onInput();
      }
      return;
    }
    const items = [...box.querySelectorAll('.ds-item')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('sel', i === selected));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = items[selected] || items[0];
      if (pick) {
        input.value = pick.dataset.v;
        box.classList.add('hidden');
        onSelection();
      } else {
        box.classList.add('hidden');
        onInput();
      }
    } else if (e.key === 'Escape') box.classList.add('hidden');
  });
}
// Group the role selector by line so the list is easier to scan.
function buildRoleSelect() {
  const groups = [
    ['GK', ['gk', 'sk']],
    ['DEF', ['cd', 'bpd', 'fb', 'wb']],
    ['MID', ['dm', 'dlp', 'bwm', 'cm', 'b2b', 'ap']],
    ['AANV', ['wing', 'if', 'am', 'af', 'poacher', 'tm', 'cf']],
  ];
  const H = {
    GK: 'Goalkeeper',
    DEF: 'Defence',
    MID: 'Midfield',
    AANV: 'Attack',
  };
  let html = `<option value="">${text('roleAny')}</option>`;
  for (const [g, ids] of groups) {
    html +=
      `<optgroup label="${H[g]}">` +
      ids.map((id) => `<option value="${id}">${roleName(id)}</option>`).join('') +
      '</optgroup>';
  }
  $('f-role').innerHTML = html;
  $('f-role').value = state.role;
}

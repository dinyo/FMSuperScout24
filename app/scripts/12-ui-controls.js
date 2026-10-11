// ---------- UI controls ----------
[
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
].forEach((id) => {
  let tm;
  $(id).addEventListener('input', () => {
    clearTimeout(tm);
    tm = setTimeout(applyFilters, 150);
  });
});
['f-eu', 'f-tstatus', 'f-contract', 'f-shortlist', 'f-wonderkid', 'f-foot', 'f-new'].forEach((id) =>
  $(id).addEventListener('change', applyFilters),
);
$('f-myclub').addEventListener('change', () => {
  if (state.mode === 'myplayer' && !$('f-myclub').checked) setMode('players');
  else applyFilters();
});
$('f-meta-group').addEventListener('change', () => {
  state.metaViewPos = $('f-meta-group').value || null;
  localStorage.setItem('fmss_metaviewpos', state.metaViewPos || '');
  for (const p of state.players) {
    delete p._meta;
    delete p._metaPa;
    delete p._metaGroup;
  }
  applyFilters();
});
$('f-hist-period').addEventListener('change', async () => {
  await setHistPeriod($('f-hist-period').value);
  renderTable(); // The growth column depends on the selected history period.
  applyFilters();
});
$('btn-adv').onclick = advDialog;
$('f-staffrole').addEventListener('change', applyFilters);
$('f-staff-recruitable').addEventListener('change', applyFilters);
$('f-gender').addEventListener('change', applyFilters);
// Player and club league filters share the same fast, keyboard-accessible suggestions.
bindCompetitionSuggest('f-div', 'div-suggest', () => state.divIndex || [], applyFilters);
bindCompetitionSuggest(
  'club-filter-league',
  'club-league-suggest',
  buildClubLeagueIndex,
  applyClubListFilters,
);
bindCompetitionSuggest(
  'club-filter-nation',
  'club-nation-suggest',
  buildClubNationIndex,
  applyClubListFilters,
);
$('f-interest').addEventListener('change', applyFilters);
$('f-role').addEventListener('change', () => {
  state.role = $('f-role').value;
  localStorage.setItem('fmss_role', state.role);
  if (state.role) {
    state.sortKey = 'role';
    state.sortDir = -1;
  } // Immediately sort by role score.
  else if (state.sortKey === 'role') {
    state.sortKey = 'ca';
    state.sortDir = -1;
  }
  applyFilters();
  if (state.selected) showDetail(state.selected);
});

$('btn-clear').onclick = () => {
  document
    .querySelectorAll('#filters input[type=text], #filters input[type=number]')
    .forEach((i) => (i.value = ''));
  document.querySelectorAll('#filters input[type=checkbox]').forEach((i) => (i.checked = false));
  $('f-staff-recruitable').checked = true;
  if (state.mode === 'myplayer') $('f-myclub').checked = true;
  $('f-staffrole').value = '';
  $('f-gender').value = '';
  $('f-interest').value = '0';
  $('f-contract').value = '';
  $('f-tstatus').value = '';
  $('f-role').value = '';
  state.role = '';
  state.profThreshold = 15;
  $('f-prof-threshold').value = state.profThreshold;
  localStorage.setItem('fmss_profthreshold', state.profThreshold);
  $('f-foot').value = '';
  if (state.mode === 'staff') state.advStaffF = [];
  else state.advF = [];
  saveAdv();
  activePos.clear();
  document.querySelectorAll('.pos-node').forEach((n) => n.classList.remove('on'));
  state.myTeam = 'all';
  renderMyTeamChips(); // Reset the My Club team chips along with the other filters.
  if (state.mode === 'myplayer') {
    state.myPlayerTeamFilter = ['first'];
    try {
      localStorage.setItem('fmss_myplayer_team_filter', JSON.stringify(state.myPlayerTeamFilter));
    } catch {}
    renderMyPlayerTeamFilters();
  }
  state.presetSel = null;
  renderPresets(); // Reset the dropdown label to its placeholder.
  applyFilters();
};
$('btn-sidebar').onclick = () => document.body.classList.toggle('sidebar-collapsed');
$('btn-export').onclick = exportShortlist;
$('btn-export-fmf').onclick = exportShortlistFmf;
$('btn-clear-shortlist').onclick = clearShortlist;
$('btn-import-fmf').onclick = () => $('input-import-fmf').click();
$('input-import-fmf').onchange = (e) => importShortlistFmf(e.target.files && e.target.files[0]);
$('btn-bulk-add').onclick = addBulkToShortlist;
$('btn-bulk-cancel').onclick = clearBulkSelection;
$('btn-coffee').onclick = openKofi;
$('btn-report').onclick = reportBug;
$('es-report').onclick = reportBug;
// Manual update check in Settings, in addition to the silent 20-hour autocheck.
// Show the result below the button; the top-bar update pill handles the same update flow.
$('btn-updcheck').onclick = async () => {
  const btn = $('btn-updcheck'),
    note = $('upd-note');
  btn.disabled = true;
  note.textContent = text('updChecking');
  try {
    const r = await checkUpdate(true);
    note.textContent =
      r && r.newer ? tf('updFound', { v: r.tag }) : tf('updNone', { v: APP_VERSION });
  } catch (e) {
    console.error('update-check:', e);
    note.textContent = text('updCheckErr');
  }
  btn.disabled = false;
};
checkUpdate();

// Briefly pulse the Ko-fi icon after meaningful use, such as saving a player or exporting a shortlist.
// Show the pulse at most once a day; clicking the icon opens Ko-fi and stops the animation.
// The previous random timer and global click counter often hid the pulse before users could notice it.
function coffeeGlow() {
  if (kofiOff()) return; // "Don't ask again" also applies to the glow
  const last = +localStorage.getItem('fmss_glow_at') || 0;
  if (Date.now() - last < 24 * 3600e3) return;
  // Never ask two questions at the same time: if the seasonal report is open, the icon remains silent.
  const dn = $('donate-nudge');
  if (dn && !dn.classList.contains('hidden')) return;
  localStorage.setItem('fmss_glow_at', String(Date.now()));
  const btn = $('btn-coffee');
  if (!btn) return;
  btn.classList.add('glow');
  const stop = () => {
    btn.classList.remove('glow');
    btn.removeEventListener('click', stop);
  };
  btn.addEventListener('click', stop);
  setTimeout(stop, 12e3);
}
// Supporter state (gold icon) survives restarts.
if (localStorage.getItem('fmss_supporter') === '1') $('btn-coffee').classList.add('supporter');
checkSetupState();

// collapsible filter sections (remember preference)
// On first use, collapse secondary sections so the sidebar fits on one screen.
// Remember the user's section choices after that.
const rawSecs = localStorage.getItem('fmss_secs');
const collapsedSecs = new Set(
  rawSecs
    ? JSON.parse(rawSecs)
    : ['presets', 'role', 'development', 'physical', 'financial', 'origin', 'availability'],
);
document.querySelectorAll('.fsection[data-sec]').forEach((sec) => {
  const key = sec.dataset.sec;
  if (collapsedSecs.has(key)) sec.classList.add('collapsed');
  sec.querySelector('.fsec-head').addEventListener('click', () => {
    sec.classList.toggle('collapsed');
    if (sec.classList.contains('collapsed')) collapsedSecs.add(key);
    else collapsedSecs.delete(key);
    localStorage.setItem('fmss_secs', JSON.stringify([...collapsedSecs]));
  });
});

// '/' focuses the search field
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.closest?.('input, select, textarea')) {
    e.preventDefault();
    $('f-name').focus();
  }
});

// ↑/↓ cycles through the rows; the detail panel follows
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  if (e.target.closest?.('input, select, textarea')) return;
  if (!state.filtered.length) return;
  e.preventDefault();
  let i = state.selected ? state.filtered.indexOf(state.selected) : -1;
  i = e.key === 'ArrowDown' ? Math.min(state.filtered.length - 1, i + 1) : Math.max(0, i - 1);
  const wrap = $('table-wrap');
  const y = i * ROW_H;
  if (y < wrap.scrollTop) wrap.scrollTop = y;
  else if (y + ROW_H * 2 > wrap.scrollTop + wrap.clientHeight)
    wrap.scrollTop = y - wrap.clientHeight + ROW_H * 2;
  showDetail(state.filtered[i]);
});

// Clicking the club badge clears filters and enables the My Club filter.
$('club-badge').onclick = () => {
  if (!state.meta.myClub) return;
  $('btn-clear').onclick();
  $('f-myclub').checked = true;
  renderMyTeamChips(); // Programmatic checkbox changes do not fire a change event.
  applyFilters();
};

// Currency dropdown.
$('sel-cur').value = state.cur;
$('sel-cur').addEventListener('change', () => {
  state.cur = $('sel-cur').value;
  localStorage.setItem('fmss_cur', state.cur);
  renderVisible();
  if (state.selected) showDetail(state.selected);
});
// Database choice (men/women/both): lives server-side (scan-config.json) so that the
// plugin reads it at New data; localStorage would never reach the game.
fetch('/api/scan-config')
  .then((r) => r.json())
  .then((c) => {
    $('sel-db').value = c.db || 'men';
  })
  .catch(() => {});
$('sel-db').addEventListener('change', () => {
  fetch('/api/scan-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db: $('sel-db').value }),
  })
    .then(() => showToast(text('womenNote'), 'check'))
    .catch(() => {});
});
// Wage period dropdown.
$('sel-wageper').value = state.wagePer;
$('sel-wageper').addEventListener('change', () => {
  state.wagePer = $('sel-wageper').value;
  localStorage.setItem('fmss_wageper', state.wagePer);
  refreshWageDisplay();
});
// Hide CA/PA (anti-"spike"). Adjusts the entire tool consistently.
function applyHideCapa() {
  document.body.classList.toggle('hide-capa', state.hideCapa);
  document.body.classList.toggle('hide-meta', state.hideMeta);
  // Clear filters for hidden stats so they cannot affect results invisibly.
  // CA, PA, asking price, and growth follow the CA/PA setting; meta has its own setting.
  if (state.hideCapa)
    [
      'f-ca-min',
      'f-ca-max',
      'f-pa-min',
      'f-pa-max',
      'f-fee',
      'f-growth-min',
      'f-growth-max',
      'f-metapa-min',
      'f-metapa-max',
    ].forEach((id) => {
      const e = $(id);
      if (e) e.value = '';
    });
  if (state.hideCapa) {
    const n = $('f-new');
    if (n) n.checked = false;
  } // The new-player filter depends on growth data.
  if (state.hideMeta)
    ['f-meta-min', 'f-meta-max', 'f-metapa-min', 'f-metapa-max'].forEach((id) => {
      const e = $(id);
      if (e) e.value = '';
    });
  if (hiddenStatCol(state.sortKey)) {
    state.sortKey = state.mode === 'staff' ? 'wage' : 'value';
    state.sortDir = -1;
  }
  updateAdvBtn(); // Hide advanced rules that target stats hidden by this setting.
  renderDevSection();
  renderIntakeBar();
  if (state.mode === 'analysis') renderAnalysis();
  else {
    renderTable();
    applyFilters();
  }
  if (state.selected) showDetail(state.selected);
}
$('set-profile').value = profMode();
$('set-profile').addEventListener('change', () => {
  localStorage.setItem('fmss_profmode', $('set-profile').value);
  if (state.selected) showDetail(state.selected); // open profile immediately
});
$('set-hidemeta').checked = !state.hideMeta; // "show" = do not hide (on by default)
$('set-hidemeta').addEventListener('change', () => {
  state.hideMeta = !$('set-hidemeta').checked;
  localStorage.setItem('fmss_hidemeta', state.hideMeta ? '1' : '0');
  applyHideCapa(); // Re-render columns, filters, profile, and analysis after the visibility setting changes.
});
$('set-hidecapa').checked = !state.hideCapa; // Checked means CA/PA values are visible by default.
$('set-hidecapa').addEventListener('change', () => {
  state.hideCapa = !$('set-hidecapa').checked;
  localStorage.setItem('fmss_hidecapa', state.hideCapa ? '1' : '0');
  applyHideCapa();
});
$('btn-clear-data').onclick = async () => {
  if (!window.confirm(text('clearAllDataConfirm'))) return;
  const btn = $('btn-clear-data');
  dataClearInProgress = true;
  btn.disabled = true;
  try {
    if (historySnapshotInFlight) await historySnapshotInFlight.catch(() => {});
    const r = await fetch('/api/data/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

    for (const key of [
      'fmss_hist_at',
      'fmss_loadmark',
      'fmss_shortlist',
      'fmss_intake_seen',
      'fmss_season',
      'fmss_season_at',
      'fmss_season_base',
      'fmss_season_n',
      'fmss_loads',
    ]) {
      localStorage.removeItem(key);
    }
    alert(text('clearAllDataDone'));
    window.location.reload();
  } catch (e) {
    console.error('clear all data:', e);
    alert(text('clearAllDataError'));
  } finally {
    dataClearInProgress = false;
    btn.disabled = false;
  }
};
// Settings menu (gear icon).
$('btn-settings').onclick = (e) => {
  e.stopPropagation();
  const m = $('settings-menu');
  if (!m.classList.contains('hidden')) {
    m.classList.add('hidden');
    return;
  }
  const r = $('btn-settings').getBoundingClientRect();
  m.style.top = r.bottom + 6 + 'px';
  m.style.right = window.innerWidth - r.right + 'px';
  m.classList.remove('hidden');
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('#settings-menu') && !e.target.closest('#btn-settings'))
    $('settings-menu').classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('settings-menu').classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('weight-editor-modal')?.style.display !== 'none') closeWeightEditor();
});

// Request a fresh data scan from the plugin.
let fetchTimeout = null;
// Track the dump time when the user requests new data so poll() can recognize a fresh dump,
// including the first dump after installation when there was no previous timestamp,
// or a scan that finishes between two polls.
let fetchPending = false,
  fetchBaseDumpTime = null;
$('btn-fetch').onclick = async () => {
  const b = $('banner');
  try {
    const st = await (await fetch('/api/fmstatus')).json();
    if (!st.running) {
      b.className = 'scanning error';
      b.innerHTML = bannerMsg('warning', text('fmNotRunning'));
      b.onclick = null;
      return;
    }
    await fetch('/api/refresh', { method: 'POST' });
    fetchPending = true;
    fetchBaseDumpTime = lastDumpTime;
    b.className = 'scanning';
    b.innerHTML = bannerMsg('hourglass', text('reqSent'));
    b.onclick = null;
    // If the plugin never enters the scanning state, explain that it did not pick up the request.
    // Show a clear hint instead of leaving the spinner indefinitely. poll() cancels this timeout
    // when the scan starts.
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(async () => {
      try {
        const s2 = await (await fetch('/api/status')).json();
        if (s2.reader && s2.reader.state === 'scanning') return; // The scan has started.
        if (s2.dumpTime && s2.dumpTime !== fetchBaseDumpTime) return; // A fast scan has completed.
        fetchPending = false;
        b.className = 'scanning error';
        // A request that is consistently ignored usually means FM restarted and removed the mod layer.
        // See TROUBLESHOOTING.md section 4d for the fix.
        b.innerHTML = bannerMsg('warning', text('reqNoPickup'));
        b.onclick = () => {
          b.className = 'hidden';
        };
      } catch {}
    }, 15000);
  } catch (e) {
    // The local server is usually no longer running. Show the cause so the user knows to reopen the app.
    console.error('btn-fetch:', e);
    b.className = 'scanning error';
    b.innerHTML = bannerMsg('warning', text('serverGone'));
    b.onclick = () => {
      b.className = 'hidden';
    };
  }
};
$('btn-shortlist-sync').onclick = async () => {
  const status = $('shortlist-sync-status');
  const started = Date.now();
  status.textContent = text('loading');
  try {
    const start = await fetch('/api/shortlist-refresh', { method: 'POST' });
    if (!start.ok) {
      let detail = '';
      try {
        detail = (await start.json()).error || '';
      } catch {}
      throw new Error(detail || text('syncmissing'));
    }
    for (;;) {
      await new Promise((r) => setTimeout(r, 700));
      if (Date.now() - started > 90000) throw new Error(text('syncTimeout'));
      const r = await fetch('/api/shortlist-status?t=' + Date.now());
      if (!r.ok) {
        if (Date.now() - started > 30000) throw new Error(text('syncmissing'));
        continue;
      }
      const data = await r.json();
      if (data.state === 'scanning' || new Date(data.at).getTime() < started - 2000) continue;
      if (data.state === 'error') throw new Error(data.error || text('syncmissing'));
      const gameIds = Array.isArray(data.ids)
        ? data.ids.map(Number).filter(Number.isSafeInteger)
        : [];
      // Hybrid rows can be absent from an older full dump. The native shortlist
      // probe includes their compact player record so the just-loaded row is
      // immediately visible instead of waiting for another full scan.
      if (Array.isArray(data.players)) {
        const known = new Set(state.allPlayers.map((p) => Number(p.id)));
        for (const player of data.players) {
          const id = Number(player?.id);
          if (!Number.isSafeInteger(id) || known.has(id)) continue;
          state.allPlayers.push(player);
          state.players.push(player);
          known.add(id);
        }
      }
      // Keep valid IDs even when FM exposes a ghost/hybrid row that the last
      // full dump did not include yet. The next dump can then rehydrate it,
      // instead of silently shrinking the game shortlist during import.
      state.shortlist = new Set(gameIds);
      localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
      $('sl-count').textContent = state.shortlist.size;
      status.textContent = tf('syncfound', { n: state.shortlist.size });
      showToast(`${state.shortlist.size} ← FM24`, 'check');
      applyFilters();
      break;
    }
  } catch (e) {
    status.textContent = e.message || text('syncmissing');
    showToast(tf('syncError', { error: e.message || e }));
  }
};

function initializeUi() {
  const wageLabel = document.getElementById('f-wage-label');
  if (wageLabel) wageLabel.textContent = text('maxwage') + ' ' + wageSuf();
  $('set-version').textContent = 'FMSuperScout 24 v' + APP_VERSION;
  updateAdvBtn();
  renderDumpInfo();
  renderClubBadge();
  renderVerWarn();
  buildStaffRoles();
  buildGenderFilter();
  buildFootOptions();
  buildRoleSelect();
  buildDivisions();
  renderDevSection();
  renderIntakeBar();
  renderPresets();
  updateBulkBar();
  renderTable();
  if (state.mode === 'myplayer') renderMyPlayerTeamFilters();
  if (state.mode === 'bestxi') renderBestXI();
  if (state.mode === 'club-list') renderClubList();
  applyFilters();
  if (state.selected) showDetail(state.selected);
}

function refreshWageDisplay() {
  const wageLabel = document.getElementById('f-wage-label');
  if (wageLabel) wageLabel.textContent = text('maxwage') + ' ' + wageSuf();
  renderTable();
  if (state.selected) showDetail(state.selected);
}

function setMode(mode) {
  const previousHistPeriod = state.histPeriod;
  persistFilterTab(state.mode);
  state.mode = mode;
  if (FILTER_TAB_MODES.has(mode)) restoreFilterTab(mode);
  if (mode === 'myplayer') $('f-myclub').checked = true;
  const requestedHistPeriod = $('f-hist-period').value;
  const histPeriodChanged =
    FILTER_TAB_MODES.has(mode) &&
    HIST_PERIODS.includes(requestedHistPeriod) &&
    requestedHistPeriod !== previousHistPeriod;
  const histRefresh =
    histPeriodChanged && mode !== 'staff' && histReady()
      ? setHistPeriod(requestedHistPeriod)
      : null;
  const isAn = mode === 'analysis';
  const isXi = mode === 'bestxi';
  const isClubList = mode === 'club-list';
  const isMyPlayer = mode === 'myplayer';
  const isCustomView = isAn || isXi || isClubList;

  $('tab-players').classList.toggle('active', mode === 'players');
  $('tab-staff').classList.toggle('active', mode === 'staff');
  $('tab-shortlist').classList.toggle('active', mode === 'shortlist');
  $('tab-myplayer').classList.toggle('active', isMyPlayer);
  $('tab-analysis').classList.toggle('active', isAn);
  if ($('tab-bestxi')) $('tab-bestxi').classList.toggle('active', isXi);
  if ($('tab-club-list')) $('tab-club-list').classList.toggle('active', isClubList);

  const isStaff = mode === 'staff';
  $('fg-pitch').style.display = isStaff || isCustomView ? 'none' : '';
  $('fg-clubfilters').style.display = isClubList ? '' : 'none';
  $('fg-staffrole').style.display = isStaff ? '' : 'none';
  $('fg-role').style.display = isStaff || isCustomView ? 'none' : '';
  $('f-meta-group-row').style.display = isStaff ? 'none' : '';
  $('f-meta-row').style.display = isStaff ? 'none' : ''; // meta-score does not exist for staff
  $('f-metapa-row').style.display = isStaff ? 'none' : '';
  // Staff has no height, foot, PA growth or player transfer options; those filters don't belong there.
  $('fg-physical').style.display = isStaff ? 'none' : '';
  $('f-wonderkid-row').style.display = isStaff ? 'none' : '';
  $('f-price-row').style.display = isStaff ? 'none' : '';
  $('f-fee-row').style.display = isStaff ? 'none' : '';
  $('f-interest-row').style.display = isStaff ? 'none' : '';
  $('f-tstatus-row').style.display = isStaff ? 'none' : '';
  $('f-myclub-row').style.display = isStaff || isMyPlayer ? 'none' : '';
  $('f-shortlist-row').style.display = isStaff || mode === 'shortlist' ? 'none' : '';
  buildGenderFilter(); // player and staff list can be mixed separately
  renderDevSection(); // history is only kept for players
  renderIntakeBar();

  if (hiddenStatCol(state.sortKey)) {
    state.sortKey = mode === 'staff' ? 'wage' : 'ca';
    state.sortDir = -1;
  }
  $('sl-bar').classList.toggle('hidden', mode !== 'shortlist');
  renderMyTeamChips();
  document.body.classList.toggle('mode-analysis', isAn || isXi);
  document.body.classList.toggle('mode-club-list', isClubList);
  state.bulkSelected.clear();
  state.bulkAnchor = null;
  updateBulkBar();
  state.selected = null;
  $('detail').classList.add('hidden');
  $('detail-backdrop').classList.add('hidden');

  const toggleView = (id, show) => {
    const el = $(id);
    if (el) {
      el.style.display = show ? 'block' : 'none';
      el.classList.toggle('hidden', !show);
    }
  };

  toggleView('myplayer-team-filters', isMyPlayer);
  if (isMyPlayer) renderMyPlayerTeamFilters();
  else $('myplayer-team-filters').innerHTML = '';
  toggleView('table-wrap', !isCustomView);
  toggleView('analysis', isAn);
  toggleView('bestxi', isXi);
  toggleView('club-list-view', isClubList);
  if (isClubList) $('club-list-view').style.display = 'flex';
  if (isClubList) {
    $('chipbar').innerHTML = '';
    renderClubList();
    return;
  }
  if (isAn) {
    $('chipbar').innerHTML = '';
    renderAnalysis();
    return;
  }
  if (isXi) {
    $('chipbar').innerHTML = '';
    renderBestXI();
    return;
  }

  $('table-wrap').style.display = '';
  $('analysis').classList.add('hidden');
  if (!activeCols().find((c) => c.key === state.sortKey)) {
    state.sortKey = 'ca';
    state.sortDir = -1;
  }
  renderTable();
  applyFilters();
  if (histRefresh)
    histRefresh.then(() => {
      if (state.mode !== mode) return;
      renderDevSection();
      renderTable();
      applyFilters();
    });
}

// Bind the newer tabs.
if ($('tab-bestxi')) $('tab-bestxi').onclick = () => setMode('bestxi');
if ($('tab-club-list')) $('tab-club-list').onclick = () => setMode('club-list');
$('fg-clubfilters').addEventListener('input', (e) => {
  if (
    e.target.matches('input') &&
    !['club-filter-league', 'club-filter-nation'].includes(e.target.id)
  )
    applyClubListFilters();
});
$('club-list-head').addEventListener('click', (e) => {
  const th = e.target.closest('[data-club-sort]');
  if (!th) return;
  const key = th.dataset.clubSort;
  if (clubListSortKey === key) clubListSortDir *= -1;
  else {
    clubListSortKey = key;
    clubListSortDir = ['name', 'nation', 'league'].includes(key) ? 1 : -1;
  }
  renderClubList();
});
$('club-list-table-wrap').addEventListener('scroll', () => {
  if (clubListScrollQueued) return;
  clubListScrollQueued = true;
  requestAnimationFrame(() => {
    clubListScrollQueued = false;
    renderClubListVisible();
  });
});
$('tab-players').onclick = () => setMode('players');
$('tab-staff').onclick = () => setMode('staff');
$('tab-shortlist').onclick = () => setMode('shortlist');
$('tab-myplayer').onclick = () => {
  if (!state.meta.myClub) showToast(text('bestxi_autoNoClub'), 'warning');
  setMode('myplayer');
};
$('tab-analysis').onclick = () => setMode('analysis');
// Call loadDump() without passing the click event. Otherwise it becomes force=true and
// bypasses the out-of-memory guard.
$('btn-reload').onclick = () => loadDump();

// ---------- first-team, reserve, and youth filters for My Club ----------
// Visible as soon as the "My club" checkbox is checked and the dump has teamType data
// (plugin v0.1.10+); older dumps → chips remain hidden, filter does nothing.
function renderMyTeamChips() {
  const box = $('myteam-chips');
  const myClub = (state.meta.myClub || '').toLowerCase();
  const myClubId = Number(state.meta.myClubId) || 0;
  const hasData =
    myClub &&
    state.players.some(
      (p) =>
        p.teamType != null &&
        (myClubId && p.clubId
          ? Number(p.clubId) === myClubId
          : (p.club || '').toLowerCase() === myClub),
    );
  const show =
    hasData && $('f-myclub').checked && state.mode !== 'staff' && state.mode !== 'myplayer';
  box.style.display = show ? '' : 'none';
  if (!show) return;
  const opts = [
    ['all', text('mt_all')],
    ['first', text('mt_first')],
    ['res', text('mt_res')],
    ['youth', text('mt_youth')],
  ];
  box.innerHTML = opts
    .map(
      ([k, lbl]) =>
        `<button class="mt-chip ${state.myTeam === k ? 'on' : ''}" data-mt="${k}">${lbl}</button>`,
    )
    .join('');
  box.querySelectorAll('.mt-chip').forEach(
    (b) =>
      (b.onclick = () => {
        state.myTeam = b.dataset.mt;
        renderMyTeamChips();
        applyFilters();
      }),
  );
}
$('f-myclub').addEventListener('change', renderMyTeamChips);

// ---------- status polling and button feedback ----------
let lastPluginState = null,
  lastDumpTime = null;
async function poll() {
  try {
    const st = await (await fetch('/api/status')).json();
    const b = $('banner');
    const pl = st.reader;
    if (pl && pl.state === 'scanning') {
      clearTimeout(fetchTimeout); // plugin picked up the request
      // The plugin refreshes status.json about every two seconds while scanning. If it still says
      // "scanning" but the file is over 15 seconds old, FM24 probably stopped or crashed mid-scan.
      // Without this check, the progress bar could remain visible indefinitely.
      if (typeof pl.mtime === 'number' && Date.now() - pl.mtime > 15000) {
        b.className = 'scanning error';
        b.innerHTML = bannerMsg('warning', text('scanStalled'));
        b.onclick = () => {
          b.className = 'hidden';
        };
      } else {
        b.className = 'scanning';
        // Plugin v0.1.2 and later report progress from 0 to 1; older versions use a text-only banner.
        b.innerHTML =
          typeof pl.progress === 'number'
            ? bannerProgress('hourglass', text('dumping'), pl.progress)
            : bannerMsg('hourglass', text('dumping'));
      }
    } else if (pl && pl.state === 'error') {
      clearTimeout(fetchTimeout);
      fetchPending = false; // The plugin responded, so the request timeout no longer applies.
      b.className = 'scanning error';
      b.innerHTML = bannerMsg('warning', text('dumpError') + (pl.error ? ': ' + pl.error : ''));
      b.onclick = null;
    } else if (pl && pl.state === 'done') {
      // A new dump can be detected by a changed timestamp, an observed scan, or a dump that
      // appears after a manual request. These checks also cover fast scans between polls and
      // the first dump after installation, when lastDumpTime is still null.
      const fresh =
        (st.dumpTime && st.dumpTime !== lastDumpTime && lastDumpTime !== null) ||
        lastPluginState === 'scanning' ||
        (fetchPending && st.dumpTime && st.dumpTime !== fetchBaseDumpTime);
      if (fresh) {
        clearTimeout(fetchTimeout);
        fetchPending = false;
        // Load a new dump automatically and show a brief confirmation in the green status bar.
        loadDump().then((ok) => {
          if (!ok) return; // loading error: loadDump itself shows the error screen and error banner
          b.className = 'done';
          b.innerHTML = bannerMsg(
            'check',
            `${text('dumpLoaded')} (${(pl.players ?? 0).toLocaleString()} · ${(pl.staff ?? 0).toLocaleString()})`,
          );
          b.onclick = () => {
            b.className = 'hidden';
          };
          setTimeout(() => {
            if (b.className === 'done') b.className = 'hidden';
          }, 6000);
        });
      }
    }
    lastPluginState = pl ? pl.state : null;
    if (st.dumpTime) lastDumpTime = st.dumpTime;
  } catch {
    /* server gone */
  }
  // Poll faster during a scan so that the progress bar moves smoothly.
  setTimeout(poll, lastPluginState === 'scanning' ? 750 : 2000);
}

// Heartbeat: Only in standalone app mode, so the server stops when the window closes.
// Not necessary in dev mode (browser), which saves unnecessary network traffic.
async function initHeartbeat() {
  try {
    const st = await (await fetch('/api/status')).json();
    if (!st.appMode) return;
    const beat = () => fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    setInterval(beat, 4000);
    beat();
    // Background windows throttle timers. Refresh the heartbeat when the window becomes
    // visible or focused so the server is responsive on the next click.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) beat();
    });
    window.addEventListener('focus', beat);
    window.addEventListener('pagehide', () => {
      try {
        navigator.sendBeacon('/api/bye');
      } catch {}
    });
  } catch {
    /* server gone */
  }
}
initHeartbeat();

buildPitch();
initializeUi();
document.body.classList.toggle('hide-capa', state.hideCapa);
document.body.classList.toggle('hide-meta', state.hideMeta);
$('sl-count').textContent = state.shortlist.size;
loadDump().then(() => poll());

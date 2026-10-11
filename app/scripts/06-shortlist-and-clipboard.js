// ---------- clipboard and toast ----------
function showToast(msg, ico) {
  const el = $('toast');
  el.innerHTML = (ico ? icon(ico, 13) + ' ' : '') + escHtml(msg);
  el.className = 'show';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (el.className = 'hidden'), 1600);
}
function copyName(name) {
  const ok = () => showToast(text('copied') + ': ' + name, 'clipboard');
  if (navigator.clipboard && window.isSecureContext)
    navigator.clipboard.writeText(name).then(ok, () => fallbackCopy(name, ok));
  else fallbackCopy(name, ok);
}
function fallbackCopy(text, ok) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    ok();
  } catch {
    showToast('!');
  }
}

// ---------- shortlist ----------
function toggleShortlist(id) {
  const playerIds = new Set((state.allPlayers || state.players).map((p) => Number(p.id)));
  if (!playerIds.has(Number(id))) return;
  if (state.shortlist.has(id)) state.shortlist.delete(id);
  else state.shortlist.add(id);
  invalidateAnalysisData();
  localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
  $('sl-count').textContent = state.shortlist.size;
  if (state.mode === 'shortlist' || $('f-shortlist').checked) applyFilters();
  else renderVisible();
  const el = document.querySelector('.detail-star');
  if (el && state.selected) el.classList.toggle('on', state.shortlist.has(state.selected.id));
}
function exportShortlist() {
  const ids = state.shortlist;
  const all = state.players.filter((p) => ids.has(p.id));
  if (!all.length) {
    showToast(text('slEmpty'));
    return;
  }
  const withCapa = !state.hideCapa; // asking price is also covered by the hidden stats toggle
  const cols = [
    'Name',
    'Position',
    'Age',
    'Club',
    'Nationality',
    ...(withCapa ? ['CA', 'PA'] : []),
    'Value(GBP)',
    ...(withCapa ? ['AskingPrice(GBP)'] : []),
    'Wage(GBP)',
    'Contract',
    'Interest',
  ];
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(',')];
  for (const p of all) {
    const i = interestEstimate(p);
    lines.push(
      [
        p.name,
        p.pos || jobLabel(p),
        getAge(p),
        p.club || '',
        natsLabel(p),
        ...(withCapa ? [p.ca, p.pa] : []),
        estValue(p).v ?? '',
        ...(withCapa ? [feeEstimate(p).v ?? ''] : []),
        p.wage ?? '',
        p.expires || '',
        i ? i.label : '',
      ]
        .map(esc)
        .join(','),
    );
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // revoke only after the download (Firefox aborts it otherwise) — same pattern as downloadPlayerCard
  a.download = 'fmscuperscout24-shortlist.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast(tf('exportedCsv', { n: all.length }), 'check');
  coffeeGlow();
}
function updateBulkBar() {
  const bar = $('bulk-bar');
  const n = ['players', 'shortlist', 'myplayer'].includes(state.mode) ? state.bulkSelected.size : 0;
  bar.classList.toggle('hidden', n === 0);
  const removing = state.mode === 'shortlist';
  $('bulk-count').textContent = tf('bulkselected', { n });
  $('btn-bulk-add').textContent = text(removing ? 'bulkremove' : 'bulkadd');
  bar.classList.toggle('remove', removing);
}
function syncDetailToBulkSelection() {
  if (!['players', 'shortlist', 'myplayer'].includes(state.mode) || state.bulkSelected.size !== 1) {
    closeDetail();
    return;
  }
  const id = [...state.bulkSelected][0];
  const p = state.players.find((x) => Number(x.id) === Number(id));
  if (p) showDetail(p);
  else closeDetail();
}
function addBulkToShortlist() {
  const removing = state.mode === 'shortlist';
  let changed = 0;
  for (const id of state.bulkSelected) {
    if (removing) {
      if (state.shortlist.delete(id)) changed++;
    } else if (!state.shortlist.has(id)) {
      state.shortlist.add(id);
      changed++;
    }
  }
  if (changed) invalidateAnalysisData();
  localStorage.setItem('fmss_shortlist', JSON.stringify([...state.shortlist]));
  $('sl-count').textContent = state.shortlist.size;
  state.bulkSelected.clear();
  state.bulkAnchor = null;
  updateBulkBar();
  if (removing) applyFilters();
  else renderVisible();
  syncDetailToBulkSelection();
  showToast(tf(removing ? 'bulkRemoved' : 'bulkAdded', { n: changed }), 'check');
}
function clearBulkSelection() {
  state.bulkSelected.clear();
  state.bulkAnchor = null;
  updateBulkBar();
  renderVisible();
  syncDetailToBulkSelection();
}

async function exportShortlistFmf() {
  const knownPlayers = new Set(state.players.map((p) => Number(p.id)));
  const ids = [...state.shortlist].map(Number).filter((id) => knownPlayers.has(id));
  if (!ids.length) {
    showToast(text('slEmpty'));
    return;
  }
  if (typeof window.showSaveFilePicker !== 'function') {
    showToast(text('fmfSavePickerUnsupported'));
    return;
  }

  const suggested =
    `FMSuperScout 24 ${state.meta.gameDate || ''}`.trim().replace(/[\\/:*?"<>|]/g, '_') + '.fmf';
  let fileHandle;
  try {
    // Edge remembers the most recently used folder for this picker id.
    fileHandle = await window.showSaveFilePicker({
      id: 'fmf-shortlist',
      suggestedName: suggested,
      types: [
        {
          description: 'Football Manager shortlist',
          accept: { 'application/octet-stream': ['.fmf'] },
        },
      ],
    });
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    showToast(`${text('fmfExportError')}: ${e.message || e}`);
    return;
  }

  const name = fileHandle.name.replace(/\.fmf$/i, '') || 'FMSuperScout 24';
  try {
    const response = await fetch('/api/shortlist-fmf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ids }),
    });
    if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
    const blob = await response.blob();
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (e) {
      await writable.abort().catch(() => {});
      throw e;
    }
    showToast(tf('fmfExported', { n: ids.length }), 'check');
    coffeeGlow();
  } catch (e) {
    showToast(`${text('fmfExportError')}: ${e.message || e}`);
  }
}

function clearShortlist() {
  if (!state.shortlist.size) return;
  if (!confirm(tf('clearShortConfirm', { n: state.shortlist.size }))) return;
  state.shortlist.clear();
  invalidateAnalysisData();
  localStorage.setItem('fmss_shortlist', '[]');
  $('sl-count').textContent = '0';
  $('shortlist-sync-status').textContent = '';
  applyFilters();
  showToast(text('shortlistCleared'), 'check');
}

async function importShortlistFmf(file) {
  if (!file) return;
  try {
    const response = await fetch('/api/shortlist-fmf/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
    const ids = [...normalizeShortlistIds(result.ids)];
    restoreShortlistPlayers(ids);
    const known = new Set(state.players.map((p) => Number(p.id)));
    const imported = ids.filter((id) => known.has(id));
    const missing = ids.length - imported.length;
    if (imported.length === 0 && missing > 0) {
      const message = tf('fmfNoMatch', { n: missing });
      $('shortlist-sync-status').textContent = `${result.name}: ${message}`;
      showToast(message, 'warning');
      return;
    }
    state.shortlist = new Set(imported);
    localStorage.setItem('fmss_shortlist', JSON.stringify(imported));
    $('sl-count').textContent = state.shortlist.size;
    $('shortlist-sync-status').textContent =
      tf('fmfImported', { name: result.name, n: imported.length }) +
      (missing ? ` · ${tf('fmfMissing', { n: missing })}` : '');
    applyFilters();
    showToast(tf('fmfImported', { name: result.name, n: imported.length }), 'check');
  } catch (e) {
    showToast(`${text('fmfImportError')}: ${e.message || e}`);
  } finally {
    $('input-import-fmf').value = '';
  }
}

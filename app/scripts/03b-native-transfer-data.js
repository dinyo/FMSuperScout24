// Live FM fields are queried only for an explicitly requested snapshot of players.
const nativeTransferQueue = new Map();
const nativeTransferInFlight = new Set();
const NATIVE_TRANSFER_BATCH_SIZE = 128;
let nativeTransferGeneration = 0;
let nativeTransferBusy = false;
state.nativeTransfer = { available: false, checking: false, paused: true, read: 0, error: null };

function renderNativeTransferStatus() {
  const info = state.nativeTransfer;
  const status = $('fm-transfer-status');
  if (!status) return;
  $('btn-fm-transfer-read').disabled = !info.available;
  $('btn-fm-transfer-read-selected').disabled = !info.available || !state.bulkSelected.size;
  $('f-interest-kind').disabled = !info.available;
  const remaining = nativeTransferQueue.size + nativeTransferInFlight.size;
  $('btn-fm-transfer-pause').disabled = !info.available || (!remaining && !nativeTransferBusy);
  status.textContent = info.checking ? 'Checking FM transfer data…'
    : info.error ? 'FM transfer data unavailable'
      : info.paused ? `FM data read paused: ${info.read.toLocaleString()} players`
      : remaining ? `Reading FM data: ${info.read.toLocaleString()} read, ${remaining.toLocaleString()} waiting…`
        : info.available ? `FM data read: ${info.read.toLocaleString()} players` : '';
  status.title = info.error || '';
}

async function resetNativeTransferData() {
  const generation = ++nativeTransferGeneration;
  nativeTransferQueue.clear();
  nativeTransferInFlight.clear();
  state.nativeTransfer = { available: false, checking: true, paused: true, read: 0, error: null };
  renderNativeTransferStatus();
  try {
    const result = await (await fetch('/api/native-transfer/status')).json();
    if (generation !== nativeTransferGeneration) return;
    if (!result.ok) throw new Error(result.error || 'FM transfer query is unavailable.');
    if (Number(state.meta.myClubId) && Number(result.buyerClubId) !== Number(state.meta.myClubId))
      throw new Error('The active FM club differs from the loaded data. Read New data again.');
    state.nativeTransfer.available = true;
  } catch (error) {
    if (generation !== nativeTransferGeneration) return;
    state.nativeTransfer.error = error.message;
  }
  state.nativeTransfer.checking = false;
  updateGameInterestFilterOptions(state.allPlayers || state.players);
  updateAskingPriceFilterAvailability(state.allPlayers || state.players);
  renderNativeTransferStatus();
  FILTER_RESULT_CACHE.clear();
  applyFilters();
}

function queueNativeTransferData(players, priority = false) {
  if (!state.nativeTransfer.available || state.nativeTransfer.paused) return;
  const fresh = players.filter((p) => p.attrs && !p.nativeTransferRead &&
    !nativeTransferInFlight.has(Number(p.id)) && !nativeTransferQueue.has(Number(p.id)));
  if (priority && fresh.length) {
    const waiting = [...nativeTransferQueue];
    nativeTransferQueue.clear();
    for (const p of fresh) nativeTransferQueue.set(Number(p.id), p);
    for (const [id, p] of waiting) nativeTransferQueue.set(id, p);
  } else for (const p of fresh) nativeTransferQueue.set(Number(p.id), p);
  if (!nativeTransferBusy && nativeTransferQueue.size) void readNativeTransferQueue();
}

async function readNativeTransferQueue() {
  if (nativeTransferBusy) return;
  nativeTransferBusy = true;
  try {
    while (state.nativeTransfer.available && !state.nativeTransfer.paused && nativeTransferQueue.size) {
      const generation = nativeTransferGeneration;
      const batch = [...nativeTransferQueue.values()].slice(0, NATIVE_TRANSFER_BATCH_SIZE);
      const byId = new Map(batch.map((p) => [Number(p.id), p]));
      for (const id of byId.keys()) {
        nativeTransferQueue.delete(id);
        nativeTransferInFlight.add(id);
      }
      renderNativeTransferStatus();
      try {
        const response = await fetch('/api/native-transfer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...byId.keys()] }),
        });
        const result = await response.json();
        if (generation !== nativeTransferGeneration) continue;
        if (!result.ok) throw new Error(result.error || 'FM transfer data could not be read.');
        if (Number(state.meta.myClubId) && Number(result.buyerClubId) !== Number(state.meta.myClubId))
          throw new Error('The active FM club changed. Read New data again.');
        const returned = new Map((result.rows || []).map((row) => [Number(row.id), row]));
        for (const [id, p] of byId) {
          const row = returned.get(id);
          if (row) {
            const { id: ignoredId, errors, ...fields } = row;
            Object.assign(p, fields);
            p.nativeTransferErrors = errors || (row.error ? { query: row.error } : null);
          } else p.nativeTransferErrors = { query: 'FM returned no player data.' };
          p.nativeTransferRead = true;
          state.nativeTransfer.read++;
        }
        FILTER_RESULT_CACHE.clear();
        applyFilters();
        if (state.selected && byId.has(Number(state.selected.id))) showDetail(state.selected);
      } catch (error) {
        if (generation === nativeTransferGeneration) {
          state.nativeTransfer.error = error.message;
          state.nativeTransfer.available = false;
          nativeTransferQueue.clear();
          updateGameInterestFilterOptions(state.allPlayers || state.players);
          updateAskingPriceFilterAvailability(state.allPlayers || state.players);
          FILTER_RESULT_CACHE.clear();
          applyFilters();
        }
      } finally {
        if (generation === nativeTransferGeneration)
          for (const id of byId.keys()) nativeTransferInFlight.delete(id);
        renderNativeTransferStatus();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    nativeTransferBusy = false;
    state.nativeTransfer.paused = true;
    renderNativeTransferStatus();
  }
}

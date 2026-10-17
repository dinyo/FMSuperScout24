// ---------- per-view column order and visibility ----------
const ROW_COLLATOR = new Intl.Collator('en');
const modeKey = () => (state.mode === 'staff' ? 'staff' : 'players');
function baseCols() {
  return modeKey() === 'staff' ? STAFF_COLS : PLAYER_COLS.filter((c) => c.key !== 'playingTimeHappiness' || state.mode === 'myplayer');
}
function colCfg() {
  const k = modeKey();
  const cols = baseCols().filter((c) => !c.star);
  const keys = cols.map((c) => c.key);
  const defHidden = new Set(cols.filter((c) => c.defHidden).map((c) => c.key));
  let saved = state.colCfg[k];
  if (!saved || !Array.isArray(saved.order)) {
    saved = { order: [...keys], hidden: [...defHidden] };
    state.colCfg[k] = saved;
  }
  if (k === 'staff') {
    const training = STAFF_TRAINING_CATEGORIES.map((category) => category.key);
    const nonTraining = keys.filter((key) => !training.includes(key));
    const previousDefault = [...nonTraining.slice(0, 3), ...training, ...nonTraining.slice(3)];
    if (
      saved.order.length === previousDefault.length &&
      saved.order.every((key, i) => key === previousDefault[i])
    ) {
      saved.order = [...keys];
      saveColCfg();
    }
  }
  for (const kk of keys)
    if (!saved.order.includes(kk)) {
      // Insert new columns after their nearest known predecessor, not at the end.
      const prev = keys
        .slice(0, keys.indexOf(kk))
        .reverse()
        .find((k2) => saved.order.includes(k2));
      saved.order.splice(prev ? saved.order.indexOf(prev) + 1 : saved.order.length, 0, kk);
      if (defHidden.has(kk) && !saved.hidden.includes(kk)) saved.hidden.push(kk); // hidden by default
    }
  saved.order = saved.order.filter((kk) => keys.includes(kk)); // Remove columns that no longer exist.
  return saved;
}
function saveColCfg() {
  localStorage.setItem('fmss_cols', JSON.stringify(state.colCfg));
}
// Column for the selected tactical role (only appears if a role is selected).
function roleCol() {
  const r = ROLE_BY_ID[state.role];
  if (!r) return null;
  return {
    key: 'role',
    label: 'roleColHdr',
    num: true,
    get: (p) => {
      const s = roleScore(p, r);
      return s == null ? -1 : s;
    },
    render: (p) => {
      const s = roleScore(p, r);
      return s == null
        ? '<span class="dim">·</span>'
        : `<span class="${roleClass(s)}">${s.toFixed(1)}</span>`;
    },
  };
}
function activeCols() {
  const base = baseCols();
  const byKey = Object.fromEntries(base.map((c) => [c.key, c]));
  const cf = colCfg();
  const hidden = new Set(cf.hidden);
  const sl = base.find((c) => c.star); // star column always in front
  const name = base.find((c) => c.name);
  const rc = state.mode !== 'staff' ? roleCol() : null; // role column immediately after name
  const rest = cf.order
    .filter((k) => !hidden.has(k) && byKey[k] && !(rc && k === 'role') && !hiddenStatCol(k))
    .map((k) => byKey[k]);
  const out = [];
  if (sl) out.push(sl);
  for (const c of rest) {
    out.push(c);
    if (rc && c === name) out.push(rc);
  }
  if (rc && !name) out.splice(1, 0, rc);
  return out;
}
function reorderCol(fromKey, toKey) {
  if (fromKey === toKey) return;
  const cf = colCfg();
  const arr = cf.order;
  const fi = arr.indexOf(fromKey),
    ti = arr.indexOf(toKey);
  if (fi < 0 || ti < 0) return;
  arr.splice(fi, 1);
  arr.splice(arr.indexOf(toKey), 0, fromKey); // before the target column
  saveColCfg();
  renderTable();
}
function sortRows() {
  const cols = activeCols();
  const col = cols.find((c) => c.key === state.sortKey) || cols[1];
  if (col.star) return;
  const dir = state.sortDir;
  // Calculate each sort key once per row instead of once per comparison. This avoids repeating
  // expensive meta and value calculations during sorting. Reuse one Collator for string comparisons.
  const rows = state.filtered;
  const keys = rows.map(col.get);
  const idx = rows.map((_, i) => i);
  idx.sort((ia, ib) => {
    const va = keys[ia],
      vb = keys[ib];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number') return (va - vb) * dir;
    return ROW_COLLATOR.compare(va, vb) * dir;
  });
  state.filtered = idx.map((i) => rows[i]);
}

// ---------- virtualized table ----------
let ROW_H = 28; // is measured after the first render (zoom/DPI independent)
let renderQueued = false;
let resizing = false; // true during/just after column width dragging (suppresses sort click)
// Measure the row height so spacer rows and translated content stay aligned.
function measureRowH() {
  const tr = $('grid-body').querySelector('tr[data-i]');
  if (!tr) return false;
  const h = tr.getBoundingClientRect().height;
  if (h > 12 && Math.abs(h - ROW_H) > 0.02) {
    ROW_H = h;
    return true;
  }
  return false;
}
function colLabel(c) {
  if (c.star) return starSvg(13);
  const base = c.label.startsWith('c_') || TEXT[c.label] ? text(c.label) : c.label;
  return c.key === 'wage' ? base + ' ' + wageSuf() : base; // Show the selected wage period in the heading.
}
function colWidths() {
  return state.colW[modeKey()] || (state.colW[modeKey()] = {});
}
function saveColW() {
  localStorage.setItem('fmss_colw', JSON.stringify(state.colW));
}
function renderTable() {
  const cols = activeCols();
  const W = colWidths();
  // Keep a fixed width for each column and set the table width to their sum.
  // This prevents visible row contents from shifting columns during sorting or scrolling.
  const wOf = (c) => W[c.key] || c.w || 90;
  $('grid').style.width = cols.reduce((s, c) => s + wOf(c), 0) + 'px';
  $('grid-head').innerHTML = cols
    .map((c) => {
      const stick = c.star ? 'c-sticky' : c.name ? 'c-sticky stick-end' : '';
      const w = ` style="width:${wOf(c)}px"`;
      const grip = c.star ? '' : '<span class="col-resize"></span>'; // drag handle right
      const help = c.help ? `<span class="col-help" data-help="${c.help}">?</span>` : '';
      return `<th data-key="${c.key}" draggable="${c.star ? 'false' : 'true'}"${w} class="${stick} ${c.key === state.sortKey ? 'sorted' : ''}">${colLabel(c)}${help}${c.key === state.sortKey ? (state.sortDir < 0 ? ' ▼' : ' ▲') : ''}${grip}</th>`;
    })
    .join('');
  $('grid-head')
    .querySelectorAll('th')
    .forEach((th) => {
      const k = th.dataset.key;
      // drag column width via the handle on the right
      const grip = th.querySelector('.col-resize');
      if (grip) {
        grip.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          resizing = true; // suppress the sort click after this
          const startX = e.clientX,
            startW = th.getBoundingClientRect().width;
          const grid = $('grid'),
            startTW = parseFloat(grid.style.width) || grid.getBoundingClientRect().width;
          th.draggable = false;
          // Table width moves along, otherwise the fixed layout redistributes the other columns.
          const move = (ev) => {
            const nw = Math.max(40, Math.round(startW + ev.clientX - startX));
            th.style.width = nw + 'px';
            grid.style.width = Math.round(startTW + (nw - startW)) + 'px';
            colWidths()[k] = nw;
          };
          const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            th.draggable = true;
            saveColW();
            renderVisible();
          };
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', up);
        });
        grip.addEventListener('click', (e) => {
          e.stopPropagation();
        }); // Resizing a column must not trigger sorting.
        grip.ondragstart = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };
      }
      const col = cols.find((c) => c.key === k);
      th.onclick = (e) => {
        if (col?.star) return;
        if (e.target.closest('.col-help')) return; // ? icon is for explanation only, not sorting
        if (resizing) {
          resizing = false;
          return;
        } // just narrowed/widened a column: no sorting
        if (state.sortKey === k) state.sortDir *= -1;
        else {
          state.sortKey = k;
          state.sortDir = k === 'pos' || k === 'name' || k === 'nat' ? 1 : -1;
        }
        sortRows();
        renderTable();
      };
      if (col?.star) return;
      // drag to reorder
      th.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', k);
        e.dataTransfer.effectAllowed = 'move';
        th.classList.add('dragging');
      };
      th.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        th.classList.add('drop-target');
      };
      th.ondragleave = () => th.classList.remove('drop-target');
      th.ondragend = () =>
        $('grid-head')
          .querySelectorAll('th')
          .forEach((x) => x.classList.remove('dragging', 'drop-target'));
      th.ondrop = (e) => {
        e.preventDefault();
        th.classList.remove('drop-target');
        reorderCol(e.dataTransfer.getData('text/plain'), k);
      };
    });
  renderVisible();
  if (measureRowH()) renderVisible(); // remeasure and reposition with true height
}

// right click on the headings → show/hide columns
$('grid-head').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  openColMenu(e.clientX, e.clientY);
});

function openColMenu(x, y) {
  closeColMenu();
  const cf = colCfg();
  const hidden = new Set(cf.hidden);
  // Columns under the hidden-stats toggle also do not belong in this menu if they are turned off.
  const base = baseCols().filter((c) => !c.star && !hiddenStatCol(c.key));
  const menu = document.createElement('div');
  menu.id = 'colmenu';
  menu.innerHTML =
    `<div class="cm-head">${text('colsTitle')}</div>` +
    base
      .map(
        (c) =>
          `<label class="cm-row"><input type="checkbox" data-k="${c.key}" ${hidden.has(c.key) ? '' : 'checked'}> ${colLabel(c)}</label>`,
      )
      .join('') +
    `<button class="cm-reset">${text('colsReset')}</button>`;
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 340) + 'px';
  document.body.appendChild(menu);
  menu.querySelectorAll('input[type=checkbox]').forEach(
    (cb) =>
      (cb.onchange = () => {
        const k = cb.dataset.k;
        const h = new Set(colCfg().hidden);
        if (cb.checked) h.delete(k);
        else h.add(k);
        colCfg().hidden = [...h];
        saveColCfg();
        renderTable();
      }),
  );
  menu.querySelector('.cm-reset').onclick = () => {
    state.colCfg[modeKey()] = {
      order: baseCols()
        .filter((c) => !c.star)
        .map((c) => c.key),
      hidden: [],
    };
    saveColCfg();
    renderTable();
    closeColMenu();
  };
}
function closeColMenu() {
  const m = $('colmenu');
  if (m) m.remove();
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#colmenu')) closeColMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeColMenu();
});
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
  const tag = ((e.target && e.target.tagName) || '').toLowerCase();
  if (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    !['players', 'shortlist', 'myplayer'].includes(state.mode) ||
    !state.filtered.length
  )
    return;
  e.preventDefault();
  const selectable = state.filtered.filter((p) => !p.job);
  selectable.forEach((p) => state.bulkSelected.add(p.id));
  state.bulkAnchor = state.filtered.findIndex((p) => !p.job);
  updateBulkBar();
  renderVisible();
  syncDetailToBulkSelection();
});
// Color loaned players by direction: blue for players loaned into another club, red for
// My Club players loaned out to another team.
function loanStatus(p) {
  const cl = (p.club || '').toLowerCase(),
    ow = (p.ownerClub || '').toLowerCase();
  if (!ow || !cl || ow === cl) return '';
  if ($('f-myclub').checked) {
    const my = (state.meta.myClub || '').toLowerCase();
    if (my && ow === my && cl !== my) return 'loan-out';
  }
  return 'loan-in';
}
function renderVisible() {
  const wrap = $('table-wrap'),
    cols = activeCols();
  const total = state.filtered.length;
  const first = Math.max(0, Math.floor(wrap.scrollTop / ROW_H) - 10);
  const count = Math.ceil(wrap.clientHeight / ROW_H) + 20;
  const last = Math.min(total, first + count);
  const slice = state.filtered.slice(first, last);
  const body = $('grid-body');
  // Virtualization via spacer rows within the tbody: total height = exactly total*ROW_H,
  // so you can never scroll past the list (no empty field on short lists).
  const ncol = cols.length;
  const topPad = first * ROW_H,
    botPad = (total - last) * ROW_H;
  const spacer = (h) =>
    h > 0
      ? `<tr class="vspacer"><td colspan="${ncol}" style="height:${h}px;padding:0;border:0"></td></tr>`
      : '';
  body.innerHTML =
    spacer(topPad) +
    slice
      .map((p, i) => {
        const idx = first + i;
        const tds = cols
          .map((c) => {
            const stick = c.star ? 'c-sticky' : c.name ? 'c-sticky stick-end' : '';
            if (c.star) {
              const on = state.shortlist.has(p.id);
              return `<td class="star-cell ${stick} ${on ? 'on' : ''}" data-star="${p.id}">${starSvg(15)}</td>`;
            }
            if (c.render) return `<td class="${c.num ? 'num' : ''}">${c.render(p)}</td>`;
            let v = c.get(p);
            if (c.name) {
              const ls = loanStatus(p);
              const lt =
                ls === 'loan-out'
                  ? ` · ${tf('loanOut', { c: p.club || '?' })}`
                  : ls === 'loan-in'
                    ? ` · ${tf('loanIn', { c: p.ownerClub || '?' })}`
                    : '';
              return `<td class="pname ${ls} ${stick}" data-tip="${escHtml(text('copyNameTip') + lt)}">${v ? escHtml(v) : '?'}</td>`;
            }
            if (c.dimNull && !v) return `<td class="dim">–</td>`;
            if (c.fmt) v = c.fmt(v);
            if (v == null || v === '') v = '–';
            // Only c.render() columns contain HTML. Escape dump values because custom databases
            // can contain arbitrary text.
            return `<td class="${c.num ? 'num' : ''} ${c.cls || ''} ${c.tdCls ? c.tdCls(p) : ''}">${escHtml(String(v))}</td>`;
          })
          .join('');
        const rowClasses =
          `${state.selected === p ? 'sel ' : ''}${state.bulkSelected.has(p.id) ? 'bulk-sel ' : ''}${idx % 2 ? 'even' : ''}`.trim();
        return `<tr data-i="${idx}" class="${rowClasses}" style="height:${ROW_H}px">${tds}</tr>`;
      })
      .join('') +
    spacer(botPad);
  body.querySelectorAll('tr[data-i]').forEach((tr) => {
    tr.onclick = (e) => {
      const star = e.target.closest('[data-star]');
      if (star) {
        toggleShortlist(+star.dataset.star);
        e.stopPropagation();
        return;
      }
      const p = state.filtered[+tr.dataset.i];
      // Clicking the name copies it and still follows the normal row-selection flow.
      if (e.target.closest('.pname')) copyName(p.name);
      if (
        state.mode !== 'staff' &&
        !p.job &&
        (state.mode === 'players' || state.mode === 'shortlist' || state.mode === 'myplayer')
      ) {
        const at = +tr.dataset.i;
        if (e.shiftKey && state.bulkAnchor != null) {
          // Shift extends from the anchor, replacing the previous range unless
          // Ctrl/Cmd is also held (Excel-style additive range selection).
          if (!(e.ctrlKey || e.metaKey)) state.bulkSelected.clear();
          const lo = Math.min(state.bulkAnchor, at),
            hi = Math.max(state.bulkAnchor, at);
          for (let j = lo; j <= hi; j++)
            if (!state.filtered[j].job) state.bulkSelected.add(state.filtered[j].id);
        } else if (e.ctrlKey || e.metaKey) {
          if (state.bulkSelected.has(p.id)) state.bulkSelected.delete(p.id);
          else state.bulkSelected.add(p.id);
          state.bulkAnchor = at;
        } else {
          // A plain click starts a new selection, just like a spreadsheet.
          state.bulkSelected.clear();
          state.bulkSelected.add(p.id);
          state.bulkAnchor = at;
        }
        updateBulkBar();
        renderVisible();
        syncDetailToBulkSelection();
        e.stopPropagation();
        return;
      }
      if (p.job && state.bulkSelected.size) {
        state.bulkSelected.clear();
        state.bulkAnchor = null;
        updateBulkBar();
      }
      showDetail(p);
    };
  });
}
let lastScrollRow = -1;
$('table-wrap').addEventListener('scroll', () => {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    // Horizontal scrolling and movement within the same row do not change the visible row window.
    // Skip rebuilding its HTML and event handlers until the first visible row changes.
    // Other callers refresh explicitly when filters, shortlist, or currency changes.
    const row = Math.floor($('table-wrap').scrollTop / ROW_H);
    if (row === lastScrollRow) return;
    lastScrollRow = row;
    renderVisible();
  });
});

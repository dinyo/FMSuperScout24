// ---------- app-style help tooltip ----------
// Elements with a data-help key show an app-style tooltip on hover.
// Labels come from the English text catalogue; data-tip accepts literal text such as chart values.
function initHelpTip() {
  const tip = document.createElement('div');
  tip.id = 'help-tip';
  tip.className = 'hidden';
  document.body.appendChild(tip);
  let cur = null,
    timer = 0,
    warmUntil = 0;
  const hide = () => {
    cur = null;
    clearTimeout(timer);
    tip.classList.add('hidden');
  };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-help],[data-tip]');
    if (el === cur) return;
    clearTimeout(timer);
    const wasVisible = !tip.classList.contains('hidden');
    if (!el) {
      // After a tooltip closes, briefly show the next one without a delay.
      if (wasVisible) warmUntil = Date.now() + 400;
      hide();
      return;
    }
    cur = el;
    const show = () => {
      tip.textContent = el.dataset.tip ?? text(el.dataset.help);
      tip.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      tip.style.left = '0px';
      tip.style.top = '0px'; // first measure at (0,0)
      const tw = tip.offsetWidth,
        th = tip.offsetHeight;
      let xPos = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
      let yPos = r.bottom + 8;
      if (yPos + th > window.innerHeight - 8) yPos = r.top - th - 8;
      tip.style.left = xPos + 'px';
      tip.style.top = yPos + 'px';
    };
    // Delay prevents flickering tips as you move the mouse over the table
    // (each name cell has one). Moving directly from tip to tip remains instant.
    if (wasVisible || Date.now() < warmUntil) show();
    else timer = setTimeout(show, 450);
  });
  document.addEventListener('scroll', hide, true);
}
initHelpTip();

// ---------- update notifications ----------
// Check GitHub for a newer release at most once every 20 hours and show a top-bar update pill.
// Background checks fail silently. A manual check bypasses the cache and returns errors to Settings.
async function checkUpdate(force = false) {
  try {
    let chk = {};
    try {
      chk = JSON.parse(localStorage.getItem('fmss_updchk') || '{}');
    } catch {}
    if (force || !chk.at || Date.now() - chk.at > 20 * 3600e3) {
      // The server will only search for releases with the unique FMSuperScout24 installation file.
      // For example, this edition will never be offered an update to the original app.
      const res = await fetch('/api/version-check');
      if (!res.ok) throw new Error('Failed to check for updates.');
      const tag = (await res.json()).tag;
      if (!tag) return { newer: false, tag: null };
      chk = { at: Date.now(), tag };
      localStorage.setItem('fmss_updchk', JSON.stringify(chk));
    }
    if (!chk.tag) return { newer: false, tag: null };
    const norm = (v) =>
      String(v)
        .replace(/^v/, '')
        .split('.')
        .map((n) => parseInt(n) || 0);
    const [l, c] = [norm(chk.tag), norm(APP_VERSION)];
    const newer =
      l[0] !== c[0] ? l[0] > c[0] : l[1] !== c[1] ? l[1] > c[1] : (l[2] || 0) > (c[2] || 0);
    if (force) localStorage.removeItem('fmss_upd_dismiss'); // Reopen the update pill after a manual check.
    if (!newer || localStorage.getItem('fmss_upd_dismiss') === chk.tag)
      return { newer, tag: chk.tag };
    const el = $('update-pill');
    el.innerHTML = `<a href="${REPO_URL}/releases/tag/${encodeURIComponent(chk.tag)}" target="_blank" rel="noopener">${tf('updateAvail', { v: chk.tag })}</a>
      <button title="${text('donateLater')}">${icon('x', 10)}</button>`;
    el.classList.remove('hidden');
    // Clicking downloads and starts the installer; the server verifies its SHA-256.
    // If installation fails, keep a link to the release page available.
    el.querySelector('a').onclick = (e) => {
      e.preventDefault();
      startSelfUpdate(el);
    };
    el.querySelector('button').onclick = () => {
      localStorage.setItem('fmss_upd_dismiss', chk.tag);
      el.classList.add('hidden');
    };
    return { newer, tag: chk.tag };
  } catch (e) {
    if (force) throw e; // Show errors from manual checks; keep background checks silent.
  }
}

// The server downloads and verifies the installer, then starts it. Show progress in the pill.
// Once the server reports launch or its connection closes, show the completion message.
async function startSelfUpdate(el) {
  const setTxt = (txt, cls = '') => {
    el.innerHTML = `<span class="${cls}">${escHtml(txt)}</span>`;
  };
  try {
    setTxt(tf('updDl', { pct: 0 }));
    await fetch('/api/update-install', { method: 'POST' });
    for (;;) {
      await new Promise((r) => setTimeout(r, 500));
      let st;
      try {
        st = await (await fetch('/api/update-status')).json();
      } catch {
        break;
      } // server already stopped for the installer
      if (st.phase === 'downloading') setTxt(tf('updDl', { pct: st.pct || 0 }));
      else if (st.phase === 'verifying') setTxt(text('updVerify'));
      else if (st.phase === 'launching') break;
      else if (st.phase === 'error') {
        el.innerHTML = `<a href="${REPO_URL}/releases/latest" target="_blank" rel="noopener">${escHtml(text('updErr'))}</a>`;
        console.error('update:', st.error);
        return;
      }
    }
    setTxt(text('updLaunch'));
  } catch {
    el.innerHTML = `<a href="${REPO_URL}/releases/latest" target="_blank" rel="noopener">${escHtml(text('updErr'))}</a>`;
  }
}

// ---------- report a problem ----------
// Open a pre-filled GitHub issue with available environment details. The user can add
// a description and attach diagnostic files.
async function reportBug() {
  // Include the diagnostics header through the first blank line. It contains the data source,
  // memory status, and phase timings needed to investigate a report.
  let diag = [];
  try {
    const r = await fetch('/api/diagnostics');
    if (r.ok) {
      const head = (await r.text()).split(/\r?\n/).slice(0, 12);
      const cut = head.findIndex((l) => !l.trim());
      diag = [
        '',
        '### Last scan telemetry (auto-filled from diagnostics.txt)',
        '```',
        ...(cut < 0 ? head : head.slice(0, cut)),
        '```',
      ];
    }
  } catch {
    /* no server or no diagnostics: simply omit section */
  }
  const m = state.meta || {};
  const body = [
    '### What happened?',
    '',
    '_Describe the problem here._',
    '',
    '### Environment (auto-filled)',
    `- FMSuperScout 24 app: v${APP_VERSION}`,
    `- Reader: ${m.pluginVersion || 'unknown (no dump loaded)'}`,
    `- FM game version: ${m.gameVersion || 'unknown'} (supported: ${m.supportedVersion || '?'}, ok: ${m.versionOk ?? '?'})`,
    `- Players/staff loaded: ${state.players.length} / ${state.staff.length}`,
    ...(lastStatus && lastStatus.dumpSize
      ? [
          `- Dump on disk: ${(lastStatus.dumpSize / 1048576).toFixed(0)} MB (${lastStatus.dumpFile || 'dump.json'})`,
        ]
      : []),
    ...(loadError ? [`- Load error: ${loadError.msg}`] : []),
    `- Platform: Steam / Epic / Game Pass? _(fill in)_`,
    ...diag,
    '',
    '### Attach these files (important!)',
    'From `%LOCALAPPDATA%\\FMSuperScout24\\`: `diagnostics.txt` and `status.json`.',
    'Reader diagnostics are in `%LOCALAPPDATA%\\FMSuperScout24\\diagnostics.txt`.',
  ].join('\n');
  window.open(
    `${REPO_URL}/issues/new?title=${encodeURIComponent('[bug] ')}&body=${encodeURIComponent(body)}`,
    '_blank',
    'noopener',
  );
}

// ---------- support (Ko-fi): one season report per football season ----------
// Show one report card when the in-game season rolls over on July 1.
// Users can dismiss it, mark themselves as supporters, or opt out of future prompts.
// Supporters receive a gold coffee icon.
const KOFI = 'https://ko-fi.com/fmsuperscout';
function openKofi() {
  window.open(KOFI, '_blank', 'noopener');
}
const kofiOff = () => localStorage.getItem('fmss_kofi_off') === '1';
// Usage counters for the report; the baseline is shifted with each report so that
// the figures are per season, not cumulative.
function bumpStat(k) {
  try {
    localStorage.setItem(k, String((+localStorage.getItem(k) || 0) + 1));
  } catch {}
}

// July 1 starts a new football season. If the exact date is unavailable, use the season year
// included in the dump.
function seasonYearOf() {
  const ds = state.meta.gameDate;
  if (ds) {
    const d = parseGameDate(ds);
    if (!isNaN(d)) return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  }
  return state.meta.gameYear || 0;
}
function maybeSeasonReport() {
  if (kofiOff()) return;
  const y = seasonYearOf();
  if (!y) return;
  const prev = +localStorage.getItem('fmss_season') || 0;
  if (!prev || y < prev) {
    // Initialize the baseline on the first dump or when an older save is loaded.
    localStorage.setItem('fmss_season', String(y));
    return;
  }
  if (y === prev) return;
  localStorage.setItem('fmss_season', String(y));
  // Avoid showing another report immediately when the user switches to a different save.
  // The seasonal baseline shifts to the newly loaded career.
  const lastAt = +localStorage.getItem('fmss_season_at') || 0;
  if (Date.now() - lastAt < 7 * 864e5) return;
  localStorage.setItem('fmss_season_at', String(Date.now()));

  let base;
  try {
    base = JSON.parse(localStorage.getItem('fmss_season_base') || '{}');
  } catch {
    base = {};
  }
  const cur = {
    uses: +localStorage.getItem('fmss_uses') || 0,
    loads: +localStorage.getItem('fmss_loads') || 0,
    cards: +localStorage.getItem('fmss_cards') || 0,
  };
  try {
    localStorage.setItem('fmss_season_base', JSON.stringify(cur));
  } catch {}
  const n = (k) => Math.max(0, cur[k] - (+base[k] || 0));
  const stats = [];
  if (n('uses') > 0)
    stats.push(tf('seasonStatProfiles', { n: n('uses').toLocaleString(FORMAT_LOCALE) }));
  if (n('loads') > 0) stats.push(tf('seasonStatLoads', { n: n('loads') }));
  if (n('cards') > 0) stats.push(tf('seasonStatCards', { n: n('cards') }));
  if (state.shortlist.size > 0) stats.push(tf('seasonStatShort', { n: state.shortlist.size }));

  const season = `${y - 1}/${String(y).slice(2)}`;
  // The first report can be dismissed but does not offer a permanent opt-out.
  // Show the opt-out on later reports; the supporter option is always available.
  const shown = +localStorage.getItem('fmss_season_n') || 0;
  localStorage.setItem('fmss_season_n', String(shown + 1));
  const el = $('donate-nudge');
  el.innerHTML = `<button class="dn-x" title="${text('donateLater')}">${icon('x', 12)}</button>
    <div class="dn-title">${icon('ball', 15)} ${escHtml(tf('seasonTitle', { s: season }))}</div>
    ${stats.length ? `<div class="dn-stats">${stats.join(' · ')}</div>` : ''}
    <div class="dn-text">${text('seasonAsk')}</div>
    <div class="dn-actions"><a class="dn-cta" href="${KOFI}" target="_blank" rel="noopener">${text('donateCta')}</a>
      <button class="dn-later">${text('donateLater')}</button></div>
    <div class="dn-links"><button class="dn-donated">${text('alreadyDonated')}</button>${shown >= 1 ? `<button class="dn-never">${text('neverAsk')}</button>` : ''}</div>`;
  el.classList.remove('hidden');
  const close = () => el.classList.add('hidden');
  el.querySelector('.dn-cta').onclick = close;
  el.querySelector('.dn-later').onclick = close;
  el.querySelector('.dn-x').onclick = close;
  el.querySelector('.dn-donated').onclick = () => {
    localStorage.setItem('fmss_kofi_off', '1');
    localStorage.setItem('fmss_supporter', '1');
    $('btn-coffee').classList.add('supporter');
    showToast(text('supporterThanks'), 'check');
    close();
  };
  const nv = el.querySelector('.dn-never');
  if (nv)
    nv.onclick = () => {
      localStorage.setItem('fmss_kofi_off', '1');
      close();
    };
}

// ---------- player comparison ----------
const findPlayer = (id) =>
  state.players.find((p) => p.id === id) || state.staff.find((p) => p.id === id);
function toggleCompare(id) {
  const i = state.compare.indexOf(id);
  if (i >= 0) state.compare.splice(i, 1);
  else {
    if (state.compare.length >= 3) {
      showToast(text('compareFull'));
      return;
    }
    state.compare.push(id);
  }
  renderCompareTray();
}
function renderCompareTray() {
  const tray = $('compare-tray');
  if (!state.compare.length) {
    tray.classList.add('hidden');
    return;
  }
  tray.classList.remove('hidden');
  const chips = state.compare
    .map((id) => {
      const p = findPlayer(id);
      return `<span class="ct-chip" data-id="${id}">${p ? escHtml(p.name) : '?'}<span class="x" data-rm="${id}">${icon('x', 10)}</span></span>`;
    })
    .join('');
  tray.innerHTML =
    `<div class="ct-label">${text('comparing')}</div>${chips}` +
    `<button class="ct-go" ${state.compare.length < 2 ? 'disabled' : ''}>${text('compare')} (${state.compare.length})</button>` +
    `<button class="ct-clear" title="${text('clear')}">${icon('x', 13)}</button>`;
  tray.querySelectorAll('[data-rm]').forEach(
    (x) =>
      (x.onclick = (e) => {
        e.stopPropagation();
        toggleCompare(+x.dataset.rm);
      }),
  );
  tray.querySelectorAll('.ct-chip').forEach(
    (c) =>
      (c.onclick = () => {
        const p = findPlayer(+c.dataset.id);
        if (p) showDetail(p);
      }),
  );
  tray.querySelector('.ct-go').onclick = openCompare;
  tray.querySelector('.ct-clear').onclick = () => {
    state.compare = [];
    renderCompareTray();
  };
}
function bestRoleScore(p) {
  const b = bestRoles(p, 1)[0];
  return b ? { name: roleName(b.id), score: b.score } : null;
}
function openCompare() {
  const players = state.compare.map(findPlayer).filter(Boolean);
  if (players.length < 2) return;
  const n = players.length;
  const two = n === 2; // with exactly 2 players there is a Δ column; at 3 the row marks the winner

  // Best/worst per row (hi=false: low is better; hi=null: neutral, no marking).
  const marksOf = (vals, hi) => {
    const nums = vals.filter((v) => v != null);
    if (hi == null || nums.length < 2) return vals.map(() => '');
    const best = hi ? Math.max(...nums) : Math.min(...nums);
    const worst = hi ? Math.min(...nums) : Math.max(...nums);
    if (best === worst) return vals.map(() => '');
    return vals.map((v) =>
      v == null ? '' : v === best ? 'cmp-best' : v === worst ? 'cmp-worst' : '',
    );
  };
  // Δ cell (only with 2 players): player 1 − player 2, green if player 1 is better off.
  const deltaCell = (vals, hi, fmtAbs) => {
    if (!two) return '';
    const [a, b] = vals;
    if (a == null || b == null)
      return '<div class="cmp-cell cmp-delta"><span class="dim">·</span></div>';
    const d = a - b;
    const cls =
      d === 0 || hi == null ? 'cmp-dzero' : d > 0 === (hi !== false) ? 'cmp-dpos' : 'cmp-dneg';
    const txt = d === 0 ? '=' : (d > 0 ? '+' : '−') + fmtAbs(Math.abs(d));
    return `<div class="cmp-cell cmp-delta"><span class="${cls}">${txt}</span></div>`;
  };
  // Generic row. opts: hi (true/false/null), fmt, dec (decimal), attr (FM color),
  // invert (high=bad → inverted color, e.g. injury sensitivity).
  const row = (label, vals, opts = {}) => {
    const hi = 'hi' in opts ? opts.hi : true;
    const fmtV = opts.fmt || ((v) => (opts.dec ? v.toFixed(opts.dec) : String(v)));
    const marks = marksOf(vals, hi);
    const cells = vals
      .map((v, i) => {
        if (v == null) return '<div class="cmp-cell"><span class="dim">·</span></div>';
        const color = opts.attr ? ' ' + (opts.invert ? attrClass(21 - v) : attrClass(v)) : '';
        return `<div class="cmp-cell"><span class="v${color} ${marks[i]}">${fmtV(v)}</span></div>`;
      })
      .join('');
    return `<div class="cmp-row"><div class="cmp-lbl">${label}</div>${cells}${deltaCell(vals, hi, fmtV)}</div>`;
  };
  const textRow = (label, vals) =>
    `<div class="cmp-row"><div class="cmp-lbl">${label}</div>` +
    vals
      .map((v) => `<div class="cmp-cell">${v ? escHtml(v) : '<span class="dim">·</span>'}</div>`)
      .join('') +
    (two ? '<div class="cmp-cell cmp-delta"></div>' : '') +
    '</div>';

  // ----- win count (for the header badge): for how many attributes is uniquely the best? -----
  const isGk = players.every((p) => (p.posArr || []).includes('GK'));
  const groups = isGk ? ATTR_GROUPS_GK : ATTR_GROUPS_OUTFIELD;
  const wins = players.map(() => 0);
  for (const [, keys] of groups)
    for (const k of keys) {
      const vals = players.map((p) => (p.attrs ? p.attrs[k] : null));
      const nums = vals.filter((v) => v != null);
      if (nums.length < 2) continue;
      const best = Math.max(...nums);
      const idx = vals.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
      if (idx.length === 1 && best !== Math.min(...nums)) wins[idx[0]]++;
    }

  // ----- header: own sticky grid above the entire scroll (names + master data always visible) -----
  const headRow =
    `<div class="cmp-row cmp-head"><div class="cmp-lbl"></div>` +
    players
      .map((p, i) => {
        const ev = fmValue(p);
        const val = ev.v != null ? fmValueText(p) : null;
        const bits = [
          val,
          p.wage > 0 ? fmtWage(p.wage) + ' ' + wageSuf() : null,
          p.expires ? String(p.expires).slice(0, 4) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          `<div class="cmp-cell"><div class="cmp-name">${escHtml(p.name)}</div>` +
          `<div class="cmp-meta">${getAge(p)} · ${escHtml(p.pos || jobLabel(p))} · ${p.club ? escHtml(p.club) : '–'}` +
          `${bits ? `<br>${bits}` : ''}` +
          `${p.attrs ? `<br><span class="cmp-winsb">${tf('cmpWinsBadge', { n: wins[i] })}</span>` : ''}</div></div>`
        );
      })
      .join('') +
    (two ? `<div class="cmp-cell cmp-delta" data-help="cmpDeltaHint">Δ</div>` : '') +
    '</div>';

  // ----- key figures -----
  let body = '';
  if (!state.hideCapa) {
    body += row(
      'CA',
      players.map((p) => p.ca),
    );
    body += row(
      'PA',
      players.map((p) => p.pa),
    );
  }
  if (!state.hideMeta)
    body += row(
      text('c_meta'),
      players.map((p) => metaScore(p)),
      { fmt: (v) => v.toFixed(2) },
    );
  if (!state.hideMeta && !state.hideCapa)
    body += row(
      text('c_metapa'),
      players.map((p) => metaPaScore(p)),
      { fmt: (v) => v.toFixed(2) },
    );
  body += textRow(text('cmpValue'), players.map((p) => fmValueText(p)));
  body += row(
    text('c_fee'),
    players.map((p) => fmAskingPrice(p).v),
    { fmt: fmtMoney, hi: false },
  );
  body += row(
    text('wageLabel') + ' ' + wageSuf(),
    players.map((p) => p.wage),
    { fmt: fmtWage, hi: false },
  );
  body += row(
    text('c_age'),
    players.map((p) => getAge(p)),
    { hi: false },
  );
  body += row(
    text('height'),
    players.map((p) => p.height || null),
    { fmt: (v) => v + ' cm', hi: null },
  );
  body += textRow(
    text('contractLabel'),
    players.map((p) => fmtDate(p.expires)),
  );
  body += textRow(
    text('foot'),
    players.map((p) => footLabel(p)),
  );
  const roles = players.map(bestRoleScore);
  body +=
    `<div class="cmp-row"><div class="cmp-lbl">${text('cmpTopRole')}</div>` +
    roles
      .map(
        (r) =>
          `<div class="cmp-cell">${r ? `${r.name}<br><b class="${roleClass(r.score)}">${r.score.toFixed(1)}</b>` : '<span class="dim">·</span>'}</div>`,
      )
      .join('') +
    (two ? '<div class="cmp-cell cmp-delta"></div>' : '') +
    '</div>';

  // ----- attributes: two columns with panels, FM style rows -----
  // With 2 players per row: name | value1 | comparison bar | value2 (like FM itself):
  // the bar points with color and height to who is better (green = player 1, blue =
  // player 2), height ∝ the difference. With 3 players: name | w1 w2 w3 with winner marking.
  const cmpBar = (a, b, hi, dec) => {
    if (a == null || b == null || hi == null)
      return '<span class="cbar"><i class="cb-tick"></i></span>';
    const d = a - b;
    const p1beter = d > 0 === (hi !== false);
    const pct = Math.min(100, Math.round((Math.abs(d) / 8) * 100)); // 8 points difference = full
    const dTxt =
      d === 0 ? '=' : (d > 0 ? '+' : '−') + (dec ? Math.abs(d).toFixed(dec) : Math.abs(d));
    return (
      `<span class="cbar" data-tip="Δ ${escHtml(dTxt)}"><i class="cb-tick"></i>` +
      (d === 0
        ? ''
        : `<i class="${p1beter ? 'cb-l' : 'cb-r'}" style="width:${Math.max(6, pct / 2)}%"></i>`) +
      '</span>'
    );
  };
  const attrPanelRow = (label, vals, opts = {}) => {
    const hi = 'hi' in opts ? opts.hi : true;
    const marks = marksOf(vals, hi);
    const fmtV = (v) => (opts.dec ? v.toFixed(opts.dec) : String(v));
    const cellV = (v, i) =>
      v == null
        ? '<span class="cpv dim">·</span>'
        : `<span class="cpv v ${opts.invert ? attrClass(21 - v) : attrClass(v)} ${marks[i]}">${fmtV(v)}</span>`;
    if (two)
      return `<div class="cpr${opts.foot ? ' cpr-foot' : ''}"><span class="cpl">${label}</span>${cellV(vals[0], 0)}${cmpBar(vals[0], vals[1], hi, opts.dec)}${cellV(vals[1], 1)}</div>`;
    return `<div class="cpr cpr3${opts.foot ? ' cpr-foot' : ''}"><span class="cpl">${label}</span>${vals.map((v, i) => cellV(v, i)).join('')}</div>`;
  };
  const panel = (title, rowsHtml) =>
    rowsHtml ? `<div class="cmpg"><h3>${title}</h3>${rowsHtml}</div>` : '';
  const buildGroup = (gkey, keys) => {
    const present = sortByLabel(keys || []).filter((k) =>
      players.some((p) => p.attrs && p.attrs[k] != null),
    );
    if (!present.length) return '';
    let rows = present
      .map((k) =>
        attrPanelRow(
          attrName(k),
          players.map((p) => (p.attrs ? p.attrs[k] : null)),
        ),
      )
      .join('');
    // FM style footer: group average with its own comparison bar.
    if (present.length >= 3) {
      const avgs = players.map((p) => {
        const vs = present.map((k) => (p.attrs ? p.attrs[k] : null)).filter((v) => v != null);
        return vs.length ? Math.round((10 * vs.reduce((s, v) => s + v, 0)) / vs.length) / 10 : null;
      });
      rows += attrPanelRow(text('avgLabel'), avgs, { dec: 1, foot: true });
    }
    return panel(text(gkey), rows);
  };

  let panels = '';
  if (players.some((p) => p.attrs)) {
    const gmap = Object.fromEntries(groups.map(([k, keys]) => [k, keys]));
    // Hidden features + personality (same visibility rule as the details panel).
    let hidPanel = '',
      persPanel = '';
    if (!state.hideCapa) {
      const hid = [
        ['Consistency', true],
        ['ImportantMatches', true],
        ['Versatility', true],
        ['InjuryProneness', false],
        ['Dirtiness', false],
      ].filter(([k]) => players.some((p) => p.attrs && p.attrs[k] > 0));
      hidPanel = panel(
        text('hiddenTitle'),
        hid
          .map(([k, good]) =>
            attrPanelRow(
              text('a_' + k),
              players.map((p) => (p.attrs && p.attrs[k] > 0 ? p.attrs[k] : null)),
              { hi: good, invert: !good },
            ),
          )
          .join(''),
      );
      const pers = [
        ['ambition', true],
        ['professionalism', true],
        ['loyalty', null],
        ['pressure', true],
        ['temperament', true],
        ['sportsmanship', null],
        ['adaptability', true],
        ['controversy', false],
      ].filter(([k]) => players.some((p) => p[k] > 0));
      persPanel = panel(
        text('personaTitle'),
        pers
          .map(([k, dir]) =>
            attrPanelRow(
              text(k),
              players.map((p) => (p[k] > 0 ? p[k] : null)),
              { hi: dir, invert: dir === false },
            ),
          )
          .join(''),
      );
    }
    // Put longer groups on the left and shorter groups on the right to reduce empty space.
    // hidden left and personality right keeps both columns in balance.
    const leftStack =
      buildGroup(
        isGk ? 'g_goalkeeping' : 'g_technical',
        gmap[isGk ? 'g_goalkeeping' : 'g_technical'],
      ) +
      buildGroup('g_physical', gmap.g_physical) +
      hidPanel;
    const rightStack =
      buildGroup('g_mental', gmap.g_mental) +
      buildGroup('g_setpieces', gmap.g_setpieces) +
      persPanel;
    if (leftStack || rightStack)
      panels = `<div class="cmp-panels"><div>${leftStack}</div><div>${rightStack}</div></div>`;
  }

  const cols = two ? '130px 1fr 1fr 72px' : `130px repeat(${n}, 1fr)`;
  $('compare-inner').innerHTML =
    `<div class="cmp-top"><h2>${text('cmpTitle')}</h2><button id="cmp-close">${icon('x', 15)}</button></div>` +
    `<div class="cmp-scroll">` +
    `<div class="cmp-grid cmp-headgrid" style="grid-template-columns:${cols}">${headRow}</div>` +
    `<div class="cmp-grid" style="grid-template-columns:${cols}">${body}</div>${panels}</div>`;
  $('compare-modal').classList.remove('hidden');
  $('cmp-close').onclick = closeCompare;
}
function closeCompare() {
  $('compare-modal').classList.add('hidden');
}
$('compare-modal').addEventListener('click', (e) => {
  if (e.target.id === 'compare-modal') closeCompare();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('compare-modal').classList.contains('hidden')) closeCompare();
});

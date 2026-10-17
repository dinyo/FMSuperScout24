// ================= SVG icons =================
// One style (stroke, currentColor) that matches the existing UI icons; no emoji.
// Exception: the coffee icon (☕) deliberately remains an emoji.
const ICON_PATHS = {
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  hourglass:
    '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
  warning:
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  clipboard:
    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  compare:
    '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  card: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  // Football: a filled center pentagon with five thin seams extending to the edge.
  // Thin seams keep the icon recognizable as a ball rather than a steering wheel.
  ball: '<g stroke-width="1.1"><circle cx="12" cy="12" r="10.2"/><path d="M12 8.8 12 1.8 M15.1 11.05 21.7 8.9 M13.9 14.7 18 20.4 M10.1 14.7 6 20.4 M8.9 11.05 2.3 8.9 M4.6 17.2 7.4 16.4 M19.4 17.2 16.6 16.4 M6 4.5 8.2 6.3 M18 4.5 15.8 6.3"/></g><polygon points="12,8.8 15.1,11.05 13.9,14.7 10.1,14.7 8.9,11.05" fill="currentColor" stroke="none"/>',
};
const icon = (name, size = 14) =>
  `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
// The .on class controls whether the shortlist star is filled.
const starSvg = (size = 15) =>
  `<svg class="ic star-ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96z"/></svg>`;
// Combine an icon with safely escaped text from the dump.
const bannerMsg = (ico, txt) => icon(ico, 13) + ' ' + escHtml(txt);
// Show real scan or download progress as a fraction from 0 to 1.
const bannerProgress = (ico, txt, frac) => {
  const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
  return `${bannerMsg(ico, txt)} <span class="pbar"><span class="pfill" style="width:${pct}%"></span></span> <span class="ppct">${pct}%</span>`;
};

// ================= attributes =================
// This order controls the two-column pairing: Technical/Mental above, Physical/Set Pieces below.
// Pair longer groups together and shorter groups together to reduce empty space.
const ATTR_GROUPS_OUTFIELD = [
  [
    'g_technical',
    [
      'Crossing',
      'Dribbling',
      'Finishing',
      'FirstTouch',
      'Heading',
      'LongShots',
      'Marking',
      'Passing',
      'Tackling',
      'Technique',
    ],
  ],
  [
    'g_mental',
    [
      'Aggression',
      'Anticipation',
      'Bravery',
      'Composure',
      'Concentration',
      'Decisions',
      'Determination',
      'Flair',
      'Leadership',
      'OffTheBall',
      'Positioning',
      'Teamwork',
      'Vision',
      'WorkRate',
    ],
  ],
  [
    'g_physical',
    [
      'Acceleration',
      'Agility',
      'Balance',
      'JumpingReach',
      'NaturalFitness',
      'Pace',
      'Stamina',
      'Strength',
    ],
  ],
  ['g_setpieces', ['Corners', 'FreeKicks', 'PenaltyTaking', 'LongThrows']],
];
const ATTR_GROUPS_GK = [
  [
    'g_goalkeeping',
    [
      'AerialReach',
      'CommandOfArea',
      'Communication',
      'Eccentricity',
      'FirstTouch',
      'Handling',
      'Kicking',
      'OneOnOnes',
      'Passing',
      'Punching',
      'Reflexes',
      'RushingOut',
      'Throwing',
      'Technique',
    ],
  ],
  [
    'g_mental',
    [
      'Aggression',
      'Anticipation',
      'Bravery',
      'Composure',
      'Concentration',
      'Decisions',
      'Determination',
      'Flair',
      'Leadership',
      'OffTheBall',
      'Positioning',
      'Teamwork',
      'Vision',
      'WorkRate',
    ],
  ],
  [
    'g_physical',
    [
      'Acceleration',
      'Agility',
      'Balance',
      'JumpingReach',
      'NaturalFitness',
      'Pace',
      'Stamina',
      'Strength',
    ],
  ],
  ['g_setpieces', ['Corners', 'FreeKicks', 'PenaltyTaking', 'LongThrows']],
];
const ATTR_LABEL = {
  Corners: 'Corners',
  Crossing: 'Crossing',
  Dribbling: 'Dribbling',
  Finishing: 'Finishing',
  FirstTouch: 'First Touch',
  FreeKicks: 'Free Kicks',
  Heading: 'Heading',
  LongShots: 'Long Shots',
  LongThrows: 'Long Throws',
  Marking: 'Marking',
  Passing: 'Passing',
  PenaltyTaking: 'Penalty Taking',
  Tackling: 'Tackling',
  Technique: 'Technique',
  Aggression: 'Aggression',
  Anticipation: 'Anticipation',
  Bravery: 'Bravery',
  Composure: 'Composure',
  Concentration: 'Concentration',
  Decisions: 'Decisions',
  Determination: 'Determination',
  Flair: 'Flair',
  Leadership: 'Leadership',
  OffTheBall: 'Off the Ball',
  Positioning: 'Positioning',
  Teamwork: 'Teamwork',
  Vision: 'Vision',
  WorkRate: 'Work Rate',
  Acceleration: 'Acceleration',
  Agility: 'Agility',
  Balance: 'Balance',
  JumpingReach: 'Jumping Reach',
  NaturalFitness: 'Natural Fitness',
  Pace: 'Pace',
  Stamina: 'Stamina',
  Strength: 'Strength',
  AerialReach: 'Aerial Reach',
  CommandOfArea: 'Command of Area',
  Communication: 'Communication',
  Eccentricity: 'Eccentricity',
  Handling: 'Handling',
  Kicking: 'Kicking',
  OneOnOnes: 'One on Ones',
  Punching: 'Punching',
  Reflexes: 'Reflexes',
  RushingOut: 'Rushing Out',
  Throwing: 'Throwing',
};
const attrName = (key) => ATTR_LABEL[key] ?? key;

// English labels for staff attributes exported by the plugin (plugin/Fields.cs StaffAttrs).
const STAFF_ATTR_LABEL = {
  Aanvallen: 'Attacking',
  Verdedigen: 'Defending',
  Fitheid: 'Fitness',
  Balbezit: 'Possession',
  Technisch: 'Technical',
  Tactisch: 'Tactical',
  Standaardsituaties: 'Set Pieces',
  Vastberadenheid: 'Determination',
  LevelOfDiscipline: 'Level of Discipline',
  'Man-management': 'Man Management',
  Motiveren: 'Motivating',
  Oordeel_vermogen: 'Judging Player Ability',
  Oordeel_potentie: 'Judging Player Potential',
  Oordeel_staf: 'Judging Staff Ability',
  Onderhandelen: 'Negotiating',
  Tactische_kennis: 'Tactical Knowledge',
  Fysiotherapie: 'Physiotherapy',
  Sportwetenschap: 'Sports Science',
  Data_analyse: 'Data Analysis',
  Jeugd: 'Working With Youngsters',
  KV_distributie: 'GK Distribution',
  KV_vangen: 'GK Handling',
  KV_reflexen: 'GK Shot Stopping',
};
const staffAttrName = (key) => STAFF_ATTR_LABEL[key] ?? key.replace(/_/g, ' ');
const isStaffAttrKey = (k) => typeof k === 'string' && k in STAFF_ATTR_LABEL;
const STAFF_ATTR_GROUPS = [
  [
    'g_coaching',
    [
      'Aanvallen',
      'Verdedigen',
      'Fitheid',
      'Balbezit',
      'Technisch',
      'Tactisch',
      'Standaardsituaties',
    ],
  ],
  ['g_mental', ['Vastberadenheid', 'LevelOfDiscipline', 'Man-management', 'Motiveren']],
  [
    'g_knowledge',
    [
      'Oordeel_vermogen',
      'Oordeel_potentie',
      'Oordeel_staf',
      'Onderhandelen',
      'Tactische_kennis',
      'Fysiotherapie',
      'Sportwetenschap',
      'Data_analyse',
      'Jeugd',
    ],
  ],
  ['g_gkCoaching', ['KV_distributie', 'KV_vangen', 'KV_reflexen']],
];

// Sort attributes alphabetically by their English labels, as shown in the profile, comparison, and filter.
const sortByLabel = (keys) =>
  [...keys].sort((a, b) => attrName(a).localeCompare(attrName(b), 'en'));

// ---------- EU/EEA countries ----------
// Keep common country-name variants for EU checks on older dumps.
// Prefer the stable nation ID whenever the dump provides one.
const EU_NATIONS = new Set(
  [
    // Dutch country names.
    'Nederland',
    'België',
    'Duitsland',
    'Frankrijk',
    'Italië',
    'Spanje',
    'Portugal',
    'Ierland',
    'Oostenrijk',
    'Polen',
    'Zweden',
    'Denemarken',
    'Finland',
    'Tsjechië',
    'Slowakije',
    'Hongarije',
    'Roemenië',
    'Bulgarije',
    'Griekenland',
    'Kroatië',
    'Slovenië',
    'Luxemburg',
    'Estland',
    'Letland',
    'Litouwen',
    'Malta',
    'Cyprus',
    'Noorwegen',
    'IJsland',
    'Liechtenstein',
    'Zwitserland',
    // English country names.
    'Netherlands',
    'Belgium',
    'Germany',
    'France',
    'Italy',
    'Spain',
    'Ireland',
    'Austria',
    'Poland',
    'Sweden',
    'Denmark',
    'Czechia',
    'Czech Republic',
    'Slovakia',
    'Hungary',
    'Romania',
    'Bulgaria',
    'Greece',
    'Croatia',
    'Slovenia',
    'Luxembourg',
    'Estonia',
    'Latvia',
    'Lithuania',
    'Norway',
    'Iceland',
    'Switzerland',
    // German country names.
    'Niederlande',
    'Belgien',
    'Deutschland',
    'Frankreich',
    'Italien',
    'Spanien',
    'Irland',
    'Österreich',
    'Schweden',
    'Dänemark',
    'Finnland',
    'Tschechien',
    'Slowakei',
    'Ungarn',
    'Rumänien',
    'Bulgarien',
    'Griechenland',
    'Kroatien',
    'Slowenien',
    'Luxemburg',
    'Estland',
    'Lettland',
    'Litauen',
    'Zypern',
    'Norwegen',
    'Island',
    'Schweiz',
    // French country names.
    'Pays-Bas',
    'Belgique',
    'Allemagne',
    'Italie',
    'Espagne',
    'Irlande',
    'Autriche',
    'Pologne',
    'Suède',
    'Danemark',
    'Finlande',
    'Tchéquie',
    'République tchèque',
    'Slovaquie',
    'Hongrie',
    'Roumanie',
    'Bulgarie',
    'Grèce',
    'Croatie',
    'Slovénie',
    'Estonie',
    'Lettonie',
    'Lituanie',
    'Malte',
    'Chypre',
    'Norvège',
    'Islande',
    'Suisse',
    // Spanish country names.
    'Países Bajos',
    'Bélgica',
    'Alemania',
    'Francia',
    'España',
    'Irlanda',
    'Polonia',
    'Suecia',
    'Dinamarca',
    'Finlandia',
    'Chequia',
    'República Checa',
    'Eslovaquia',
    'Hungría',
    'Rumanía',
    'Rumania',
    'Grecia',
    'Croacia',
    'Eslovenia',
    'Luxemburgo',
    'Letonia',
    'Lituania',
    'Chipre',
    'Noruega',
    'Islandia',
    'Suiza',
    // Italian country names.
    'Paesi Bassi',
    'Belgio',
    'Germania',
    'Spagna',
    'Portogallo',
    'Svezia',
    'Danimarca',
    'Cechia',
    'Repubblica Ceca',
    'Slovacchia',
    'Ungheria',
    'Croazia',
    'Lussemburgo',
    'Lettonia',
    'Lituania',
    'Cipro',
    'Norvegia',
    'Islanda',
    'Svizzera',
    // Portuguese country names.
    'Países Baixos',
    'Holanda',
    'Alemanha',
    'França',
    'Itália',
    'Espanha',
    'Áustria',
    'Polónia',
    'Polônia',
    'Suécia',
    'Chéquia',
    'República Tcheca',
    'Eslováquia',
    'Hungria',
    'Roménia',
    'Romênia',
    'Bulgária',
    'Grécia',
    'Croácia',
    'Eslovénia',
    'Eslovênia',
    'Estónia',
    'Estônia',
    'Letónia',
    'Letônia',
    'Lituânia',
    'Islândia',
    'Suíça',
    // Hungarian country names.
    'Hollandia',
    'Németország',
    'Franciaország',
    'Olaszország',
    'Spanyolország',
    'Portugália',
    'Írország',
    'Ausztria',
    'Lengyelország',
    'Svédország',
    'Dánia',
    'Finnország',
    'Csehország',
    'Szlovákia',
    'Magyarország',
    'Görögország',
    'Horvátország',
    'Szlovénia',
    'Észtország',
    'Lettország',
    'Litvánia',
    'Málta',
    'Ciprus',
    'Norvégia',
    'Izland',
    'Svájc',
    // Turkish country names.
    'Hollanda',
    'Belçika',
    'Almanya',
    'Fransa',
    'İtalya',
    'İspanya',
    'Portekiz',
    'İrlanda',
    'Avusturya',
    'Polonya',
    'İsveç',
    'Danimarka',
    'Finlandiya',
    'Çekya',
    'Slovakya',
    'Macaristan',
    'Romanya',
    'Bulgaristan',
    'Yunanistan',
    'Hırvatistan',
    'Slovenya',
    'Lüksemburg',
    'Estonya',
    'Letonya',
    'Litvanya',
    'Kıbrıs',
    'Norveç',
    'İzlanda',
    'Lihtenştayn',
    'İsviçre',
  ].map((s) => s.toLowerCase()),
);
// Check EU/EEA eligibility by stable nation ID when available, otherwise by name.
const isEu = (p) => {
  const r = natRec(p);
  return r ? r[1] === 1 : (p.nat || []).some((n) => EU_NATIONS.has((n || '').toLowerCase()));
};

// Map known Dutch foot labels from the dump to English for display.
// ---------- development history ----------
// Everything below reads from one source: state.hist, retrieved when loading a dump.
// The growth column, the growth filter, "new players only" and the intake bar run on this.
//
// Use the same July 1 season boundary as the seasonal report.
// If the reference date predates the first snapshot, use the first available date.
const HIST_PERIODS = ['last', 'm6', 'y1', 'season', 'all'];
function histRefDate() {
  const gd = state.meta.gameDate;
  const dates = state.hist ? state.hist.dates : null;
  if (!gd || !dates || dates.length < 2) return null;
  const d = parseGameDate(gd);
  // Format in local time; toISOString() would shift local midnight to the previous UTC date.
  const iso = (x) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const r = (() => {
    switch (state.histPeriod) {
      case 'last':
        return dates[dates.length - 2];
      case 'm6': {
        const x = new Date(d);
        x.setMonth(x.getMonth() - 6);
        return iso(x);
      }
      case 'season': {
        const y = seasonYearOf();
        return y ? `${y}-07-01` : dates[0];
      }
      case 'all':
        return dates[0];
      default: {
        const x = new Date(d);
        x.setFullYear(x.getFullYear() - 1);
        return iso(x);
      }
    }
  })();
  // Clamp to the earliest snapshot so a short history does not mark every player as new.
  // ISO date strings can be compared lexicographically.
  return r && r < dates[0] ? dates[0] : r;
}
// A baseline below CA 40 usually represents a partial record, not a real player.
// The minimum keeps incomplete records out of the growth list.
const HIST_MIN_BASE = 40;
// The history map uses numeric player IDs. These functions run for every row during filtering and
// sorting, so converting IDs to strings on each call would create many unnecessary allocations.
function caGrowth(p) {
  const h = state.hist && state.hist.map.get(p.id);
  if (!h || h[0] == null || h[0] < HIST_MIN_BASE) return null;
  return (p.ca || 0) - h[0];
}
// A player is new if their first observation is after the reference date.
function isNewSince(p) {
  const h = state.hist && state.hist.map.get(p.id);
  return !!h && h[2] > state.hist.refIdx;
}
// No history points means there is nothing to show, even when dates are available.
const histReady = () => !!(state.hist && state.hist.dates.length >= 2 && state.hist.map.size);

async function setHistPeriod(per) {
  state.histPeriod = per;
  try {
    localStorage.setItem('fmss_histperiod', per);
  } catch {}
  $('f-hist-period').value = per;
  await refreshHistDeltas();
}
// Hide this section when history or CA is unavailable.
function renderDevSection() {
  const on = histReady() && !state.hideCapa && state.mode !== 'staff';
  const sec = $('fg-development');
  if (sec) sec.style.display = on ? '' : 'none';
  if (!on) return;
  $('f-hist-period').value = state.histPeriod;
}

async function loadHistDeltas() {
  state.hist = null;
  try {
    const mgr = encodeURIComponent(state.meta.manager || 'default');
    // Fetch dates first so the "since last dump" period can choose its reference date.
    // Then fetch the full history.
    const probe = await fetch(`/api/history/deltas?manager=${mgr}`);
    if (!probe.ok) return;
    const meta = await probe.json();
    if (!meta.dates || meta.dates.length < 2) return;
    state.hist = { dates: meta.dates, refIdx: 0, map: new Map() };
    await refreshHistDeltas();
  } catch {
    /* History is optional and must never block dump loading. */
  }
}
async function refreshHistDeltas() {
  if (!state.hist) return;
  const ref = histRefDate();
  if (!ref) return;
  try {
    const mgr = encodeURIComponent(state.meta.manager || 'default');
    const r = await fetch(`/api/history/deltas?manager=${mgr}&since=${ref}`);
    if (!r.ok) return;
    const j = await r.json();
    // refIdx is the last snapshot on or before the reference date; later observations count as new.
    let ri = -1;
    j.dates.forEach((d, i) => {
      if (d <= ref) ri = i;
    });
    // JSON provides player IDs as strings, while p.id is numeric.
    const map = new Map();
    for (const k in j.p) map.set(+k, j.p[k]);
    state.hist = { dates: j.dates, refIdx: ri, map };
    intakeCache = null;
  } catch {
    /* Keep the previous snapshot when loading fails. */
  }
}

// ---------- youth intake banner ----------
// A youth intake adds many players at once, most age 17 or younger.
// These thresholds were calibrated against 24 real dump transitions.
// Exclude transfer-window spikes with few young players (for example, 510 newcomers with 11% under 18).
const INTAKE_MIN = 200,
  INTAKE_YOUNG_SHARE = 0.7,
  INTAKE_MAX_SHARE = 0.4;
// This result depends only on the dump and its history.
// Cache it so tab changes do not rescan 51,000 players.
let intakeCache = null;
function intakeSince() {
  if (!histReady() || state.hideCapa) return null;
  if (intakeCache) return intakeCache.v;
  const lastIdx = state.hist.dates.length - 1;
  const done = (v) => {
    intakeCache = { v };
    return v;
  };
  const fresh = state.players.filter((p) => {
    const h = state.hist.map.get(p.id);
    return h && h[2] === lastIdx;
  });
  if (fresh.length < INTAKE_MIN) return done(null);
  // A new career or a much larger set of loaded leagues makes the new-player count meaningless.
  if (fresh.length > state.players.length * INTAKE_MAX_SHARE) return done(null);
  const withAge = fresh.filter((p) => getAge(p) > 0);
  const young = withAge.filter((p) => getAge(p) <= 17).length;
  if (!withAge.length || young / withAge.length < INTAKE_YOUNG_SHARE) return done(null);
  let best = null;
  // Avoid sorting the full intake just to find the highest potential.
  for (const p of fresh) if (p.pa > 0 && (!best || p.pa > best.pa)) best = p;
  return done({ n: fresh.length, best });
}
function renderIntakeBar() {
  const bar = $('intake-bar');
  if (!bar) return;
  const key = state.hist ? state.hist.dates[state.hist.dates.length - 1] : '';
  const info =
    state.mode === 'players' && localStorage.getItem('fmss_intake_seen') !== key
      ? intakeSince()
      : null;
  if (!info) {
    bar.classList.add('hidden');
    return;
  }
  const best = info.best
    ? `<span class="ib-best">${tf('intakeBest', { p: `${escHtml(info.best.name)}, ${getAge(info.best)}, ${escHtml(info.best.club || '?')}` })} · PA ${info.best.pa}</span>`
    : '';
  bar.innerHTML = `${icon('ball', 14)}<span class="ib-txt">${escHtml(tf('intakeTitle', { n: info.n.toLocaleString(FORMAT_LOCALE) }))}</span>${best}
    <button class="ib-go">${text('intakeShow')}</button>
    <button class="ib-x" title="${text('donateLater')}">${icon('x', 12)}</button>`;
  bar.classList.remove('hidden');
  const dismiss = () => {
    try {
      localStorage.setItem('fmss_intake_seen', key);
    } catch {}
    bar.classList.add('hidden');
  };
  bar.querySelector('.ib-x').onclick = dismiss;
  bar.querySelector('.ib-go').onclick = async () => {
    dismiss();
    $('btn-clear').onclick();
    await setHistPeriod('last');
    $('f-new').checked = true;
    $('f-age-max').value = 18;
    state.sortKey = 'pa';
    state.sortDir = -1;
    renderTable();
    applyFilters();
  };
}

// Use one wonderkid definition for the filter and player-card badge.
// Players with unknown age are excluded.
//
// The PA threshold keeps nearly every 16-year-old from qualifying based on growth alone.
// Without it, 28% of a real database (14,201 of 51,345 players) matched the wonderkid filter.
// A PA threshold of 150 leaves 556 strong prospects and makes the gold badge useful.
const WONDERKID_PA = 150;
function isWonderkid(p) {
  const a = getAge(p);
  return a > 0 && a <= 21 && (p.pa || 0) >= WONDERKID_PA && (p.pa || 0) - (p.ca || 0) >= 25;
}
const FOOT_KEY = {
  rechts: 'footR',
  links: 'footL',
  beide: 'footB',
  right: 'footR',
  left: 'footL',
  both: 'footB',
};
const footLabel = (p) => {
  const k = FOOT_KEY[(p.foot || '').toLowerCase()];
  return k ? text(k) : p.foot || '–';
};

// Convert known Dutch country names from older dumps to English.
const NATION_EN = {
  Nederland: 'Netherlands',
  België: 'Belgium',
  Duitsland: 'Germany',
  Frankrijk: 'France',
  Spanje: 'Spain',
  Italië: 'Italy',
  Engeland: 'England',
  Schotland: 'Scotland',
  Wales: 'Wales',
  'Noord-Ierland': 'Northern Ireland',
  Ierland: 'Ireland',
  Oostenrijk: 'Austria',
  Zwitserland: 'Switzerland',
  Polen: 'Poland',
  Zweden: 'Sweden',
  Noorwegen: 'Norway',
  Denemarken: 'Denmark',
  Finland: 'Finland',
  IJsland: 'Iceland',
  Tsjechië: 'Czechia',
  Slowakije: 'Slovakia',
  Hongarije: 'Hungary',
  Roemenië: 'Romania',
  Bulgarije: 'Bulgaria',
  Griekenland: 'Greece',
  Kroatië: 'Croatia',
  Servië: 'Serbia',
  'Bosnië en Herzegovina': 'Bosnia and Herzegovina',
  Slovenië: 'Slovenia',
  'Noord-Macedonië': 'North Macedonia',
  Albanië: 'Albania',
  Montenegro: 'Montenegro',
  Kosovo: 'Kosovo',
  Turkije: 'Turkey',
  Rusland: 'Russia',
  Oekraïne: 'Ukraine',
  'Wit-Rusland': 'Belarus',
  Litouwen: 'Lithuania',
  Letland: 'Latvia',
  Estland: 'Estonia',
  Georgië: 'Georgia',
  Armenië: 'Armenia',
  Azerbeidzjan: 'Azerbaijan',
  Moldavië: 'Moldova',
  Luxemburg: 'Luxembourg',
  Cyprus: 'Cyprus',
  Israël: 'Israel',
  Brazilië: 'Brazil',
  Argentinië: 'Argentina',
  Uruguay: 'Uruguay',
  Chili: 'Chile',
  Colombia: 'Colombia',
  Peru: 'Peru',
  Ecuador: 'Ecuador',
  Paraguay: 'Paraguay',
  Bolivia: 'Bolivia',
  Venezuela: 'Venezuela',
  'Verenigde Staten': 'United States',
  Mexico: 'Mexico',
  Canada: 'Canada',
  'Costa Rica': 'Costa Rica',
  Jamaica: 'Jamaica',
  Honduras: 'Honduras',
  Panama: 'Panama',
  Marokko: 'Morocco',
  Algerije: 'Algeria',
  Tunesië: 'Tunisia',
  Egypte: 'Egypt',
  Senegal: 'Senegal',
  Ivoorkust: 'Ivory Coast',
  Nigeria: 'Nigeria',
  Kameroen: 'Cameroon',
  'Zuid-Afrika': 'South Africa',
  Kaapverdië: 'Cape Verde',
  Guinee: 'Guinea',
  'Congo-Kinshasa': 'DR Congo',
  'Democratische Republiek Congo': 'DR Congo',
  Japan: 'Japan',
  'Zuid-Korea': 'South Korea',
  China: 'China',
  Australië: 'Australia',
  'Nieuw-Zeeland': 'New Zealand',
  'Saoedi-Arabië': 'Saudi Arabia',
  Iran: 'Iran',
  Irak: 'Iraq',
  'Verenigde Arabische Emiraten': 'United Arab Emirates',
  Qatar: 'Qatar',
  Indonesië: 'Indonesia',
};
// Prefer stable nation IDs and English labels from nations.js.
// Older dumps without natId use the Dutch-to-English fallback map.
const natRec = (p) => (typeof NATIONS !== 'undefined' && p && p.natId && NATIONS[p.natId]) || null;
const natLabel = (name) => NATION_EN[name] || name;
const natsLabel = (player) => {
  const record = natRec(player);
  return record ? record[0] : (player.nat || []).map(natLabel).join(', ');
};

// Hidden-stats settings control CA/PA, growth, and meta scores derived from those values.
// PA meta depends on both CA/PA visibility and the meta-score setting.
const hiddenStatCol = (k) =>
  (state.hideCapa && (k === 'ca' || k === 'pa' || k === 'growth' || k === 'metapa')) ||
  (state.hideMeta && (k === 'meta' || k === 'metapa')) ||
  (k === 'growth' && !histReady());

// ---------- currency ----------
// The dump stores weekly wages; convert only for display.
// Filters and internal estimates continue to use weekly amounts.
const WAGE_FACTOR = { w: 1, m: 52 / 12, y: 52 };
const wageFactor = () => WAGE_FACTOR[state.wagePer] || 1;
const fmtWage = (v) => (v == null ? '–' : fmtMoney(v * wageFactor()));
const wageSuf = () =>
  text(state.wagePer === 'm' ? 'perMonthSuf' : state.wagePer === 'y' ? 'perYearSuf' : 'perWeekSuf');
function fmtMoney(v) {
  if (v == null) return '–';
  const sym = CUR_RATE[state.cur] ? state.cur : '£'; // unknown localStorage value → £
  const val = v * CUR_RATE[sym];
  if (val === 0) return sym + '0';
  const abs = Math.abs(val);
  if (abs >= 1e9) return sym + (val / 1e9).toFixed(2) + text('billion');
  if (abs >= 1e6) return sym + (val / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sym + Math.round(val / 1e3) + 'K';
  return sym + Math.round(val);
}
// Show the dump's ISO date as dd-mm-yyyy.
const fmtDate = (v) => {
  const s = v ? String(v) : '';
  return s.length >= 10 ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : s || '–';
};

// ---------- age from reference year ----------
function getAge(p) {
  if (p.birthYear) {
    let a = state.refYear - p.birthYear;
    if (p.birthDoy && p.birthDoy > state.refDoy) a -= 1;
    return a;
  }
  return p.age;
}
// Parse in-game dates as local midnight. new Date('yyyy-mm-dd') uses UTC midnight, which can
// appear one day early when local date fields are read west of UTC and shift age/season limits.
const parseGameDate = (s) => new Date(String(s) + 'T00:00:00');
function gameNow() {
  const g = state.meta.gameDate ? parseGameDate(state.meta.gameDate) : new Date();
  return new Date(state.refYear, g.getMonth(), g.getDate());
}

// ---------- column definitions ----------
const qClass = (v) =>
  v == null ? '' : v >= 150 ? 'q5' : v >= 120 ? 'q4' : v >= 90 ? 'q3' : v >= 60 ? 'q2' : 'q1';
const qHtml = (v) =>
  v == null ? '<span class="dim">·</span>' : `<span class="${qClass(v)}">${v}</span>`;
// Highlight contracts that are about to expire as a scouting signal.
function expiresHtml(p) {
  const m = monthsUntil(p.expires);
  if (m == null) return { cls: 'dim', txt: '–' };
  const txt = fmtDate(p.expires);
  if (m <= 6) return { cls: 'exp-soon', txt };
  if (m <= 12) return { cls: 'exp-year', txt };
  return { cls: '', txt };
}

// Default column width for the fixed table layout; saved user widths take precedence.
// Fixed widths prevent columns from shifting when content, sorting, or visible rows change.
const PLAYER_COLS = [
  { key: 'sl', label: '★', star: true, w: 34 },
  { key: 'name', label: 'c_name', get: (p) => p.name, name: true, w: 180 },
  { key: 'age', label: 'c_age', num: true, get: (p) => getAge(p), w: 50 },
  {
    key: 'pos',
    label: 'c_pos',
    get: (p) => posRank(p),
    render: (p) => (p.pos ? escHtml(p.pos) : '<span class="dim">–</span>'),
    w: 95,
  },
  {
    key: 'club',
    label: 'c_club',
    get: (p) => p.club || '',
    render: (p) => clubLabel(p),
    w: 175,
  },
  {
    key: 'div',
    label: 'c_div',
    get: (p) => playerDivisionLabel(p),
    render: (p) => (p.div ? escHtml(playerDivisionLabel(p)) : '<span class="dim">–</span>'),
    defHidden: true,
    w: 190,
  },
  { key: 'nat', label: 'c_nat', get: (p) => natsLabel(p), w: 115 },
  {
    key: 'eu',
    label: 'EU',
    get: (p) => (isEu(p) ? 1 : 0),
    render: (p) =>
      isEu(p) ? `<span class="eu-yes">${icon('check', 12)}</span>` : '<span class="dim">–</span>',
    w: 42,
  },
  {
    key: 'ca',
    label: 'CA',
    num: true,
    get: (p) => p.ca,
    render: (p) => qHtml(p.ca),
    w: 56,
  },
  {
    key: 'pa',
    label: 'PA',
    num: true,
    get: (p) => p.pa,
    render: (p) => qHtml(p.pa),
    w: 56,
  },
  // Keep growth null when there is no baseline, so unmeasured players sort below actual gains.
  {
    key: 'growth',
    label: 'c_growth',
    num: true,
    help: 'growthHint',
    get: caGrowth,
    render: (p) => growthHtml(p),
    w: 74,
  },
  {
    key: 'meta',
    label: 'c_meta',
    num: true,
    help: 'metaHint',
    get: (p) => metaScore(p),
    render: (p) => metaHtml(p),
    w: 64,
  },
  {
    key: 'metapa',
    label: 'c_metapa',
    num: true,
    help: 'metaPaHint',
    get: (p) => metaPaScore(p),
    render: (p) => metaPaHtml(p),
    w: 68,
  },
  {
    key: 'valueBefore',
    label: 'c_valueBefore',
    num: true,
    get: (p) => fmStoredValue(p).v ?? -1,
    render: (p) => fmStoredValue(p).v == null ? '<span class="dim">?</span>' : fmtMoney(fmStoredValue(p).v),
    w: 115,
  },
  {
    key: 'value',
    label: 'c_value',
    num: true,
    get: (p) => p.fmValueRead ? fmValue(p).v ?? -1 : -1,
    render: (p) => p.fmValueRead ? fmValueHtml(p) : '<span class="dim">?</span>',
    w: 155,
  },
  {
    key: 'fee',
    label: 'c_fee',
    num: true,
    get: (p) => {
      const f = fmAskingPrice(p);
      return f.v == null ? -1 : f.v;
    },
    render: (p) => askingPriceHtml(p),
    w: 105,
  },
  {
    key: 'wage',
    label: 'c_wage',
    num: true,
    get: (p) => p.wage,
    fmt: fmtWage,
    w: 100,
  },
  {
    key: 'playingTimeHappiness',
    label: 'c_playingTimeHappiness',
    num: true,
    get: (p) => p.playingTimeHappiness,
    render: (p) =>
      p.playingTimeHappiness == null
        ? '<span class="dim">–</span>'
        : `<span title="Signed raw Playing Time score. ${p.playingTimeHappinessStatus ? 'Status calculated from FM data.' : 'Native status has not been calculated for this player.'}">${escHtml(p.playingTimeHappinessStatus || 'Unknown')} (${p.playingTimeHappiness})</span>`,
    w: 170,
  },
  {
    key: 'expires',
    label: 'c_expires',
    get: (p) => p.expires,
    fmt: fmtDate,
    tdCls: (p) => expiresHtml(p).cls,
    w: 110,
  },
  {
    key: 'interest',
    label: 'c_interest',
    help: 'interestHint',
    get: (p) => gameInterestOrder(gameInterestLabel(p)),
    render: (p) => gameInterestHtml(p),
    w: 160,
  },
  {
    key: 'status',
    label: 'c_status',
    get: (p) => 0,
    render: (p) => statusHtml(p),
    w: 110,
  },
  // Default hidden extra columns (can be enabled via right click, sortable):
  {
    key: 'clubRep',
    label: 'c_clubrep',
    num: true,
    get: (p) => p.clubRep || 0,
    defHidden: true,
    w: 85,
  },
  {
    key: 'worldRep',
    label: 'c_worldrep',
    num: true,
    get: (p) => p.worldRep || 0,
    defHidden: true,
    w: 85,
  },
  {
    key: 'height',
    label: 'height',
    num: true,
    get: (p) => p.height,
    fmt: (v) => (v ? v + ' cm' : '–'),
    defHidden: true,
    w: 70,
  },
  {
    key: 'foot',
    label: 'foot',
    get: (p) => footLabel(p),
    defHidden: true,
    w: 75,
  },
];
// FM24's community-reported coach formula uses 1–20 attributes and DDM
// (Determination + Level of Discipline + Motivating). Scores are out of 300;
// each 30-point band adds half a star, with 5 stars starting at 271. Workload
// adjustments are not included.
const STAFF_TRAINING_ATTRS = {
  attacking: ['Attacking', 'Aanvallen'],
  defending: ['Defending', 'Verdedigen'],
  fitness: ['Fitness', 'Fitheid'],
  possession: ['Mental', 'BallControl', 'Possession', 'Balbezit'],
  technical: ['Technical', 'Technisch'],
  tactical: ['Tactical', 'Tactisch'],
  setPieces: ['SetPieces', 'Set Pieces', 'Standaardsituaties'],
  tacticalKnowledge: ['TacticalKnowledge', 'Tactical Knowledge', 'Tactische_kennis'],
  determination: ['Determination', 'Vastberadenheid'],
  discipline: ['LevelOfDiscipline', 'Level of Discipline', 'Discipline'],
  motivating: ['Motivating', 'Motiveren'],
  gkDistribution: ['GKDistribution', 'KV_distributie'],
  gkHandling: ['GKHandling', 'KV_vangen'],
  gkShotStopping: ['GKShotStopping', 'KV_reflexen'],
};
const STAFF_TRAINING_CATEGORIES = [
  { key: 'coachAttTac', main: 'attacking', secondary: 'tactical' },
  { key: 'coachAttTech', main: 'attacking', secondary: 'technical' },
  { key: 'coachDefTac', main: 'defending', secondary: 'tactical' },
  { key: 'coachDefTech', main: 'defending', secondary: 'technical' },
  { key: 'coachPossTac', main: 'possession', secondary: 'tactical' },
  { key: 'coachPossTech', main: 'possession', secondary: 'technical' },
  { key: 'coachFitStrength', main: 'fitness', single: true },
  { key: 'coachFitQuickness', main: 'fitness', single: true },
  { key: 'coachGkStop', main: 'gkShotStopping', single: true },
  { key: 'coachGkHandleDist', main: 'gkHandling', secondary: 'gkDistribution' },
  { key: 'coachSetPieces', main: 'setPieces', secondary: 'tacticalKnowledge' },
];
function staffTrainingAttr(p, key) {
  const attrs = p && p.staffAttrs;
  if (!attrs) return null;
  for (const name of STAFF_TRAINING_ATTRS[key] || []) {
    const value = attrs[name];
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}
function staffTrainingStars(p, category) {
  if (!p || !p.staffAttrs) return null;
  const cache = (p._staffTrainingStars ||= {});
  if (cache[category.key] !== undefined) return cache[category.key];
  const main = staffTrainingAttr(p, category.main);
  const secondary = category.secondary ? staffTrainingAttr(p, category.secondary) : null;
  const determination = staffTrainingAttr(p, 'determination');
  const discipline = staffTrainingAttr(p, 'discipline');
  const motivating = staffTrainingAttr(p, 'motivating');
  if (
    [main, determination, discipline, motivating].some((value) => !Number.isFinite(value)) ||
    (category.secondary && !Number.isFinite(secondary))
  )
    return (cache[category.key] = null);
  const ddm = determination + discipline + motivating;
  const score = category.single ? 9 * main + 2 * ddm : 6 * main + 3 * secondary + 2 * ddm;
  return (cache[category.key] = Math.min(5, Math.max(0.5, Math.ceil(score / 30) / 2)));
}
const staffTrainingStarsHtml = (value) =>
  value == null
    ? '<span class="dim">–</span>'
    : `<span class="training-stars">${Number.isInteger(value) ? value : value.toFixed(1)}</span>`;

const STAFF_COLS = [
  { key: 'name', label: 'c_name', get: (p) => p.name, name: true, w: 180 },
  { key: 'age', label: 'c_age', num: true, get: (p) => getAge(p), w: 50 },
  {
    key: 'job',
    label: 'c_preferredJob',
    get: (p) => preferredJobLabel(p) || jobLabel(p),
    w: 150,
  },
  {
    key: 'currentJob',
    label: 'c_currentRole',
    get: (p) => currentJobLabel(p),
    render: (p) => {
      const job = currentJobLabel(p);
      return job ? escHtml(job) : '<span class="dim">–</span>';
    },
    w: 150,
  },
  {
    key: 'club',
    label: 'c_club',
    get: (p) => p.club || '',
    render: (p) => clubLabel(p),
    w: 175,
  },
  { key: 'nat', label: 'c_nat', get: (p) => natsLabel(p), w: 115 },
  {
    key: 'ca',
    label: 'CA',
    num: true,
    get: (p) => p.ca,
    render: (p) => qHtml(p.ca),
    w: 56,
  },
  {
    key: 'pa',
    label: 'PA',
    num: true,
    get: (p) => p.pa,
    render: (p) => qHtml(p.pa),
    w: 56,
  },
  {
    key: 'wage',
    label: 'c_wage',
    num: true,
    get: (p) => p.wage,
    fmt: fmtWage,
    w: 100,
  },
  {
    key: 'expires',
    label: 'c_expires',
    get: (p) => p.expires,
    fmt: fmtDate,
    tdCls: (p) => expiresHtml(p).cls,
    w: 110,
  },
  {
    key: 'clubRep',
    label: 'c_clubrep',
    num: true,
    get: (p) => p.clubRep || 0,
    defHidden: true,
    w: 85,
  },
  {
    key: 'worldRep',
    label: 'c_worldrep',
    num: true,
    get: (p) => p.worldRep || 0,
    defHidden: true,
    w: 85,
  },
  ...STAFF_TRAINING_CATEGORIES.map((category, index) => ({
    key: category.key,
    label: category.key,
    num: true,
    get: (p) => staffTrainingStars(p, category),
    render: (p) => staffTrainingStarsHtml(staffTrainingStars(p, category)),
    help: index === 0 ? 'staffTrainingStarsHint' : null,
    w: 88,
  })),
];

// ---------- exact in-game values (GBP) ----------
// A free agent has neither a club nor a club reputation. A club with a reputation but no name is
// unresolved, not a free agent; see clubLabel().
const nationalTeamLabel = (p) => {
  const id = Number(p?.nationalTeamId) || 0;
  const record = typeof NATIONS !== 'undefined' && id > 0 ? NATIONS[id] : null;
  return record ? record[0] : null;
};
const isFree = (p) => !p.club && !nationalTeamLabel(p) && !(p.clubRep > 0);
// Show the club name, an unknown-club label when only its reputation is available, or clubless
// for a genuine free agent.
function clubLabel(p) {
  if (p.club) return escHtml(p.club);
  const nationalTeam = nationalTeamLabel(p);
  if (nationalTeam) return `${escHtml(nationalTeam)} <span class="dim">(national team)</span>`;
  if (p.clubRep > 0)
    return `<span class="dim" data-tip="${escHtml(tf('clubNotRead', { r: p.clubRep }))}">${text('clubUnknown')}</span>`;
  // A dash is enough here because the status pill already identifies free agents.
  return `<span class="dim" data-help="clubless">–</span>`;
}
// These values are shown only when FM's player data contains them.
function fmValue(p) {
  if (p?.fmValueRead) {
    if (p.valueMin == null || p.valueMax == null) return { v: null };
    const lo = Number(p.valueMin), hi = Number(p.valueMax);
    return Number.isFinite(lo) && Number.isFinite(hi) && lo >= 0 && hi >= lo
      ? { v: lo, hi }
      : { v: null };
  }
  if (p?.nativeTransferRead) return { v: null };
  return fmStoredValue(p);
}
function fmStoredValue(p) {
  // Old dumps used +0x1B0, which assembly inspection proved is not a money field.
  if (state.meta.playerValueSource !== 'fm24-stored-guide-1d0') return { v: null };
  const v = Number(p?.value);
  return Number.isFinite(v) && v > 0 && v !== 0xffffffff
    ? { v }
    : { v: null };
}
function fmValueHtml(p) {
  const value = fmValue(p);
  return value.v == null
    ? '<span class="dim" data-help="valueHint">–</span>'
    : fmValueText(p);
}
function fmValueText(p) {
  const value = fmValue(p);
  if (value.v == null) return '–';
  return value.hi > value.v ? `${fmtMoney(value.v)} – ${fmtMoney(value.hi)}` : fmtMoney(value.v);
}
function fmAskingPrice(p) {
  if (p?.minimumAcceptedBid == null || p.minimumBidStatus !== 'verified-cash-boundary') return { v: null };
  const v = Number(p.minimumAcceptedBid);
  return Number.isFinite(v) && v >= 0 && v !== 0xffffffff
    ? { v }
    : { v: null };
}
function askingPriceHtml(p) {
  const price = fmAskingPrice(p);
  return price.v == null
    ? '<span class="dim" data-help="askingPriceHint">–</span>'
    : fmtMoney(price.v);
}

// These labels use FM's native Interested In filter, including its manager-context adjustment.
const FM_INTEREST_LEVELS = [
  'Doubtful',
  'Unsure',
  'Slightly Interested',
  'Interested',
  'Very Interested',
  'Extremely Interested',
];
function gameInterestOrder(value) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase();
  if (normalized === 'not interested') return -2;
  return FM_INTEREST_LEVELS.findIndex((label) => label.toLocaleLowerCase() === normalized);
}
function gameInterestLabel(p) {
  const value = $('f-interest-kind')?.value === 'loan' ? p?.gameLoanInterest : p?.gameInterest;
  const i = gameInterestOrder(value);
  return i === -2 ? 'Not interested' : i < 0 ? null : FM_INTEREST_LEVELS[i];
}
function gameInterestHtml(p) {
  const label = gameInterestLabel(p);
  if (!label) return '<span class="dim" data-help="interestHint">–</span>';
  const i = gameInterestOrder(label);
  const classes = ['int-n', 'int-n', 'int-k', 'int-r', 'int-g', 'int-g'];
  return `<span class="int ${classes[i] || 'int-n'}" data-help="interestHint">${label}</span>`;
}

function statusHtml(p) {
  let h = '';
  if (isFree(p)) h += `<span class="tag free">${text('tag_free')}</span>`;
  if (p.listed) h += `<span class="tag listed">${text('tag_listed')}</span>`;
  if (p.loanListed) h += `<span class="tag listed">${text('tag_loan')}</span>`;
  if (p.setForRelease) h += `<span class="tag rel">${text('tag_rel')}</span>`;
  if (p.notForSale) h += `<span class="tag nfs">${text('tag_nfs')}</span>`;
  return h || '<span class="dim">–</span>';
}
// FM positions follow pitch order from goalkeeper to striker, not alphabetical order.
const POS_ORDER = [
  'GK',
  'DR',
  'DC',
  'DL',
  'WBR',
  'WBL',
  'DM',
  'MR',
  'MC',
  'ML',
  'AMR',
  'AMC',
  'AML',
  'ST',
];
const POS_RANK = Object.fromEntries(POS_ORDER.map((p, i) => [p, i]));
function posRank(p) {
  const prof = p.posProficiency;
  let positions;
  if (hasPositionProficiency(p)) {
    positions = Object.entries(prof)
      .filter(([, v]) => v >= state.profThreshold)
      .map(([pos]) => pos);
    // If no position meets the threshold, fall back to the player's strongest trained position.
    if (!positions.length) {
      const best = Object.entries(prof).sort((a, b) => b[1] - a[1])[0];
      positions = best ? [best[0]] : [];
    }
  } else {
    positions = p.posArr || []; // old dump without proficiency data
  }
  if (!positions.length) return 99;
  return Math.min(...positions.map((x) => POS_RANK[x] ?? 98)); // Most defensive trained position.
}
function isAttainable(p) {
  if (p.notForSale) return false;
  const m = monthsUntil(p.expires);
  return p.listed || p.setForRelease || isFree(p) || (m != null && m <= 12);
}

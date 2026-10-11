// ---------- advanced attribute filters ----------
// Rules combine visible attributes, hidden attributes, and personality values.
// Hidden-attribute rules are ignored while hidden stats are disabled.
const ADV_HIDDEN_KEYS = [
  'Consistency',
  'ImportantMatches',
  'Versatility',
  'InjuryProneness',
  'Dirtiness',
];
const ADV_PERS_KEYS = [
  'ambition',
  'professionalism',
  'loyalty',
  'pressure',
  'temperament',
  'sportsmanship',
  'adaptability',
  'controversy',
];
const advIsHidden = (k) => ADV_HIDDEN_KEYS.includes(k) || ADV_PERS_KEYS.includes(k);
const advLabel = (k) =>
  isStaffAttrKey(k)
    ? staffAttrName(k)
    : ADV_PERS_KEYS.includes(k)
      ? text(k)
      : ADV_HIDDEN_KEYS.includes(k)
        ? text('a_' + k)
        : attrName(k);
const advValue = (p, k) =>
  p.staffAttrs
    ? (p.staffAttrs[k] ?? null)
    : ADV_PERS_KEYS.includes(k)
      ? p[k] || null
      : p.attrs
        ? p.attrs[k]
        : null;
const getCurAdvRules = () => (state.mode === 'staff' ? (state.advStaffF ||= []) : state.advF);
const activeAdvRules = () =>
  getCurAdvRules().filter((r) => r.k && (r.min || r.max) && !(state.hideCapa && advIsHidden(r.k)));
const advChipTxt = (r) =>
  `${advLabel(r.k)} ${r.min && r.max ? r.min + '–' + r.max : r.min ? '≥ ' + r.min : '≤ ' + r.max}`;
function saveAdv() {
  localStorage.setItem('fmss_adv', JSON.stringify(state.advF));
  localStorage.setItem('fmss_adv_staff', JSON.stringify(state.advStaffF || []));
  persistFilterTab();
  updateAdvBtn();
}
// Show only the active-rule count here; the rules are already visible in the chips and dialogue.
function updateAdvBtn() {
  const n = activeAdvRules().length;
  const b = $('btn-adv');
  b.textContent = text('advBtn') + (n ? ` (${n})` : '') + '…';
  b.classList.toggle('has-rules', n > 0);
}
function advDialog() {
  const m = $('adv-modal');
  const isStaff = state.mode === 'staff';
  const getRules = () => (isStaff ? (state.advStaffF ||= []) : state.advF);
  let curRules = getRules();

  // Searchable catalog of player, staff, hidden, and personality attributes.
  const catalog = [];
  if (isStaff) {
    for (const [g, keys] of STAFF_ATTR_GROUPS) {
      const sortedKeys = [...keys].sort((a, b) =>
        staffAttrName(a).localeCompare(staffAttrName(b), 'en'),
      );
      for (const k of sortedKeys) catalog.push({ k, label: staffAttrName(k), group: text(g) });
    }
  } else {
    const gkOnly = ATTR_GROUPS_GK[0][1].filter(
      (k) => !ATTR_GROUPS_OUTFIELD.some(([, ks]) => ks.includes(k)),
    );
    for (const [g, keys] of [...ATTR_GROUPS_OUTFIELD, ['g_goalkeeping', gkOnly]])
      for (const k of sortByLabel(keys)) catalog.push({ k, label: attrName(k), group: text(g) });
    if (!state.hideCapa) {
      const byT = (a, b) => a.localeCompare(b, 'en');
      for (const k of [...ADV_HIDDEN_KEYS].sort((a, b) => byT(text('a_' + a), text('a_' + b))))
        catalog.push({ k, label: text('a_' + k), group: text('hiddenTitle') });
      for (const k of [...ADV_PERS_KEYS].sort((a, b) => byT(text(a), text(b))))
        catalog.push({ k, label: text(k), group: text('personaTitle') });
    }
  }
  // Escape first closes an open attributes dropdown, then the popup itself.
  const esc = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    const dd = m.querySelector('.adv-dd:not(.hidden)');
    if (dd) dd.classList.add('hidden');
    else close();
  };
  const close = () => {
    if (isStaff) state.advStaffF = state.advStaffF.filter((r) => r.k);
    else state.advF = state.advF.filter((r) => r.k);
    saveAdv();
    m.classList.add('hidden');
    document.removeEventListener('keydown', esc, true);
  };
  const render = () => {
    curRules = getRules();
    m.innerHTML =
      `<div class="pm-card adv-card">
      <div class="pm-title">${text('advTitle')}</div>
      <div class="adv-head"><span class="ah-attr">${text('advColAttr')}</span><span class="ah-mm">${text('advMin')}</span><span class="ah-mm">${text('advMax')}</span><span class="ah-sp"></span></div>
      <div id="adv-rows">` +
      curRules
        .map(
          (r, i) => `
        <div class="adv-row" data-i="${i}">
          <div class="adv-kwrap">
            <input type="text" class="adv-kin" value="${r.k ? escHtml(advLabel(r.k)) : ''}" placeholder="${text('advSearch')}" autocomplete="off">
            <div class="adv-dd hidden"></div>
          </div>
          <input type="number" class="adv-min" min="1" max="20" placeholder="${text('advMin')}" value="${r.min || ''}">
          <input type="number" class="adv-max" min="1" max="20" placeholder="${text('advMax')}" value="${r.max || ''}">
          <button class="adv-x" title="${text('clear')}">${icon('x', 12)}</button>
        </div>`,
        )
        .join('') +
      `</div>
      <button class="adv-add">${text('advAdd')}</button>
      <div class="pm-actions">
        <button class="pm-cancel">${text('advClear')}</button>
        <button class="pm-ok">${text('advDone')}</button>
      </div>
    </div>`;
    m.querySelectorAll('.adv-row').forEach((row) => {
      const r = curRules[+row.dataset.i];
      const kin = row.querySelector('.adv-kin'),
        dd = row.querySelector('.adv-dd');
      // Combobox: clicking opens the entire (grouped) list, typing filters it.
      const buildDd = (termRaw) => {
        const term = foldSearchText((termRaw || '').trim());
        const used = new Set(curRules.filter((x) => x !== r && x.k).map((x) => x.k));
        const hits = catalog.filter(
          (c) => !used.has(c.k) && (!term || foldSearchText(c.label).includes(term)),
        );
        if (term)
          hits.sort(
            (a, b) => foldSearchText(a.label).indexOf(term) - foldSearchText(b.label).indexOf(term),
          );
        let html = '',
          lastG = null;
        for (const c of hits) {
          if (!term && c.group !== lastG) {
            html += `<div class="asg-h">${c.group}</div>`;
            lastG = c.group;
          }
          html += `<div class="adv-sug-i" data-k="${c.k}"><span>${c.label}</span><span class="asg">${c.group}</span></div>`;
        }
        dd.innerHTML = html || `<div class="asg-h">–</div>`;
        // mousedown (not click): before the blur of the input field
        dd.querySelectorAll('.adv-sug-i').forEach(
          (el) =>
            (el.onmousedown = (e) => {
              e.preventDefault();
              pick(el.dataset.k);
            }),
        );
      };
      const pick = (k) => {
        const fresh = !r.k;
        r.k = k;
        saveAdv();
        applyFilters();
        kin.value = advLabel(k);
        dd.classList.add('hidden');
        if (fresh || (!r.min && !r.max)) row.querySelector('.adv-min').focus();
      };
      kin.onfocus = () => {
        buildDd('');
        dd.classList.remove('hidden');
        kin.select();
      };
      kin.oninput = () => {
        buildDd(kin.value);
        dd.classList.remove('hidden');
      };
      kin.onblur = () =>
        setTimeout(() => {
          dd.classList.add('hidden');
          kin.value = r.k ? advLabel(r.k) : '';
        }, 120);
      kin.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const f = dd.querySelector('.adv-sug-i');
          if (f) pick(f.dataset.k);
        }
      };
      row.querySelector('.adv-min').oninput = (e) => {
        r.min = +e.target.value || 0;
        saveAdv();
        applyFilters();
      };
      row.querySelector('.adv-max').oninput = (e) => {
        r.max = +e.target.value || 0;
        saveAdv();
        applyFilters();
      };
      row.querySelector('.adv-x').onclick = () => {
        curRules.splice(+row.dataset.i, 1);
        saveAdv();
        applyFilters();
        render();
      };
    });
    m.querySelector('.adv-add').onclick = () => {
      curRules.push({ k: '', min: 0, max: 0 });
      render();
      const kins = m.querySelectorAll('.adv-kin');
      const last = kins[kins.length - 1];
      last.focus();
      last.onfocus(); // dropdown opens immediately, even if the focus event does not fire
    };
    m.querySelector('.pm-cancel').onclick = () => {
      curRules.length = 0;
      saveAdv();
      applyFilters();
      render();
    };
    m.querySelector('.pm-ok').onclick = close;
  };
  document.addEventListener('keydown', esc, true);
  m.onclick = (e) => {
    if (e.target === m) close();
  };
  if (!curRules.length) curRules.push({ k: '', min: 0, max: 0 });
  render();
  m.classList.remove('hidden'); // visible first, otherwise focus() will not work
  const firstEmpty = [...m.querySelectorAll('.adv-row')].find((row) => !curRules[+row.dataset.i].k);
  if (firstEmpty) {
    const k = firstEmpty.querySelector('.adv-kin');
    k.focus();
    k.onfocus();
  }
}

// ---------- tactical roles ----------
// Per role: which positions fit, plus KEY attributes (heavy) and PREF attributes (light),
// modeled on FM's green/blue marked properties. Score = weighted average
// on the 1-20 scale (key counts 2x, pref 1x), so that it remains readable next to the individual attributes.
const ROLES = [
  // Goalkeepers
  {
    id: 'gk',
    pos: ['GK'],
    key: ['Handling', 'Reflexes', 'OneOnOnes', 'Positioning', 'Concentration', 'Agility'],
    pref: [
      'AerialReach',
      'CommandOfArea',
      'Communication',
      'Kicking',
      'Anticipation',
      'Decisions',
      'Bravery',
    ],
  },
  {
    id: 'sk',
    pos: ['GK'],
    key: [
      'Reflexes',
      'OneOnOnes',
      'RushingOut',
      'Handling',
      'Positioning',
      'Agility',
      'Composure',
      'Decisions',
    ],
    pref: [
      'CommandOfArea',
      'Communication',
      'Kicking',
      'FirstTouch',
      'Passing',
      'Anticipation',
      'Concentration',
    ],
  },
  // Central defenders
  {
    id: 'cd',
    pos: ['DC'],
    key: [
      'Marking',
      'Tackling',
      'Positioning',
      'Heading',
      'JumpingReach',
      'Strength',
      'Concentration',
      'Decisions',
    ],
    pref: ['Anticipation', 'Bravery', 'Composure', 'Aggression', 'Pace', 'Acceleration'],
  },
  {
    id: 'bpd',
    pos: ['DC'],
    key: [
      'Marking',
      'Tackling',
      'Positioning',
      'Passing',
      'Composure',
      'Vision',
      'Decisions',
      'JumpingReach',
    ],
    pref: [
      'Heading',
      'Strength',
      'FirstTouch',
      'Technique',
      'Anticipation',
      'Concentration',
      'Pace',
    ],
  },
  // Backs
  {
    id: 'fb',
    pos: ['DL', 'DR'],
    key: [
      'Marking',
      'Tackling',
      'Positioning',
      'Anticipation',
      'Concentration',
      'Stamina',
      'Pace',
      'WorkRate',
    ],
    pref: ['Crossing', 'Dribbling', 'Passing', 'Decisions', 'Teamwork', 'Acceleration', 'Agility'],
  },
  {
    id: 'wb',
    pos: ['DL', 'DR', 'WBL', 'WBR'],
    key: [
      'Crossing',
      'Dribbling',
      'Tackling',
      'OffTheBall',
      'Stamina',
      'Pace',
      'Acceleration',
      'WorkRate',
      'Teamwork',
    ],
    pref: [
      'Marking',
      'FirstTouch',
      'Passing',
      'Technique',
      'Anticipation',
      'Positioning',
      'Agility',
      'Balance',
    ],
  },
  // Defensive midfielders
  {
    id: 'dm',
    pos: ['DM'],
    key: [
      'Tackling',
      'Marking',
      'Positioning',
      'Anticipation',
      'Concentration',
      'Teamwork',
      'WorkRate',
      'Decisions',
      'Stamina',
    ],
    pref: ['Aggression', 'Passing', 'Composure', 'Strength', 'Bravery', 'FirstTouch'],
  },
  {
    id: 'dlp',
    pos: ['DM', 'MC'],
    key: [
      'Passing',
      'Vision',
      'FirstTouch',
      'Technique',
      'Composure',
      'Decisions',
      'Teamwork',
      'OffTheBall',
    ],
    pref: ['Anticipation', 'Positioning', 'Tackling', 'Balance', 'WorkRate', 'Flair'],
  },
  {
    id: 'bwm',
    pos: ['DM', 'MC'],
    key: [
      'Tackling',
      'Aggression',
      'WorkRate',
      'Stamina',
      'Teamwork',
      'Anticipation',
      'Marking',
      'Bravery',
    ],
    pref: ['Positioning', 'Determination', 'Concentration', 'Strength', 'Acceleration', 'Pace'],
  },
  // Central midfielders
  {
    id: 'cm',
    pos: ['MC'],
    key: [
      'Passing',
      'Tackling',
      'Decisions',
      'Teamwork',
      'WorkRate',
      'Stamina',
      'FirstTouch',
      'Composure',
    ],
    pref: ['Technique', 'Vision', 'OffTheBall', 'Anticipation', 'Positioning'],
  },
  {
    id: 'b2b',
    pos: ['MC'],
    key: [
      'Stamina',
      'WorkRate',
      'Tackling',
      'Passing',
      'OffTheBall',
      'Teamwork',
      'Decisions',
      'FirstTouch',
    ],
    pref: [
      'Finishing',
      'LongShots',
      'Technique',
      'Composure',
      'Anticipation',
      'Strength',
      'Acceleration',
      'Determination',
    ],
  },
  {
    id: 'ap',
    pos: ['MC', 'AMC'],
    key: [
      'Passing',
      'Vision',
      'Technique',
      'FirstTouch',
      'Composure',
      'Decisions',
      'OffTheBall',
      'Flair',
    ],
    pref: ['Dribbling', 'Anticipation', 'Agility', 'Teamwork', 'Acceleration'],
  },
  // Attacking/wide midfielders
  {
    id: 'wing',
    pos: ['ML', 'MR', 'AML', 'AMR'],
    key: ['Crossing', 'Dribbling', 'Technique', 'Pace', 'Acceleration', 'Agility', 'OffTheBall'],
    pref: ['FirstTouch', 'Passing', 'Flair', 'Balance', 'Stamina', 'Anticipation'],
  },
  {
    id: 'if',
    pos: ['AML', 'AMR'],
    key: [
      'Dribbling',
      'Finishing',
      'FirstTouch',
      'Technique',
      'OffTheBall',
      'Pace',
      'Acceleration',
      'Agility',
      'Composure',
    ],
    pref: ['LongShots', 'Passing', 'Flair', 'Anticipation', 'Balance', 'Vision'],
  },
  {
    id: 'am',
    pos: ['AMC'],
    key: [
      'OffTheBall',
      'FirstTouch',
      'Technique',
      'Finishing',
      'Composure',
      'Decisions',
      'Dribbling',
      'Passing',
    ],
    pref: ['LongShots', 'Vision', 'Flair', 'Anticipation', 'Acceleration', 'Agility'],
  },
  // Strikers
  {
    id: 'af',
    pos: ['ST'],
    key: [
      'Finishing',
      'OffTheBall',
      'Composure',
      'FirstTouch',
      'Dribbling',
      'Technique',
      'Acceleration',
      'Pace',
    ],
    pref: ['Anticipation', 'Decisions', 'Agility', 'Balance', 'Flair'],
  },
  {
    id: 'poacher',
    pos: ['ST'],
    key: ['Finishing', 'OffTheBall', 'Anticipation', 'Composure', 'FirstTouch'],
    pref: ['Dribbling', 'Heading', 'Technique', 'Decisions', 'Acceleration', 'Pace'],
  },
  {
    id: 'tm',
    pos: ['ST'],
    key: [
      'Heading',
      'JumpingReach',
      'Strength',
      'Bravery',
      'FirstTouch',
      'OffTheBall',
      'Finishing',
      'Balance',
    ],
    pref: ['Aggression', 'Anticipation', 'Composure', 'Teamwork', 'Determination'],
  },
  {
    id: 'cf',
    pos: ['ST'],
    key: [
      'Finishing',
      'FirstTouch',
      'Technique',
      'OffTheBall',
      'Composure',
      'Dribbling',
      'Heading',
      'Strength',
      'Acceleration',
      'Pace',
    ],
    pref: [
      'Passing',
      'Vision',
      'LongShots',
      'Anticipation',
      'Decisions',
      'Agility',
      'Balance',
      'JumpingReach',
    ],
  },
];
const ROLE_LABEL = {
  gk: 'Goalkeeper',
  sk: 'Sweeper Keeper',
  cd: 'Central Defender',
  bpd: 'Ball Playing Defender',
  fb: 'Full Back',
  wb: 'Wing Back',
  dm: 'Defensive Midfielder',
  dlp: 'Deep Lying Playmaker',
  bwm: 'Ball Winning Midfielder',
  cm: 'Central Midfielder',
  b2b: 'Box to Box Midfielder',
  ap: 'Advanced Playmaker',
  wing: 'Winger',
  if: 'Inside Forward',
  am: 'Attacking Midfielder',
  af: 'Advanced Forward',
  poacher: 'Poacher',
  tm: 'Target Man',
  cf: 'Complete Forward',
};
const roleName = (id) => ROLE_LABEL[id] ?? id;

// Prefer stable job IDs. Older dumps may only contain localized role names.
const JOB_LABEL = {
  1: 'Player',
  2: 'Coach',
  3: 'Player/Coach',
  4: 'Chairman',
  6: 'Director',
  8: 'Managing director',
  10: 'Director of football',
  12: 'Physio',
  14: 'Scout',
  16: 'Manager',
  17: 'Player/Manager',
  20: 'Assistant manager',
  21: 'Player/Assistant manager',
  22: 'Set Piece Coach',
  24: 'General manager',
  26: 'Fitness coach',
  27: 'Player/Fitness coach',
  34: 'Goalkeeping coach',
  35: 'Player/GK coach',
  36: 'Head of data analysis',
  38: 'Club doctor',
  40: 'Head of sports science',
  42: 'Data analyst',
  44: 'Chief scout',
  45: 'Player/Chief scout',
  46: 'Doctor',
  48: 'Sports scientist',
  49: 'Player/Youth coach',
  50: 'Head physio',
  52: 'U19 manager',
  54: 'First-team coach',
  64: 'Head of youth development',
  65: 'Player/Head of youth',
  66: 'Owner',
  70: 'President',
  86: 'Loan manager',
  88: 'Technical director',
  144: 'Caretaker manager',
};
const LEGACY_JOB_LABEL = {
  Speler: 'Player',
  Coach: 'Coach',
  'Speler/Coach': 'Player/Coach',
  Voorzitter: 'Chairman',
  Directeur: 'Director',
  'Algemeen directeur': 'Managing director',
  'Technisch directeur': 'Technical director',
  Fysiotherapeut: 'Physio',
  Scout: 'Scout',
  Manager: 'Manager',
  'Speler/Manager': 'Player/Manager',
  'Assistent-manager': 'Assistant manager',
  'Speler/Assistent-manager': 'Player/Assistant manager',
  'Media-analist': 'Set Piece Coach',
  'Algemeen manager': 'General manager',
  Fitnesscoach: 'Fitness coach',
  'Speler/Fitnesscoach': 'Player/Fitness coach',
  Keeperstrainer: 'Goalkeeping coach',
  'Speler/Keeperstrainer': 'Player/GK coach',
  'Hoofd data-analyse': 'Head of data analysis',
  Clubarts: 'Club doctor',
  'Hoofd sportwetenschap': 'Head of sports science',
  'Data-analist': 'Data analyst',
  Hoofdscout: 'Chief scout',
  'Speler/Hoofdscout': 'Player/Chief scout',
  Arts: 'Doctor',
  Sportwetenschapper: 'Sports scientist',
  'Speler/Jeugdtrainer': 'Player/Youth coach',
  'Hoofd fysiotherapie': 'Head physio',
  'U19-manager': 'U19 manager',
  'Trainer eerste elftal': 'First-team coach',
  'Hoofd jeugdopleiding': 'Head of youth development',
  'Speler/Hoofd jeugd': 'Player/Head of youth',
  Staflid: 'Staff',
  Eigenaar: 'Owner',
  President: 'President',
  Loanmanager: 'Loan manager',
  'Interim-manager': 'Caretaker manager',
};

const NON_RECRUITABLE_JOB_IDS = new Set([4, 6, 8, 66, 70]);
const NON_RECRUITABLE_JOB_NAMES = new Set([
  'chairman',
  'director',
  'managing director',
  'owner',
  'president',
]);
const staffRoleKey = (p) => {
  const id = Number(p?.jobId);
  return Number.isInteger(id) && JOB_LABEL[id]
    ? JOB_LABEL[id]
    : LEGACY_JOB_LABEL[p?.job] || p?.job || '';
};
function isRecruitableStaff(p) {
  const id = Number(p?.jobId);
  if (Number.isInteger(id) && NON_RECRUITABLE_JOB_IDS.has(id)) return false;
  return !NON_RECRUITABLE_JOB_NAMES.has(
    String(p?.job || '')
      .trim()
      .toLowerCase(),
  );
}
const jobLabel = (p) => {
  const L = JOB_LABEL;
  if (p && p.jobId && L[p.jobId]) return L[p.jobId];
  if (p && p.job && LEGACY_JOB_LABEL[p.job]) return LEGACY_JOB_LABEL[p.job];
  return (p && p.job) || (p && p.staffAttrs ? text('jobStaff') : '–');
};
const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));
// Role score on the 1-20 scale; key attributes count double. Requires attributes (players).
function roleScore(p, role) {
  if (!p.attrs) return null;
  let sum = 0,
    w = 0;
  for (const k of role.key) {
    const v = p.attrs[k];
    if (v != null) {
      sum += v * 2;
      w += 2;
    }
  }
  for (const k of role.pref) {
    const v = p.attrs[k];
    if (v != null) {
      sum += v;
      w += 1;
    }
  }
  return w ? sum / w : null;
}
function rolesForPos(posArr) {
  const set = new Set(posArr || []);
  if (!set.size) return ROLES; // unknown position: show all
  const isGk = set.has('GK');
  return ROLES.filter((r) => r.pos.some((x) => set.has(x)) && r.pos.includes('GK') === isGk);
}
// Best roles for a player (sorted), for the profile.
function bestRoles(p, n = 5) {
  return rolesForPos(p.posArr)
    .map((r) => ({ id: r.id, score: roleScore(p, r) }))
    .filter((x) => x.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
const roleClass = (v) =>
  v == null ? '' : v >= 15 ? 'g5' : v >= 13 ? 'g4' : v >= 10.5 ? 'g3' : v >= 8 ? 'g2' : 'g1';

// Formats a raw meta points score for display.
const fmtMeta = (v) =>
  v == null ? '\u2013' : (v >= 0 ? '+' : '') + v.toFixed(2);
// metaClass: color band for a points score. Uses precomputed thresholds[group].
function metaClass(v, group) {
  if (v == null) return '';
  const t = META_PRESET && META_PRESET.thresholds && META_PRESET.thresholds[group];
  if (!t) return 'g2';
  return v >= t[3] ? 'g5' : v >= t[2] ? 'g4' : v >= t[1] ? 'g3' : v >= t[0] ? 'g2' : 'g1';
}

// ---------- meta-score (direct / points-contribution engine) ----------
// Source: attribute testing on a 38-match season (weight = points improvement attr 8→20).
// score = Σ (attr − 8) × coeff[attr] + (prof − 20) × coeff_prof
// Baseline 8, proficiency baseline 20 (Natural = no effect).
// All outfield positions share one unified weight table; GK uses a separate set.

// Shared outfield weights (DC/FB/DM/MC/WM/AM/ST all identical in the default direct preset).
const _OUTFIELD_W = {
  Pace: 64,
  Acceleration: 64,
  Stamina: 19,
  JumpingReach: 16,
  Balance: 13,
  Strength: 10,
  Agility: 8,
  NaturalFitness: 2,
  Anticipation: 18,
  WorkRate: 12,
  Concentration: 9,
  Determination: 6,
  Decisions: 1,
  Composure: 1,
  Dribbling: 19,
  Finishing: 8,
  LongShots: 6,
  Heading: 5,
  Crossing: 4,
  FirstTouch: 3,
  Passing: 2,
  Technique: 1,
  Tackling: 1,
  Consistency: 10,
  Corners: 0.5,
  FreeKicks: 0.5,
};

// Built-in preset (mirrors app/meta-presets/default_gk_mod.json).
// Used as the synchronous fallback before the async fetch completes.
const BUILTIN_PRESET = {
  name: 'FMSuperScout Direct',
  baseline: 8,
  proficiency_baseline: 20,
  group_scale: {
    GK: 1,
    DC: 10,
    FB: 10,
    DM: 10,
    MC: 10,
    WM: 10,
    AM: 10,
    ST: 10,
  },
  proficiency_test: { points: 6, range: 5 },
  attr_test_ranges: { JumpingReach: 9 },
  position_weights: {
    GK: {
      // 1.8x calibration aligns the all-20 GK score with the all-20 outfield score.
      Reflexes: 14.4,
      Agility: 10.8,
      Acceleration: 3.6,
      OneOnOnes: 0.54,
      AerialReach: 0.18,
      CommandOfArea: 0.18,
      Communication: 0.18,
      Handling: 0.18,
      Anticipation: 0.18,
      Concentration: 0.18,
      Positioning: 0.18,
    },
    DC: _OUTFIELD_W,
    FB: _OUTFIELD_W,
    DM: _OUTFIELD_W,
    MC: _OUTFIELD_W,
    WM: _OUTFIELD_W,
    AM: _OUTFIELD_W,
    ST: _OUTFIELD_W,
  },
  player_fields: {},
};

// ---------- per-position routing ----------
// Each FM position code maps to one of these named groups.
const POS_TO_META_GROUP = {
  GK: 'GK',
  DC: 'DC',
  DL: 'FB',
  DR: 'FB',
  WBL: 'FB',
  WBR: 'FB',
  DM: 'DM',
  MC: 'MC',
  ML: 'WM',
  MR: 'WM',
  AML: 'AM',
  AMR: 'AM',
  AMC: 'AM',
  ST: 'ST',
};

// Label shown next to each group's score in the player card
const META_GROUP_LABEL = {
  GK: 'GK',
  DC: 'DC',
  FB: 'FB',
  DM: 'DM',
  MC: 'MC',
  WM: 'WM',
  AM: 'AM',
  ST: 'ST',
};

// ── Runtime meta preset ──────────────────────────────────────────────────────
// Loaded from meta-presets/default_gk_mod.json at startup; can be swapped
// at runtime via the settings menu without touching source code.
// Falls back to BUILTIN_PRESET if the fetch fails.
let META_PRESET = null; // set by applyMetaPreset() before first render
let metaPositionScoresCache = new WeakMap();

// Position proficiency is immutable for the lifetime of a loaded player record. Cache whether
// newer dumps supplied it so filters and analysis do not allocate Object.keys arrays repeatedly.
function hasPositionProficiency(p) {
  if (p._hasPosProf === undefined) {
    const proficiency = p.posProficiency;
    p._hasPosProf = !!(proficiency && Object.keys(proficiency).length);
  }
  return p._hasPosProf;
}

// Install a parsed preset object as the active META_PRESET.
// Clears per-player meta caches so the next render recomputes scores with this preset.
//
// Only the direct (points-contribution) engine is supported:
// score = Σ (attr − baseline) × coeff[attr] + (prof − profBaseline) × coeff_prof
// Coefficients are precomputed here from the test-data weights stored in the JSON.
function metaSynergyContribution(synergy, getAttrValue) {
  const attrs = synergy.attributes || [];
  if (attrs.length !== 2) return 0;
  const [first, second] = attrs.map(getAttrValue);
  if (first == null || second == null) return 0;
  const from = synergy.from ?? 12;
  const to = synergy.to ?? 16;
  if (to <= from) return 0;
  const progress = (value) => Math.max(0, Math.min(1, (value - from) / (to - from)));
  return Math.max(0, synergy.points || 0) * Math.min(progress(first), progress(second));
}

function applyMetaPreset(data) {
  if (data.baseline == null) {
    console.error(
      'applyMetaPreset: preset missing "baseline" — only the direct engine is supported.',
    );
    return;
  }

  const W = data.position_weights || {};

  const baseline = data.baseline; // attribute baseline (e.g. 8)
  const profBaseline = data.proficiency_baseline ?? 20;
  const groupScale = data.group_scale || {};
  const profTest = data.proficiency_test || { points: 6, range: 5 };
  // Support from/to fields in addition to explicit range (editor saves all three)
  if (profTest.from != null && profTest.to != null)
    profTest.range = Math.max(1, Math.abs(profTest.to - profTest.from));
  const attrTestRanges = data.attr_test_ranges || {};
  const synergies = data.synergies || {};
  const defaultRange = 20 - baseline; // 12 for baseline=8

  const coeffs = {};
  const coeff_prof = {};
  const thresholds = {};
  const maxScores = {};

  for (const [g, Wg] of Object.entries(W)) {
    const scale = groupScale[g] ?? 10;
    const gCoeffs = {};
    for (const [attr, weight] of Object.entries(Wg)) {
      if (Array.isArray(weight)) {
        // Piecewise segments: [{from, to, pts}, ...]
        gCoeffs[attr] = weight.map((seg) => {
          const from = seg.from ?? 1,
            to = seg.to ?? 20;
          return {
            from,
            to,
            coeff: to - from > 0 ? (seg.pts ?? 0) / (scale * (to - from)) : 0,
          };
        });
      } else {
        const range = attrTestRanges[attr] ?? defaultRange;
        gCoeffs[attr] = weight / (scale * range);
      }
    }
    coeffs[g] = gCoeffs;
    if (profTest.segments && profTest.segments.length) {
      // Piecewise proficiency — store sorted descending [{from, to, coeff}]
      coeff_prof[g] = [...profTest.segments]
        .sort((a, b) => b.from - a.from)
        .map((seg) => {
          const from = seg.from ?? 1,
            to = seg.to ?? 20;
          return {
            from,
            to,
            coeff: to - from > 0 ? (seg.pts ?? 0) / (scale * (to - from)) : 0,
          };
        });
    } else {
      coeff_prof[g] = profTest.points / (scale * profTest.range);
    }
    // Thresholds: score of a fake player with all attrs = V (piecewise-aware).
    const clampContrib = (V, c) =>
      Array.isArray(c)
        ? c.reduce(
            (s, { from, to, coeff }) =>
              s +
              (Math.max(from, Math.min(to, V)) - Math.max(from, Math.min(to, baseline))) * coeff,
            0,
          )
        : (V - baseline) * c;
    const sumForV = (V) => Object.values(gCoeffs).reduce((s, c) => s + clampContrib(V, c), 0);
    const gSynergies = Array.isArray(synergies[g]) ? synergies[g] : [];
    const synergyForV = (V) =>
      gSynergies.reduce((sum, synergy) => sum + metaSynergyContribution(synergy, () => V), 0);
    thresholds[g] = [0, ...[11, 14, 17].map((value) => sumForV(value) + synergyForV(value))];

    // Find the perfect attribute contribution, allowing harmful attributes to be at 1.
    const maxForCoeff = (c) => {
      let max = -Infinity;
      for (let value = 1; value <= 20; value++) max = Math.max(max, clampContrib(value, c));
      return Number.isFinite(max) ? max : 0;
    };
    const cp = coeff_prof[g];
    const profAtNatural = (() => {
      if (!Array.isArray(cp)) return (20 - profBaseline) * cp;
      let sum = cp.reduce(
        (total, { from, to, coeff }) =>
          total +
          (Math.max(from, Math.min(to, 20)) -
            Math.max(from, Math.min(to, profBaseline))) *
            coeff,
        0,
      );
      const botSeg = cp[cp.length - 1];
      if (botSeg && botSeg.from > 1) {
        const extTo = botSeg.from - 1;
        sum +=
          (Math.max(1, Math.min(extTo, 20)) -
            Math.max(1, Math.min(extTo, profBaseline))) *
          botSeg.coeff;
      }
      return sum;
    })();
    maxScores[g] =
      Object.values(gCoeffs).reduce((sum, c) => sum + maxForCoeff(c), 0) +
      gSynergies.reduce((sum, synergy) => sum + Math.max(0, synergy.points || 0), 0) +
      profAtNatural;
  }

  // Several position groups can share the exact same attribute weights and synergies.
  // Calculate that raw score once per player and reuse it across equivalent groups.
  const rawGroupKeys = {};
  const rawGroupProfiles = new Map();
  for (const [g, gCoeffs] of Object.entries(coeffs)) {
    const groupSynergies = (Array.isArray(synergies[g]) ? synergies[g] : []).map((synergy) => ({
      attributes: synergy.attributes || [],
      from: synergy.from ?? 12,
      to: synergy.to ?? 16,
      points: Math.max(0, synergy.points || 0),
    }));
    const profile = JSON.stringify({ coeffs: gCoeffs, synergies: groupSynergies });
    let key = rawGroupProfiles.get(profile);
    if (key === undefined) {
      key = rawGroupProfiles.size;
      rawGroupProfiles.set(profile, key);
    }
    rawGroupKeys[g] = key;
  }

  META_PRESET = {
    name: data.name || 'Custom',
    weights: W,
    baseline,
    profBaseline,
    coeffs,
    coeff_prof,
    synergies,
    thresholds,
    maxScores,
    rawGroupKeys,
    maxScore: Math.max(0, ...Object.values(maxScores)),
    // player_fields: attr key → field name on the player object.
    playerFields: data.player_fields || {},
    raw: data,
  };

  vsPositionMetaCache = new WeakMap();
  vsPotentialMetaCache = new WeakMap();
  metaPositionScoresCache = new WeakMap();

  if (state.players) {
    for (const p of state.players) {
      delete p._meta;
      delete p._metaPa;
      delete p._metaGroup;
      delete p._metaPaGroup;
    }
  }
}

// Populate the position dropdown for the "show meta as" selector.
// Lists the FM positions that exist in the current preset, in a logical top-to-bottom order.
// Called after every applyMetaPreset() and on page load.
function populateMetaGroupSelect() {
  const sel = $('f-meta-group');
  if (!sel) return;
  // Canonical order: GK → defenders → DM → midfielders → attackers
  const knownPos = POS_ORDER;
  // Only show positions whose group exists in the preset
  const presetGroups = new Set(Object.keys(META_PRESET.coeffs || {}));
  const available = knownPos.filter((pos) => presetGroups.has(POS_TO_META_GROUP[pos]));
  sel.innerHTML =
    `<option value="">${text('metaViewBest')}</option>` +
    available
      .map(
        (pos) =>
          `<option value="${pos}"${state.metaViewPos === pos ? ' selected' : ''}>${pos}</option>`,
      )
      .join('');
}

// Initialise synchronously from the built-in preset so the first render works,
// even before the async JSON fetch completes.
applyMetaPreset(BUILTIN_PRESET);

// ── Meta-score calculation (reads from META_PRESET) ──────────────────────────

// Points-contribution scoring (META_PRESET.coeffs must be set).
// Returns the raw season-points delta relative to an all-attribute-8 baseline player,
// NOT including the proficiency term (that is added in metaScoresByPosition).
// Returns null if no attribute data is available.
function pointsContribution(p, attrs, group) {
  const gCoeffs = META_PRESET.coeffs && META_PRESET.coeffs[group];
  if (!gCoeffs) return null;
  const baseline = META_PRESET.baseline ?? 8;
  const playerFields = META_PRESET.playerFields;
  const getAttrValue = (attr) => {
    if (attr === 'Pressure') return p.pressure > 0 ? p.pressure : null;
    if (playerFields[attr] !== undefined) {
      const raw = p[playerFields[attr]];
      return raw != null && raw > 0 && raw <= 20 ? raw : null;
    }
    return attrs ? (attrs[attr] != null ? attrs[attr] : null) : null;
  };
  let sum = 0,
    hasAny = false;
  for (const [attr, coeff] of Object.entries(gCoeffs)) {
    const v = getAttrValue(attr);
    if (v == null) continue;
    if (Array.isArray(coeff)) {
      for (const { from, to, coeff: c } of coeff) {
        sum += (Math.max(from, Math.min(to, v)) - Math.max(from, Math.min(to, baseline))) * c;
      }
    } else {
      sum += (v - baseline) * coeff;
    }
    hasAny = true;
  }
  for (const synergy of META_PRESET.synergies?.[group] || []) {
    const bonus = metaSynergyContribution(synergy, getAttrValue);
    sum += bonus;
    if (bonus > 0) hasAny = true;
  }
  return hasAny ? sum : null;
}

// Returns {group → rawScore} for all meta groups using the given attrs (no proficiency applied).
function rawMetaByGroup(p, attrs) {
  const out = {};
  const profileScores = new Map();
  for (const g of Object.keys(META_PRESET.coeffs)) {
    const key = META_PRESET.rawGroupKeys?.[g] ?? g;
    let s;
    if (profileScores.has(key)) s = profileScores.get(key);
    else {
      s = pointsContribution(p, attrs, g);
      profileScores.set(key, s);
    }
    if (s != null) out[g] = s;
  }
  return out;
}

// Returns [{pos, group, label, prof, meta, effectiveMeta}] for each trained FM position,
// sorted by effectiveMeta desc.
// meta          = raw points delta relative to the all-8 baseline player
// effectiveMeta = meta + proficiency term (additive; below Accomplished the slope doubles)
// Falls back to posArr with prof=null (no penalty) when posProficiency is absent (old dump).
function metaScoresByPosition(p, attrs) {
  if (!attrs) return [];
  // Full position rows are only needed for the open profile. Keeping these arrays for
  // every player scored by list filters/sorting can create substantial memory pressure.
  const cacheForProfile = state.selected === p;
  let playerCache = cacheForProfile ? metaPositionScoresCache.get(p) : null;
  if (playerCache?.has(attrs)) return playerCache.get(attrs);

  const raw = rawMetaByGroup(p, attrs);
  const profDict = p.posProficiency;
  const hasProfData = hasPositionProficiency(p);
  const posEntries = hasProfData
    ? Object.entries(profDict)
    : (p.posArr || []).map((pos) => [pos, null]);
  const seen = new Set();
  const scores = posEntries
    .map(([pos, prof]) => {
      if (seen.has(pos)) return null;
      seen.add(pos);
      const group = POS_TO_META_GROUP[pos];
      if (!group) return null;
      const meta = raw[group];
      if (meta == null) return null;
      // Points-contribution engine: prof term is purely additive.
      // Below Accomplished (15) the scalar slope doubles.
      let effectiveMeta;
      const cp = META_PRESET.coeff_prof[group] || 0;
      if (Array.isArray(cp) && prof != null) {
        // Piecewise proficiency: clamp-integral over explicit segments.
        // Bottom segment's coeff extends implicitly down to 1.
        const profBase = META_PRESET.profBaseline ?? 20;
        let profTerm = 0;
        for (const { from, to, coeff } of cp) {
          profTerm +=
            (Math.max(from, Math.min(to, prof)) - Math.max(from, Math.min(to, profBase))) * coeff;
        }
        const botSeg = cp[cp.length - 1];
        if (botSeg && botSeg.from > 1) {
          const extTo = botSeg.from - 1;
          profTerm +=
            (Math.max(1, Math.min(extTo, prof)) - Math.max(1, Math.min(extTo, profBase))) *
            botSeg.coeff;
        }
        effectiveMeta = meta + profTerm;
      } else {
        // Scalar proficiency: (prof − profBaseline) × coeff_prof, slope doubles below Accomplished (15).
        effectiveMeta =
          meta + (prof != null ? (prof - META_PRESET.profBaseline) * cp * (prof < 15 ? 2 : 1) : 0);
      }
      return {
        pos,
        group,
        label: META_GROUP_LABEL[group],
        prof,
        meta,
        effectiveMeta,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.effectiveMeta - a.effectiveMeta);
  if (cacheForProfile && !playerCache) {
    playerCache = new WeakMap();
    metaPositionScoresCache.set(p, playerCache);
  }
  if (cacheForProfile) playerCache.set(attrs, scores);
  return scores;
}

// Single number for table sorting and display.
// When state.metaViewPos is set (e.g. 'DC', 'AML'), returns the effective meta for that exact
// FM position — including its own proficiency term — so DC and DL can differ for the same player.
// null = "best" mode: highest effective meta across all trained positions (default).
// Also caches p._metaGroup for colour classification.
function metaScore(p) {
  if (p._meta !== undefined) return p._meta;
  if (!p.attrs) {
    p._metaGroup = null;
    return (p._meta = null);
  }
  const positions = metaScoresByPosition(p, p.attrs);
  if (!positions.length) {
    p._metaGroup = null;
    return (p._meta = null);
  }
  if (state.metaViewPos) {
    const entry = positions.find((e) => e.pos === state.metaViewPos);
    if (entry) {
      p._metaGroup = entry.group;
      return (p._meta = entry.effectiveMeta);
    }
    p._metaGroup = null;
    return (p._meta = null);
  }
  p._metaGroup = positions[0].group;
  return (p._meta = positions[0].effectiveMeta);
}
// Returns the meta group of the best position (populates cache if needed).
function metaGroup(p) {
  if (p._metaGroup !== undefined) return p._metaGroup;
  metaScore(p);
  return p._metaGroup;
}

// PA-meta: same logic with projected attributes, same proficiency.
// Respects state.metaViewGroup — only considers the selected group when set.
function metaPaScore(p) {
  if (p._metaPa !== undefined) return p._metaPa;
  const cur = metaScore(p);
  let group = metaGroup(p);
  if (cur == null) {
    p._metaPaGroup = null;
    return (p._metaPa = null);
  }
  const proj = projectAttrs(p);
  if (!proj) {
    p._metaPaGroup = group;
    return (p._metaPa = cur);
  }
  const positions = metaScoresByPosition(p, proj);
  const relevant = state.metaViewPos
    ? positions.filter((e) => e.pos === state.metaViewPos)
    : positions;
  const best = relevant.length ? relevant[0] : null;
  if (best && best.effectiveMeta > cur) group = best.group;
  p._metaPaGroup = group;
  return (p._metaPa = best ? Math.max(cur, best.effectiveMeta) : cur);
}
function metaPaGroup(p) {
  if (p._metaPaGroup !== undefined) return p._metaPaGroup;
  metaPaScore(p);
  return p._metaPaGroup;
}
function metaHtml(p) {
  const s = metaScore(p);
  const g = metaGroup(p);
  return s == null
    ? '<span class="dim">–</span>'
    : `<span class="${metaClass(s, g)}" data-help="metaLabel">${fmtMeta(s, g)}</span>`;
}
function metaPaHtml(p) {
  const s = metaPaScore(p);
  const g = metaPaGroup(p);
  return s == null
    ? '<span class="dim">–</span>'
    : `<span class="${metaClass(s, g)}" data-help="metaPaHint">${fmtMeta(s, g)}</span>`;
}
// Use the development chart colors for growth. New players show "new" instead of a dash.
function growthHtml(p) {
  const g = caGrowth(p);
  if (g == null)
    return isNewSince(p)
      ? `<span class="gr-new">${text('grNew')}</span>`
      : '<span class="dim">–</span>';
  if (g === 0) return '<span class="dim">0</span>';
  return `<span class="gr-${g > 0 ? 'up' : 'down'}">${g > 0 ? '+' : '−'}${Math.abs(g)}</span>`;
}

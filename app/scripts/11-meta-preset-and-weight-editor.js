'use strict';

// ── Meta preset UI ────────────────────────────────────────────────────────────

function updatePresetLabel() {
  const el = $('meta-preset-name');
  if (el) el.textContent = META_PRESET ? META_PRESET.name : '…';
}

// Load a preset from a JSON object, persist it, refresh scores, re-render.
function loadAndApplyPreset(data) {
  try {
    applyMetaPreset(data);
    try {
      localStorage.setItem('fmss_meta_preset', JSON.stringify(data));
    } catch {}
    updatePresetLabel();
    populateMetaGroupSelect();
    renderTable();
  } catch (e) {
    console.error('Failed to apply meta preset:', e);
    alert(`${text('presetLoadError')}: ${e.message}`);
  }
}

// File picker: user selects a .json file
$('meta-preset-file').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      loadAndApplyPreset(JSON.parse(ev.target.result));
    } catch (e) {
      alert(`${text('presetInvalidFile')}: ${e.message}`);
    }
  };
  reader.readAsText(file);
  this.value = ''; // reset so the same file can be re-selected
});

$('meta-preset-load-btn').onclick = () => $('meta-preset-file').click();

$('meta-preset-reset-btn').onclick = async () => {
  try {
    const r = await fetch('/meta-presets/default_direct.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    loadAndApplyPreset(await r.json());
  } catch {
    // Network/file not found — fall back to built-in preset
    localStorage.removeItem('fmss_meta_preset');
    applyMetaPreset(BUILTIN_PRESET);
    updatePresetLabel();
    renderTable();
  }
};

$('meta-preset-edit-btn').onclick = () => openWeightEditor();

// ── Weight editor ─────────────────────────────────────────────────────────────

let _weActiveTab = '';
// _weSegments[g][attr] = [{from, to, pts}, ...] sorted descending by from (ceiling first)
let _weSegments = {};

// All FM attributes grouped by category, used to populate every position tab.
const WE_OUTFIELD_SECTIONS = [
  {
    label: 'Technical',
    color: '#7dd3fc',
    attrs: [
      'Corners',
      'Crossing',
      'Dribbling',
      'Finishing',
      'FirstTouch',
      'FreeKicks',
      'Heading',
      'LongShots',
      'LongThrows',
      'Marking',
      'Passing',
      'PenaltyTaking',
      'Tackling',
      'Technique',
    ],
  },
  {
    label: 'Mental',
    color: '#a5b4fc',
    attrs: [
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
  },
  {
    label: 'Physical',
    color: '#86efac',
    attrs: [
      'Acceleration',
      'Agility',
      'Balance',
      'JumpingReach',
      'NaturalFitness',
      'Pace',
      'Stamina',
      'Strength',
    ],
  },
  {
    label: 'Hidden',
    color: '#fca5a5',
    attrs: ['Consistency', 'ImportantMatches', 'InjuryProneness', 'Versatility', 'Dirtiness'],
  },
];
const WE_GK_SECTIONS = [
  {
    label: 'Goalkeeping',
    color: '#fdba74',
    attrs: [
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
      'Technique',
      'Throwing',
    ],
  },
  {
    label: 'Mental',
    color: '#a5b4fc',
    attrs: [
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
  },
  {
    label: 'Physical',
    color: '#86efac',
    attrs: [
      'Acceleration',
      'Agility',
      'Balance',
      'JumpingReach',
      'NaturalFitness',
      'Pace',
      'Stamina',
      'Strength',
    ],
  },
  {
    label: 'Hidden',
    color: '#fca5a5',
    attrs: ['Consistency', 'ImportantMatches', 'InjuryProneness', 'Versatility', 'Dirtiness'],
  },
];

const weSectionLabel = (label) => label;

// Return the English label for visible and hidden attributes.
function weAttrLabel(attribute) {
  const hiddenLabels = {
    Consistency: 'a_Consistency',
    ImportantMatches: 'a_ImportantMatches',
    InjuryProneness: 'a_InjuryProneness',
    Versatility: 'a_Versatility',
    Dirtiness: 'a_Dirtiness',
  };
  return (
    ATTR_LABEL[attribute] ?? (hiddenLabels[attribute] ? text(hiddenLabels[attribute]) : attribute)
  );
}

// ── Piecewise segment helpers ─────────────────────────────────────────────────

// Enforce ceiling=20, floor=1, derive all 'to' values from adjacent 'from' values.
function weNormalizeSegs(segs) {
  if (!segs || !segs.length) return [{ from: 1, to: 20, pts: 0 }];
  const s = [...segs].sort((a, b) => b.from - a.from);
  s[0].to = 20; // ceiling always locked
  for (let i = 1; i < s.length; i++) s[i].to = s[i - 1].from - 1; // derive all to's
  // floor NOT forced to 1 — bottom segment keeps its actual FROM (the test start)
  return s;
}

// Build the innerHTML for one attribute's segment rows (used both on init and on update).
// g/attr may be '' for the proficiency special case (uses weProfPtsChange / weProfBreakpoint).
function weBuildSegRows(g, attr, segs, scale, opts) {
  opts = opts || {};
  const isProficiency = opts.isProficiency || false;
  const N = segs.length;
  const inpS =
    'padding:1px 3px;background:#0f172a;border:1px solid #1e293b;color:#94a3b8;border-radius:3px;font-size:11px;text-align:center;box-sizing:border-box;width:27px;';

  let rows = segs
    .map((seg, i) => {
      const isFirst = i === 0,
        isLast = i === N - 1;
      const range = seg.to - seg.from;
      const coeff = range > 0 ? (seg.pts / (scale * range)).toFixed(4) : '—';
      const cc = seg.pts > 0 ? '#34d399' : seg.pts < 0 ? '#f87171' : '#475569';

      // FROM: editable unless it literally equals 1 (can't go below floor)
      // onchange (not oninput) so multi-digit numbers can be typed without mid-input clamping
      const fromLocked = seg.from === 1;
      const fromCell = fromLocked
        ? `<span style="${inpS}display:inline-block;color:#475569;">1</span>`
        : isProficiency
          ? `<input type="number" value="${seg.from}" min="1" max="20" step="1"
             style="${inpS}" onchange="weProfBreakpointChange(${i},this.value)">`
          : `<input type="number" value="${seg.from}" min="1" max="20" step="1"
             style="${inpS}" onchange="weBreakpointChange('${g}','${attr}',${i},this.value)">`;

      // TO: ceiling (20) locked for first; auto-derived for others
      const toCell = isFirst
        ? `<span style="${inpS}display:inline-block;color:#475569;">20</span>`
        : `<span style="${inpS}display:inline-block;color:#334155;">${seg.to}</span>`;

      const ptsOninput = isProficiency
        ? `weProfPtsChange(${i},this.value)`
        : `wePtsChange('${g}','${attr}',${i},this.value)`;
      const rmOninput = isProficiency
        ? `weProfRemoveSeg(${i})`
        : `weRemoveSeg('${g}','${attr}',${i})`;
      const rmBtn =
        N > 1
          ? `<button onclick="${rmOninput}"
           style="padding:0 4px;line-height:1.3;background:none;border:1px solid #334155;color:#64748b;border-radius:3px;font-size:10px;cursor:pointer;" title="${text('removeSegment')}">×</button>`
          : '<span style="display:inline-block;width:20px;"></span>';

      // ×2 / ÷2 slope buttons: only on non-first segments — sets this seg's pts relative to the segment above
      const btnStyle =
        'padding:0 3px;line-height:1.3;background:none;border:1px solid #334155;color:#7dd3fc;border-radius:3px;font-size:9px;cursor:pointer;';
      const slopeBtns =
        i > 0
          ? isProficiency
            ? `<button onclick="weProfSlopeMultiply(${i},2)"   style="${btnStyle}" title="${text('doubleSlope')}">×2</button>` +
              `<button onclick="weProfSlopeMultiply(${i},0.5)" style="${btnStyle}" title="${text('halveSlope')}">÷2</button>`
            : `<button onclick="weSlopeMultiply('${g}','${attr}',${i},2)"   style="${btnStyle}" title="${text('doubleSlope')}">×2</button>` +
              `<button onclick="weSlopeMultiply('${g}','${attr}',${i},0.5)" style="${btnStyle}" title="${text('halveSlope')}">÷2</button>`
          : '';

      return `<div style="display:flex;align-items:center;gap:3px;padding:1px 0;">
      <input type="number" class="${isProficiency ? 'we-prof-pts' : 'we-pts'}"
        ${isProficiency ? '' : `data-we-group="${g}" data-attr="${attr}"`}
        data-scale="${scale}" data-seg="${i}"
        value="${seg.pts}" step="0.5" oninput="${ptsOninput}"
        style="width:54px;padding:2px 4px;background:#0f172a;border:1px solid #334155;color:#fff;border-radius:4px;font-size:12px;text-align:right;box-sizing:border-box;">
      <span style="font-size:10px;color:#475569;">pts</span>
      ${fromCell}<span style="font-size:10px;color:#334155;">→</span>${toCell}
      <span style="font-size:11px;color:${cc};font-family:monospace;min-width:44px;text-align:right;">${coeff}</span>
      ${slopeBtns}${rmBtn}
    </div>`;
    })
    .join('');

  // Extension note: when the bottom segment doesn't reach 1, behaviour continues downward.
  // • attrs / multi-seg prof: same coeff (piecewise clamp-integral extension)
  // • single-seg prof: legacy scalar path doubles the coeff below Accomplished (15)
  const bottom = segs[N - 1];
  if (bottom && bottom.from > 1) {
    const extRange = bottom.to - bottom.from;
    const extCoeff = extRange > 0 ? (bottom.pts / (scale * extRange)).toFixed(4) : '—';
    const noteLabel = isProficiency && N === 1 ? tf('weightBelow', { n: 15 }) : text('weightSame');
    rows += `<div style="display:flex;align-items:center;gap:3px;padding:1px 0;opacity:0.45;font-style:italic;">
      <span style="width:54px;font-size:10px;color:#475569;text-align:right;">${noteLabel}</span>
      <span style="font-size:10px;color:#475569;margin-left:4px;">1 → ${bottom.from - 1}</span>
      <span style="font-size:10px;font-family:monospace;min-width:44px;margin-left:auto;color:#334155;">${extCoeff}</span>
      <span style="display:inline-block;width:20px;"></span>
    </div>`;
  }

  return rows;
}

// Re-render one attribute's segment rows from _weSegments state.
function weRenderAttrSegs(g, attr) {
  const box = document.getElementById(`we-segbox-${g}-${attr}`);
  if (!box) return;
  const scale = parseFloat(box.dataset.scale) || 10;
  const segs = (_weSegments[g] || {})[attr] || [];
  box.innerHTML = weBuildSegRows(g, attr, segs, scale);
}

function weBreakpointChange(g, attr, idx, val) {
  const segs = (_weSegments[g] || {})[attr];
  if (!segs) return;
  const isLast = idx === segs.length - 1;
  // Bottom segment's from = test-range start (can be e.g. 8, min=1)
  // Interior breakpoints: must stay between adjacent segments
  const lo = isLast ? 1 : idx + 1 < segs.length ? segs[idx + 1].from + 1 : 1;
  const hi = idx > 0 ? segs[idx - 1].from - 1 : 20;
  const v = Math.max(lo, Math.min(hi, parseInt(val) || lo));
  segs[idx].from = v;
  // Re-derive the segment immediately below
  if (idx + 1 < segs.length) segs[idx + 1].to = v - 1;
  weRenderAttrSegs(g, attr);
}

function wePtsChange(g, attr, idx, val) {
  const segs = (_weSegments[g] || {})[attr];
  if (segs && segs[idx] != null) segs[idx].pts = parseFloat(val) || 0;
  weRenderAttrSegs(g, attr);
}

function weAddSeg(g, attr) {
  if (!_weSegments[g]) _weSegments[g] = {};
  const segs = _weSegments[g][attr];
  if (!segs || !segs.length) return;
  const last = segs[segs.length - 1];
  if (last.from > 1) {
    // Add an explicit lower segment [1, last.from-1] — the "extension" becomes editable
    segs.push({ from: 1, to: last.from - 1, pts: 0 });
  } else {
    // Bottom already at 1 — split it at midpoint
    const span = last.to - last.from;
    if (span < 1) return;
    const mid = last.from + Math.ceil(span / 2);
    segs.push({ from: 1, to: mid - 1, pts: 0 });
    last.from = mid;
  }
  _weSegments[g][attr] = weNormalizeSegs(segs);
  weRenderAttrSegs(g, attr);
}

function weRemoveSeg(g, attr, idx) {
  const segs = (_weSegments[g] || {})[attr] || [];
  if (segs.length <= 1) return;
  segs.splice(idx, 1);
  _weSegments[g][attr] = weNormalizeSegs(segs);
  weRenderAttrSegs(g, attr);
}

// ── Proficiency segment state ─────────────────────────────────────────────────
// Same piecewise model as attributes, stored module-level since there's only one proficiency.
let _weProfSegs = []; // [{from, to, pts}, ...] sorted descending

function weRenderProfSegs() {
  const box = document.getElementById('we-prof-segbox');
  if (!box) return;
  const scale = parseFloat(box.dataset.scale) || 10;
  box.innerHTML = weBuildSegRows('', '', _weProfSegs, scale, {
    isProficiency: true,
  });
}

function weProfPtsChange(idx, val) {
  if (_weProfSegs[idx] != null) _weProfSegs[idx].pts = parseFloat(val) || 0;
  weRenderProfSegs();
}

function weProfBreakpointChange(idx, val) {
  const segs = _weProfSegs;
  const isLast = idx === segs.length - 1;
  const lo = isLast ? 1 : idx + 1 < segs.length ? segs[idx + 1].from + 1 : 1;
  const hi = idx > 0 ? segs[idx - 1].from - 1 : 20;
  const v = Math.max(lo, Math.min(hi, parseInt(val) || lo));
  segs[idx].from = v;
  if (idx + 1 < segs.length) segs[idx + 1].to = v - 1;
  weRenderProfSegs();
}

function weProfAddSeg() {
  const segs = _weProfSegs;
  if (!segs.length) return;
  const last = segs[segs.length - 1];
  if (last.from > 1) {
    segs.push({ from: 1, to: last.from - 1, pts: 0 });
  } else {
    const span = last.to - last.from;
    if (span < 1) return;
    const mid = last.from + Math.ceil(span / 2);
    segs.push({ from: 1, to: mid - 1, pts: 0 });
    last.from = mid;
  }
  _weProfSegs = weNormalizeSegs(segs);
  weRenderProfSegs();
}

function weProfRemoveSeg(idx) {
  if (_weProfSegs.length <= 1) return;
  _weProfSegs.splice(idx, 1);
  _weProfSegs = weNormalizeSegs(_weProfSegs);
  weRenderProfSegs();
}

// Set pts of segment idx so its slope = factor × slope of segment idx-1.
// "slope" = pts per scale-unit per range-unit = pts / (scale × range).
function weSlopeMultiply(g, attr, idx, factor) {
  const segs = (_weSegments[g] || {})[attr] || [];
  if (idx < 1 || idx >= segs.length) return;
  const box = document.getElementById(`we-segbox-${g}-${attr}`);
  const scale = box ? parseFloat(box.dataset.scale) || 10 : 10;
  const ref = segs[idx - 1];
  const refRange = ref.to - ref.from;
  if (refRange <= 0) return;
  const refCoeff = ref.pts / (scale * refRange);
  const thisRange = segs[idx].to - segs[idx].from;
  if (thisRange <= 0) return;
  segs[idx].pts = Math.round(refCoeff * factor * scale * thisRange * 100) / 100;
  weRenderAttrSegs(g, attr);
}

function weProfSlopeMultiply(idx, factor) {
  const segs = _weProfSegs;
  if (idx < 1 || idx >= segs.length) return;
  const box = document.getElementById('we-prof-segbox');
  const scale = box ? parseFloat(box.dataset.scale) || 10 : 10;
  const ref = segs[idx - 1];
  const refRange = ref.to - ref.from;
  if (refRange <= 0) return;
  const refCoeff = ref.pts / (scale * refRange);
  const thisRange = segs[idx].to - segs[idx].from;
  if (thisRange <= 0) return;
  segs[idx].pts = Math.round(refCoeff * factor * scale * thisRange * 100) / 100;
  weRenderProfSegs();
}

function openWeightEditor() {
  const modal = $('weight-editor-modal');
  if (!modal) return;

  if (!META_PRESET) return;

  // Reset editor state
  _weSegments = {};

  const raw = META_PRESET.raw || {};
  const posW = raw.position_weights || {};
  const groupScale = raw.group_scale || {};
  const profTest = raw.proficiency_test || { points: 6, range: 5 };
  const attrRanges = raw.attr_test_ranges || {};
  const attrFrom = raw.attr_test_from || {};
  const baseline = raw.baseline ?? 8;
  const profBaseline = raw.proficiency_baseline ?? 20;
  const defaultRange = 20 - baseline;

  const profFrom = profTest.from ?? 15;
  const profTo = profTest.to ?? profFrom + (profTest.range ?? 5);

  const GROUP_ORDER = ['GK', 'DC', 'FB', 'DM', 'MC', 'WM', 'AM', 'ST'];
  const groups = GROUP_ORDER.filter((g) => posW[g]);
  if (!groups.length) return;
  const firstGroup = groups[0];
  _weActiveTab = firstGroup;

  // ── Explanation ──
  const scaleDesc =
    Object.entries(groupScale)
      .map(([g, s]) => `${g}=${s}`)
      .join(', ') ||
    tf('weightScaleDefault', {
      outfield: text('weightOutfield'),
      goalkeeper: text('weightGoalkeeper'),
    });
  const profRange = profTo - profFrom;
  const cpOut = profRange > 0 ? (profTest.points / (10 * profRange)).toFixed(4) : '—';
  const cpGk = profRange > 0 ? (profTest.points / (1 * profRange)).toFixed(4) : '—';

  const explanation = `<details style="margin:0;padding:12px 20px;background:#080e1a;border-bottom:1px solid #1e293b;font-size:12px;color:#64748b;flex-shrink:0;">
    <summary style="cursor:pointer;font-weight:bold;color:#94a3b8;user-select:none;">${text('weightHow')}</summary>
    <div style="margin-top:10px;line-height:1.7;">
      <p style="margin:0 0 8px;"><strong style="color:#e2e8f0;">${text('weightPts')}</strong> = ${text('weightPtsIntro')} <strong>${text('weightTestPlayers')}</strong>, ${text('weightPtsMeasure')} <strong>${text('weightSeason')}</strong>.</p>
      <p style="margin:0 0 4px;"><strong style="color:#e2e8f0;">${text('weightPiecewise')}:</strong> ${text('weightPiecewiseIntro')} <strong style="color:#7dd3fc;">+</strong> ${text('weightPiecewiseEnd')}</p>
      <code style="display:block;background:#0f172a;border:1px solid #1e293b;padding:8px 12px;border-radius:6px;color:#7dd3fc;font-size:11px;margin:6px 0 8px;line-height:1.8;">score = Σ_segments [ (attr clamped to seg) − (baseline clamped to seg) ] × (pts ÷ (scale × (TO−FROM)))<br>      + (prof − ${profBaseline}) × (profPts ÷ (scale × (profTO−profFROM)))</code>
      <ul style="margin:4px 0 0;padding-left:18px;">
        <li><strong style="color:#e2e8f0;">${text('weightScale')}</strong> — ${scaleDesc}</li>
        <li><strong style="color:#e2e8f0;">${text('weightNegativePts')}</strong> ${text('weightAllowed')} ${escHtml(attrName('InjuryProneness'))})</li>
        <li><strong style="color:#e2e8f0;">${text('weightProficiency')}</strong> — ${text('weightNatural')} (${profBaseline}) = +0; ${text('weightPenalty')} <strong>${text('weightDoublesBelow')} (15)</strong></li>
        <li>${text('weightCurrentCoeff')}: <strong style="color:#34d399;">${cpOut}</strong> (${text('weightOutfield')}) / <strong style="color:#34d399;">${cpGk}</strong> (${text('weightGoalkeeper')})</li>
      </ul>
    </div>
  </details>`;

  // ── Baseline explanation banner ──
  const baselineBanner = `<div style="padding:7px 20px;background:#070d1a;border-bottom:1px solid #1e293b;font-size:11px;color:#64748b;flex-shrink:0;line-height:1.6;">
    <span style="color:#94a3b8;font-weight:bold;">📐 ${text('weightBaseline')}: </span>
    <strong style="color:#7dd3fc;">meta = 0</strong> → ${text('weightPlayerAt')} <strong style="color:#e2e8f0;">${baseline}</strong>.
    &nbsp;&nbsp;
    <strong style="color:#34d399;">effective_meta = 0</strong> → ${text('weightSameNatural')} (<strong style="color:#e2e8f0;">${profBaseline}</strong>).
  </div>`;

  // ── Tabs ──
  const tabsHtml = groups
    .map(
      (g) =>
        `<button class="we-tab-btn" data-g="${g}" onclick="weShowTab('${g}')"
      style="padding:4px 11px;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer;border:1px solid #334155;transition:none;
             background:${g === firstGroup ? '#3b82f6' : '#0f172a'};color:${g === firstGroup ? '#fff' : '#64748b'};border-color:${g === firstGroup ? '#3b82f6' : '#334155'};">${g}</button>`,
    )
    .join('');

  // ── Attribute grids (flex-column, one per position group) ──
  function buildGrid(g) {
    const existingW = posW[g] || {};
    const scale = groupScale[g] ?? 10;
    const sections = g === 'GK' ? WE_GK_SECTIONS : WE_OUTFIELD_SECTIONS;
    if (!_weSegments[g]) _weSegments[g] = {};

    const colHdr = `<div style="display:flex;align-items:center;gap:6px;padding:0 0 4px;border-bottom:1px solid #1e293b;margin-bottom:4px;">
      <span style="flex:0 0 130px;font-size:10px;color:#334155;font-weight:bold;">${text('weightAttribute')}</span>
      <span style="font-size:10px;color:#334155;font-weight:bold;min-width:54px;text-align:right;">${text('weightPts')}</span>
      <span style="font-size:10px;color:#334155;font-weight:bold;margin-left:4px;">${text('weightFromTo')}</span>
      <span style="font-size:10px;color:#334155;font-weight:bold;margin-left:auto;">${text('weightCoeff')}</span>
    </div>`;

    let rows = '';
    sections.forEach((sec) => {
      rows += `<div style="font-size:9px;font-weight:bold;color:${sec.color};text-transform:uppercase;letter-spacing:.07em;padding:8px 0 3px 0;border-bottom:1px solid #1e293b;">${weSectionLabel(sec.label)}</div>`;
      sec.attrs.forEach((attr) => {
        // Build initial segments from existing weight data
        const existing = existingW[attr];
        let segs;
        if (Array.isArray(existing)) {
          segs = weNormalizeSegs(
            existing.map((s) => ({
              from: s.from ?? 1,
              to: s.to ?? 20,
              pts: s.pts ?? 0,
            })),
          );
        } else {
          const pts = typeof existing === 'number' ? existing : 0;
          const from = attrFrom[attr] ?? baseline;
          const rng = attrRanges[attr] ?? defaultRange;
          const to = Math.min(20, from + rng);
          segs = weNormalizeSegs([{ from, to, pts }]);
        }
        _weSegments[g][attr] = segs;
        const segRowsHtml = weBuildSegRows(g, attr, segs, scale);

        rows += `<div style="display:flex;align-items:flex-start;gap:6px;padding:3px 0 4px;border-bottom:1px solid #0c1829;">
          <label style="flex:0 0 130px;font-size:12px;color:#cbd5e1;padding-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(attr)}">${escHtml(weAttrLabel(attr))}</label>
          <div id="we-segbox-${g}-${attr}" data-scale="${scale}" style="flex:1;display:flex;flex-direction:column;gap:1px;">
            ${segRowsHtml}
          </div>
          <button onclick="weAddSeg('${g}','${attr}')"
            style="margin-top:4px;padding:1px 6px;background:none;border:1px solid #1e293b;color:#475569;border-radius:4px;font-size:12px;cursor:pointer;flex-shrink:0;" title="${text('addSegment')}">+</button>
        </div>`;
      });
    });

    return `<div class="we-grid" data-g="${g}"
      style="display:${g === firstGroup ? 'flex' : 'none'};flex-direction:column;padding:10px 0;">
      ${colHdr}${rows}
    </div>`;
  }

  const gridsHtml = groups.map((g) => buildGrid(g)).join('');

  // ── Proficiency segment state init ──
  // If preset has explicit segments use them; otherwise derive from scalar test range.
  const firstScale = groupScale[groups[0]] ?? 10;
  if (profTest.segments && profTest.segments.length) {
    _weProfSegs = weNormalizeSegs(
      profTest.segments.map((s) => ({
        from: s.from ?? 1,
        to: s.to ?? 20,
        pts: s.pts ?? 0,
      })),
    );
  } else {
    // Legacy single segment: show the actual tested range (profFrom → 20)
    _weProfSegs = weNormalizeSegs([{ from: profFrom, to: 20, pts: profTest.points ?? 6 }]);
  }
  const profSegHtml = weBuildSegRows('', '', _weProfSegs, firstScale, {
    isProficiency: true,
  });

  // ── Proficiency row ──
  const profRow = `<div style="padding:8px 20px;background:#0a1020;border-bottom:1px solid #1e293b;flex-shrink:0;font-size:12px;color:#64748b;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <span style="font-weight:bold;color:#94a3b8;">${text('weightProficiencyTitle')}</span>
      <span style="font-size:11px;color:#334155;">${text('weightProfLevels')}</span>
      <button onclick="weProfAddSeg()"
        style="margin-left:auto;padding:1px 6px;background:none;border:1px solid #1e293b;color:#475569;border-radius:4px;font-size:12px;cursor:pointer;" title="${text('addProficiency')}">+</button>
    </div>
    <div id="we-prof-segbox" data-scale="${firstScale}" style="display:flex;flex-direction:column;gap:1px;padding-left:4px;">
      ${profSegHtml}
    </div>
  </div>`;

  // ── Full modal ──
  modal.innerHTML = `<div style="background:#0f172a;width:100%;max-width:780px;max-height:90vh;border:1px solid #334155;border-radius:16px;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,0.7);overflow:hidden;">

    <div style="padding:14px 20px;background:#1e293b;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
      <h2 style="margin:0;font-size:15px;color:#fff;font-weight:bold;">${tf('weightEditorTitle', { name: escHtml(META_PRESET.name || text('weightDefaultPreset')) })}</h2>
      <button onclick="closeWeightEditor()" aria-label="${text('close')}" style="background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;line-height:1;">✕</button>
    </div>

    ${baselineBanner}
    ${explanation}

    <div style="padding:10px 20px;background:#111827;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex-shrink:0;">
      <div style="display:flex;gap:5px;flex-wrap:wrap;">${tabsHtml}</div>
      <button id="we-copy-btn" onclick="weCopyToOutfield()"
        style="margin-left:auto;padding:3px 10px;background:#7c3aed;color:#fff;border:none;border-radius:5px;font-size:11px;cursor:pointer;display:${firstGroup === 'GK' ? 'none' : ''};">
        ${text('weightCopyOutfield')}
      </button>
    </div>

    ${profRow}

    <div style="padding:0 20px;overflow-y:auto;flex-grow:1;">${gridsHtml}</div>

    <div style="padding:12px 20px;background:#1e293b;border-top:1px solid #334155;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;">
      <button onclick="weDownloadJson()" style="padding:6px 14px;background:#0f172a;color:#94a3b8;border:1px solid #334155;border-radius:6px;font-size:12px;cursor:pointer;">${text('weightDownloadJson')}</button>
      <button onclick="weApply()" style="padding:6px 16px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer;">${text('weightApplyClose')}</button>
      <button onclick="closeWeightEditor()" style="padding:6px 14px;background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:6px;font-size:12px;cursor:pointer;">${text('weightCancel')}</button>
    </div>
  </div>`;

  modal.style.display = 'flex';
}

function closeWeightEditor() {
  const modal = $('weight-editor-modal');
  if (modal) modal.style.display = 'none';
}

function weShowTab(group) {
  _weActiveTab = group;
  document.querySelectorAll('.we-tab-btn').forEach((b) => {
    const active = b.dataset.g === group;
    b.style.background = active ? '#3b82f6' : '#0f172a';
    b.style.color = active ? '#fff' : '#64748b';
    b.style.borderColor = active ? '#3b82f6' : '#334155';
  });
  document.querySelectorAll('.we-grid').forEach((d) => {
    d.style.display = d.dataset.g === group ? 'flex' : 'none';
  });
  const copyBtn = $('we-copy-btn');
  if (copyBtn) copyBtn.style.display = group === 'GK' ? 'none' : '';
}

function weBuildJson() {
  const raw = META_PRESET.raw || {};
  const baseline = raw.baseline ?? 8;
  const defaultRange = 20 - baseline;
  const posW = {},
    newRanges = {},
    newFrom = {};

  // Read from _weSegments (editor source of truth)
  for (const [g, gSegs] of Object.entries(_weSegments)) {
    posW[g] = {};
    for (const [attr, segs] of Object.entries(gSegs)) {
      if (!segs || !segs.length) continue;
      if (segs.length === 1) {
        // Single segment → scalar weight (backward compatible)
        const { from, to, pts } = segs[0];
        if (pts !== 0) posW[g][attr] = pts;
        const range = to - from;
        if (range !== defaultRange) newRanges[attr] = range;
        if (from !== baseline) newFrom[attr] = from;
      } else {
        // Multi-segment → array weight (only if at least one non-zero pts)
        if (segs.some((s) => s.pts !== 0)) {
          posW[g][attr] = segs.map(({ from, to, pts }) => ({ from, to, pts }));
        }
      }
    }
  }

  // Proficiency: serialize from _weProfSegs
  let proficiencyTest;
  if (_weProfSegs.length === 1) {
    // Single segment → store in old scalar format (backward compat)
    const { from, to, pts } = _weProfSegs[0];
    const range = Math.max(1, to - from);
    proficiencyTest = { points: pts, from, to, range };
  } else {
    // Multiple segments → store as segments array; also keep scalar fields for fallback readers
    const top = _weProfSegs[0];
    const range = Math.max(1, top.to - top.from);
    proficiencyTest = {
      points: top.pts,
      from: top.from,
      to: top.to,
      range,
      segments: _weProfSegs.map(({ from, to, pts }) => ({ from, to, pts })),
    };
  }

  const result = {
    ...raw,
    position_weights: posW,
    proficiency_test: proficiencyTest,
    name: (raw.name || 'Custom') + ' (edited)',
  };
  if (Object.keys(newRanges).length) result.attr_test_ranges = newRanges;
  else delete result.attr_test_ranges;
  if (Object.keys(newFrom).length) result.attr_test_from = newFrom;
  else delete result.attr_test_from;
  return result;
}

function weCopyToOutfield() {
  const src = _weActiveTab;
  if (!src || src === 'GK') return;
  const srcSegs = _weSegments[src] || {};
  ['DC', 'FB', 'DM', 'MC', 'WM', 'AM', 'ST']
    .filter((g) => g !== src)
    .forEach((g) => {
      if (!_weSegments[g]) _weSegments[g] = {};
      for (const [attr, segs] of Object.entries(srcSegs)) {
        _weSegments[g][attr] = segs.map((s) => ({ ...s })); // deep copy
        weRenderAttrSegs(g, attr);
      }
    });
  showToast(text('weightsCopied'), 'check');
}

function weApply() {
  loadAndApplyPreset(weBuildJson());
  closeWeightEditor();
}

function weDownloadJson() {
  const data = weBuildJson();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (data.name || 'meta-preset').replace(/\s+/g, '_') + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Async startup: try localStorage → fetch default_direct.json → BUILTIN_PRESET (already applied).
(async () => {
  // 1. Restore last-used preset from localStorage
  try {
    const saved = localStorage.getItem('fmss_meta_preset');
    if (saved) {
      applyMetaPreset(JSON.parse(saved));
      updatePresetLabel();
      populateMetaGroupSelect();
      // Players may already be rendered; re-render to pick up restored preset.
      if (state.players && state.players.length) renderTable();
      return;
    }
  } catch {}
  // 2. Fetch the bundled default_direct.json and apply it (upgrades BUILTIN_PRESET in place)
  try {
    const r = await fetch('/meta-presets/default_direct.json');
    if (r.ok) {
      applyMetaPreset(await r.json());
      updatePresetLabel();
      populateMetaGroupSelect();
      // No re-render needed: default_direct.json is identical to BUILTIN_PRESET.
      return;
    }
  } catch {}
  // 3. Already running on BUILTIN_PRESET — just update the label.
  updatePresetLabel();
  populateMetaGroupSelect();
})();

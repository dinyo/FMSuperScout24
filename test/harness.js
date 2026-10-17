'use strict';

const fs = require('fs');
const path = require('path');

// Create a no-op element stub for browser APIs that model tests do not need.
function stub() {
  const fn = () => stub();
  return new Proxy(fn, {
    get(_, prop) {
      if (prop === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (prop === 'style' || prop === 'dataset') return {};
      if (prop === 'checked') return false;
      if (
        prop === 'value' ||
        prop === 'textContent' ||
        prop === 'innerHTML' ||
        prop === 'placeholder' ||
        prop === 'title' ||
        prop === 'className'
      )
        return '';
      if (prop === 'length') return 0;
      if (prop === Symbol.toPrimitive) return () => '';
      return stub();
    },
    set() {
      return true;
    },
    apply() {
      return stub();
    },
  });
}

function loadApp() {
  // Follow the same script order as the browser entry point.
  const appDirectory = path.join(__dirname, '..', 'app');
  const html = fs.readFileSync(path.join(appDirectory, 'index.html'), 'utf8');
  const defaultPreset = JSON.parse(
    fs.readFileSync(path.join(appDirectory, 'meta-presets', 'default_gk_mod.json'), 'utf8'),
  );
  const scriptPaths = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(
    ([, source]) => path.join(appDirectory, source),
  );
  const src = scriptPaths.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const el = () => stub();
  const documentStub = {
    getElementById: el,
    createElement: el,
    querySelector: el,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    documentElement: stub(),
    body: stub(),
  };
  const windowStub = { open() {}, innerWidth: 1440, addEventListener() {}, location: { reload() {} } };
  const localStorageStub = { getItem: () => null, setItem() {}, removeItem() {} };
  const navigatorStub = { clipboard: { writeText: () => Promise.resolve() }, sendBeacon() {} };
  const fetchStub = (url) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          url === '/meta-presets/default_gk_mod.json'
            ? defaultPreset
            : { players: [], staff: [], meta: {}, running: false },
        ),
      text: () => Promise.resolve(''),
    });
  const noopTimer = () => 0;

  const exposed = [
    'feeMultiplier',
    'feeEstimate',
    'roleScore',
    'preferredJobLabel',
    'currentJobLabel',
    'jobLabel',
    'staffRoleKey',
    'staffJobInterestsHtml',
    'projectAttrs',
    'parseMoney',
    'monthsUntil',
    'getAge',
    'gameNow',
    'isEu',
    'isFree',
    'wSat',
    'bestRoles',
    'rolesForPos',
    'physGrowthFactor',
    'mentalGrowthFactor',
    'state',
    'ROLE_BY_ID',
    'ROLES',
    'buildDivisions',
    'ATTR_LABEL',
    'STAFF_ATTR_LABEL',
    'staffAttrName',
    'advValue',
    'advLabel',
    'isStaffAttrKey',
    'ROLE_LABEL',
    'metaScore',
    'metaPaScore',
    'NATIONS',
    'JOB_LABEL',
    'natsLabel',
    'jobLabel',
    'fmtWage',
    'wageFactor',
    'teamGroup',
    'bestMetaForSlot',
    'metaScoresByPosition',
    'findOptimalLineup',
    'indexPositionScores',
    'xiPlayingTimeScore',
    'renderXiModeCards',
    'renderXiRemainingCard',
    'renderBestXI',
    'xiViewFiltersHtml',
    'baseCols',
    'solveMinCostAssignment',
    'autoDetectBestFormation',
    'XI_FORMATIONS',
    'TEXT',
    'FORMAT_LOCALE',
  ];
  const body =
    src +
    '\n;return {' +
    exposed
      .map((name) => `${name}: typeof ${name} !== 'undefined' ? ${name} : undefined`)
      .join(',') +
    '};';
  const factory = new Function(
    'document',
    'window',
    'localStorage',
    'navigator',
    'fetch',
    'setTimeout',
    'setInterval',
    'clearTimeout',
    'clearInterval',
    'console',
    body,
  );
  return factory(
    documentStub,
    windowStub,
    localStorageStub,
    navigatorStub,
    fetchStub,
    noopTimer,
    noopTimer,
    () => {},
    () => {},
    console,
  );
}

module.exports = { loadApp };

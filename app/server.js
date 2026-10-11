// FMSuperScout 24 — local server (no dependencies needed)
// Serves the web app and the latest dump from the native FM24 reader.
'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { createShortlistFmf, importShortlistFmf } = require('./fmf');

const PORT = Number(process.env.PORT) || 8766;
const APP_DIR = __dirname;
// Use a separate data directory so this FM24 edition stays isolated from the original app.
const DATA_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'FMSuperScout24',
);

// FM24 does not have a Unity/BepInEx layer. The button starts a separate 64-bit
// reader process that opens fm.exe with PROCESS_VM_READ and writes dump.json atomically.
const READER_PROJECT = path.join(APP_DIR, '..', 'reader', 'FMSuperScout.Reader.csproj');
const READER_EXES = [
  process.env.FMSS_READER,
  path.join(
    APP_DIR,
    '..',
    'reader',
    'bin',
    'Release',
    'net6.0-windows',
    'win-x64',
    'publish',
    'FMSuperScout24.Reader.exe',
  ),
  path.join(
    APP_DIR,
    '..',
    'reader',
    'bin',
    'Release',
    'net6.0-windows',
    'win-x64',
    'FMSuperScout24.Reader.exe',
  ),
  path.join(APP_DIR, '..', 'reader', 'FMSuperScout24.Reader.exe'),
].filter(Boolean);
let scanProcess = null;
let scanMode = null;

function writeReaderStatus(state, error = null) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, 'status.json');
    fs.writeFileSync(
      file + '.tmp',
      JSON.stringify({
        state,
        players: 0,
        staff: 0,
        progress: 0,
        error,
        at: new Date().toISOString().slice(0, 19),
      }),
    );
    fs.renameSync(file + '.tmp', file);
  } catch {}
}

function startReader(mode = 'dump') {
  if (scanProcess && scanProcess.exitCode === null) return scanProcess;
  const exe = READER_EXES.find((p) => p && fs.existsSync(p));
  let command, args, cwd;
  if (exe) {
    command = exe;
    args = mode === 'shortlist' ? ['--shortlist'] : [];
    cwd = path.dirname(exe);
  } else if (fs.existsSync(READER_PROJECT)) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const bundledDotnet = [
      path.join(localAppData, 'FMSuperScout24', 'dotnet-sdk', 'dotnet.exe'),
      path.join(localAppData, 'FMSuperScout', 'dotnet-sdk', 'dotnet.exe'),
    ].find(fs.existsSync);
    command = process.env.FMSS_DOTNET || bundledDotnet || 'dotnet';
    args = ['run', '--project', READER_PROJECT, '--configuration', 'Release', '--no-restore'];
    if (mode === 'shortlist') args.push('--', '--shortlist');
    cwd = path.join(APP_DIR, '..');
  } else {
    throw new Error(
      'FM24 reader is missing. Build reader/FMSuperScout.Reader.csproj or install the full package.',
    );
  }
  scanMode = mode;
  scanProcess = spawn(command, args, {
    cwd,
    windowsHide: true,
    stdio: 'ignore',
  });
  scanProcess.once('error', (e) => {
    writeReaderStatus('error', 'Failed to start reader: ' + e.message);
    scanProcess = null;
  });
  scanProcess.once('exit', () => {
    scanProcess = null;
    scanMode = null;
  });
  return scanProcess;
}

// In standalone mode, stop the server after the app window closes.
// The /api/bye beacon normally reports this; the heartbeat is a 90-second fallback.
// Browsers throttle background timers, so a shorter timeout could stop the server during play.
// Every API request also refreshes the heartbeat.
const APP_MODE = process.env.FMSS_APP === '1';
let lastBeat = Date.now();
let pendingExit = null;
if (APP_MODE) {
  setInterval(() => {
    if (Date.now() - lastBeat > 90000) {
      console.log('Window closed (heartbeat timed out); stopping server.');
      process.exit(0);
    }
  }, 5000);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// ---------- self update ----------
// POST /api/update-install downloads the latest Setup.exe, verifies its SHA-256, and starts it.
// The server then stops so the installer can replace the app files.
// GET /api/update-status reports download and installation progress.
let updState = { phase: 'idle' };

function httpsGet(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const req = https
      .get(url, { headers: { 'User-Agent': 'FMSuperScout24-updater' }, timeout: 30000 }, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirects > 0
        ) {
          res.resume();
          resolve(httpsGet(res.headers.location, redirects - 1));
        } else if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode));
        } else resolve(res);
      })
      .on('error', reject);
    // A timeout prevents the update pill from remaining on "downloading" indefinitely.
    req.on('timeout', () => req.destroy(new Error('Network timeout.')));
  });
}
async function readAll(res) {
  const chunks = [];
  for await (const c of res) chunks.push(c);
  return Buffer.concat(chunks);
}

const UPDATE_EXE = 'FMSuperScout24-Setup.exe';
const UPDATE_HASH = `${UPDATE_EXE}.sha256`;
async function latestProductRelease() {
  const body = await readAll(
    await httpsGet('https://api.github.com/repos/mavarobli/FMSuperScout/releases?per_page=100'),
  );
  const releases = JSON.parse(body.toString('utf8'));
  return releases.find(
    (r) =>
      !r.draft &&
      !r.prerelease &&
      r.assets.some((a) => a.name === UPDATE_EXE) &&
      r.assets.some((a) => a.name === UPDATE_HASH),
  );
}

async function runUpdate() {
  updState = { phase: 'downloading', pct: 0 };
  const rel = await latestProductRelease();
  if (!rel)
    throw new Error('No FMSuperScout 24 release with an installer and SHA-256 file was found.');
  const exeAsset = rel.assets.find((a) => a.name === UPDATE_EXE);
  const shaAsset = rel.assets.find((a) => a.name === UPDATE_HASH);

  const dir = path.join(DATA_DIR, 'update');
  fs.mkdirSync(dir, { recursive: true });
  const exePath = path.join(dir, UPDATE_EXE);
  const res = await httpsGet(exeAsset.browser_download_url);
  const total = Number(res.headers['content-length']) || exeAsset.size || 0;
  const hash = crypto.createHash('sha256');
  let got = 0;
  const out = fs.createWriteStream(exePath);
  await new Promise((resolve, reject) => {
    res.on('data', (c) => {
      got += c.length;
      hash.update(c);
      if (total)
        updState = {
          phase: 'downloading',
          pct: Math.min(99, Math.round((100 * got) / total)),
        };
    });
    res.pipe(out);
    out.on('finish', resolve);
    res.on('error', reject);
    out.on('error', reject);
  });

  updState = { phase: 'verifying' };
  const expect = (await readAll(await httpsGet(shaAsset.browser_download_url)))
    .toString('utf8')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
  if (hash.digest('hex') !== expect) {
    try {
      fs.unlinkSync(exePath);
    } catch {}
    throw new Error('SHA-256 mismatch; the downloaded file was removed.');
  }

  updState = { phase: 'launching' };
  // Wait for Windows to start the installer before shutting down the server.
  // Report a spawn error, such as a blocked or missing installer, instead of exiting silently.
  await new Promise((resolve, reject) => {
    const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
    child.once('error', reject);
  });
  // Give the page time to retrieve the final status before stopping the server.
  setTimeout(() => {
    console.log('Installer started; stopping the server for the update.');
    process.exit(0);
  }, 1500);
}

// ---------- player development history ----------
// The app sends a compact snapshot (uid → [ca, pa, value]) after each loaded dump.
// Store only meaningful changes: a player's first point is the baseline, then save a point when
// CA or PA changes or value shifts by more than 2.5%. Ignore smaller value recalculations.
// If a save is reloaded to an earlier in-game date, discard later snapshots.
// Store each manager's history under DATA_DIR\history and isolate FM24 from FM26 data.
const HIST_DIR = path.join(DATA_DIR, 'history', 'FM24');
const GAME_SHORTLIST_FILE = path.join(DATA_DIR, 'shortlist-FM24.json');
const HIST_MAX_DATES = 120; // About two years of weekly snapshots; fold older points into the baseline.
let histCache = null,
  histCacheFile = null;

function histSlug(manager) {
  const s = String(manager || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (s || 'default').slice(0, 60);
}
function histFile(manager) {
  return path.join(HIST_DIR, histSlug(manager) + '.json');
}
function loadHist(manager) {
  const file = histFile(manager);
  if (histCacheFile === file && histCache) return histCache;
  let h = { manager: String(manager || 'default'), dates: [], players: {} };
  try {
    h = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* no history yet */
  }
  histCache = h;
  histCacheFile = file;
  return h;
}
// Last known [ca,pa,value] of a player, in date order.
function histLastPoint(entries, dates) {
  for (let i = dates.length - 1; i >= 0; i--) {
    const e = entries[dates[i]];
    if (e) return e;
  }
  return null;
}
function mergeSnapshot(manager, gameDate, players) {
  const h = loadHist(manager);

  // Rewind or re-dump on the same date: all points from that date will be forfeited.
  if (h.dates.length && h.dates[h.dates.length - 1] >= gameDate) {
    const drop = new Set(h.dates.filter((d) => d >= gameDate));
    h.dates = h.dates.filter((d) => d < gameDate);
    for (const uid of Object.keys(h.players)) {
      const e = h.players[uid];
      for (const d of drop) delete e[d];
      if (!Object.keys(e).length) delete h.players[uid];
    }
  }

  let added = 0;
  for (const uid in players) {
    const [ca, pa, val] = players[uid];
    const entries = h.players[uid];
    const prev = entries ? histLastPoint(entries, h.dates) : null;
    const valJump = prev
      ? Math.abs((val ?? 0) - (prev[2] ?? 0)) > Math.max(10000, (prev[2] ?? 0) * 0.025)
      : true;
    if (prev && prev[0] === ca && prev[1] === pa && !valJump) continue;
    (h.players[uid] || (h.players[uid] = {}))[gameDate] = [ca, pa, val];
    added++;
  }
  h.dates.push(gameDate);

  // Fold old dates into a baseline to cap file size while preserving each player's last known value.
  if (h.dates.length > HIST_MAX_DATES) {
    const cut = h.dates.length - HIST_MAX_DATES;
    const dropped = h.dates.slice(0, cut),
      newBase = h.dates[cut];
    for (const uid of Object.keys(h.players)) {
      const e = h.players[uid];
      let base = null;
      for (const d of dropped)
        if (e[d]) {
          base = e[d];
          delete e[d];
        }
      if (base && !e[newBase]) e[newBase] = base;
      if (!Object.keys(e).length) delete h.players[uid];
    }
    h.dates = h.dates.slice(cut);
  }

  // Write to a temporary file and rename it atomically so a crash cannot corrupt existing history.
  fs.mkdirSync(HIST_DIR, { recursive: true });
  const file = histFile(manager);
  fs.writeFileSync(file + '.tmp', JSON.stringify(h));
  fs.renameSync(file + '.tmp', file);
  histCache = h;
  histCacheFile = file;
  return { ok: true, dates: h.dates.length, added };
}

// Read a JSON request body with a size limit; a large-save snapshot is about 10 MB.
function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function latestDump() {
  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.startsWith('dump') && f.endsWith('.json'))
      .map((f) => {
        const full = path.join(DATA_DIR, f);
        const st = fs.statSync(full);
        return { full, mtime: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] || null;
  } catch {
    return null;
  }
}

function removeStoredPath(relativePath) {
  const dataRoot = path.resolve(DATA_DIR);
  const fullPath = path.resolve(dataRoot, relativePath);
  if (!fullPath.startsWith(dataRoot + path.sep)) throw new Error('Invalid data path.');
  fs.rmSync(fullPath, { recursive: true, force: true });
}

async function stopScanBeforeDataReset() {
  const child = scanProcess;
  if (!child || child.exitCode !== null) return;

  const exited = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  try {
    child.kill();
  } catch {
    /* Check the exit code and timeout before reporting failure. */
  }
  if (!(await exited) && child.exitCode === null)
    throw new Error('Could not stop the scan. No data was deleted.');
}

// The installer records the game folder in the registry. Without that key, such as when the app
// is run from source or installed manually, setup status is unknown.
// On first launch, BepInEx builds its interop folder for about three minutes in a console window.
// The setup screen explains this delay so users do not mistake it for a frozen game.
let setupCache = null;
function checkSetup(cb) {
  if (setupCache && Date.now() - setupCache.at < 5000) return cb(setupCache.val);
  const done = (gameDir) => {
    const at = (p) => {
      try {
        return fs.readdirSync(p).length;
      } catch {
        return -1;
      }
    };
    const val = gameDir
      ? {
          known: true,
          gameDir,
          pluginInstalled: fs.existsSync(
            path.join(gameDir, 'BepInEx', 'plugins', 'FMSuperScout.dll'),
          ),
          bepinex: fs.existsSync(path.join(gameDir, 'BepInEx')),
          interopReady: at(path.join(gameDir, 'BepInEx', 'interop')) > 0,
        }
      : { known: false };
    setupCache = { at: Date.now(), val };
    cb(val);
  };
  execFile(
    'reg',
    ['query', 'HKLM\\Software\\FMSuperScout', '/v', 'GamePath'],
    { windowsHide: true },
    (err, out) => {
      const m = !err && /GamePath\s+REG_SZ\s+(.+)/i.exec(out || '');
      done(m ? m[1].trim() : null);
    },
  );
}

const server = http.createServer((req, res) => {
  // Accept only localhost hosts to prevent DNS rebinding from another website to this server.
  const host = String(req.headers.host || '').toLowerCase();
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  // Reject requests from external origins. This prevents another website from triggering
  // an update installation or reading a dump through the local server.
  const origin = String(req.headers.origin || '').toLowerCase();
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // Each request is a sign that the window is still alive (in addition to the explicit heartbeat),
  // except for the farewell beacon itself.
  if (url.pathname !== '/api/bye') lastBeat = Date.now();

  if (url.pathname === '/api/status') {
    const dump = latestDump();
    let reader = null;
    try {
      const sf = path.join(DATA_DIR, 'status.json');
      if (fs.existsSync(sf)) {
        reader = JSON.parse(fs.readFileSync(sf, 'utf8'));
        reader.mtime = fs.statSync(sf).mtimeMs;
      }
    } catch {
      /* no status */
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        dataDir: DATA_DIR,
        hasDump: !!dump,
        dumpFile: dump ? path.basename(dump.full) : null,
        dumpTime: dump ? dump.mtime : null,
        dumpSize: dump ? dump.size : null, // Use latestDump() to avoid a race with an F9 rewrite.
        appMode: APP_MODE,
        reader,
      }),
    );
    return;
  }

  if (url.pathname === '/api/scan-config') {
    // Scan settings (now: include women's football). The app writes, the plugin reads
    // this file at every F9; localStorage would never reach the game.
    const cf = path.join(DATA_DIR, 'scan-config.json');
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 1024) req.destroy();
      });
      req.on('end', () => {
        try {
          const inp = JSON.parse(body || '{}');
          const db = ['men', 'women', 'both'].includes(inp.db) ? inp.db : 'men';
          fs.writeFileSync(cf, JSON.stringify({ db }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ db }));
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
      return;
    }
    let db = 'men';
    try {
      const raw = fs.readFileSync(cf, 'utf8');
      const m = raw.match(/"db":"(men|women|both)"/);
      // Old scheme (circulated briefly): includeWomen:true meant "both".
      db = m ? m[1] : raw.includes('"includeWomen":true') ? 'both' : 'men';
    } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ db }));
    return;
  }

  if (url.pathname === '/api/version-check') {
    // Only releases with the unique FMSuperScout24 installer are eligible.
    (async () => {
      try {
        const release = await latestProductRelease();
        if (!release) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ tag: null }));
          return;
        }
        const tag = String(release.tag_name || '');
        if (!/^v\d/.test(tag)) throw new Error('Invalid FMSuperScout 24 version number.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tag, url: release.html_url }));
      } catch {
        res.writeHead(404);
        res.end();
      }
    })();
    return;
  }

  if (url.pathname === '/api/diagnostics') {
    // Include the diagnostic header in the pre-filled GitHub issue; it records the read source,
    // memory state, and phase timings. Users often forget to attach the full file.
    try {
      const txt = fs.readFileSync(path.join(DATA_DIR, 'diagnostics.txt'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(txt);
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  if (url.pathname === '/api/heartbeat') {
    lastBeat = Date.now();
    if (pendingExit) {
      clearTimeout(pendingExit);
      pendingExit = null;
    } // reload: keep it open anyway
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/bye' && req.method === 'POST') {
    // sendBeacon = POST; GET should never stop the server
    res.writeHead(204);
    res.end();
    // Window closed: stop, unless a new heartbeat comes within 2.5s (when reloading).
    if (APP_MODE && !pendingExit) pendingExit = setTimeout(() => process.exit(0), 2500);
    return;
  }

  if (url.pathname === '/api/fmstatus') {
    // See checkSetup() below for installation status.
    // The native reader reads game data directly from fm.exe.
    execFile(
      'tasklist',
      ['/FI', 'IMAGENAME eq fm.exe', '/NH'],
      { windowsHide: true },
      (err, out) => {
        const running = !err && /fm\.exe/i.test(out || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ running }));
      },
    );
    return;
  }

  if (url.pathname === '/api/setup') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ known: false, nativeReader: true }));
    return;
  }

  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const child = startReader();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, running: true, pid: child.pid }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  if (url.pathname === '/api/history' && req.method === 'POST') {
    readBody(req)
      .then((buf) => {
        const { manager, gameDate, players } = JSON.parse(buf.toString('utf8'));
        if (!gameDate || !players) throw new Error('gameDate/players is required.');
        const r = mergeSnapshot(manager, String(gameDate), players);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
      })
      .catch((e) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      });
    return;
  }

  if (
    (url.pathname === '/api/data/clear' || url.pathname === '/api/history/clear') &&
    req.method === 'POST'
  ) {
    readBody(req, 1024)
      .then(async () => {
        await stopScanBeforeDataReset();
        if (fs.existsSync(DATA_DIR)) {
          for (const name of fs.readdirSync(DATA_DIR)) {
            if (/^dump.*\.json(?:\.tmp)?$/i.test(name)) removeStoredPath(name);
          }
        }
        for (const relativePath of [
          'history/FM24',
          'shortlist-FM24.json',
          'shortlist-FM24.json.tmp',
          'status.json',
          'status.json.tmp',
          'diagnostics.txt',
          'scan-config.json',
        ])
          removeStoredPath(relativePath);
        histCache = null;
        histCacheFile = null;
        scanProcess = null;
        scanMode = null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      });
    return;
  }

  if (url.pathname === '/api/shortlist-refresh' && req.method === 'POST') {
    if (scanProcess && scanProcess.exitCode === null) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: false,
          error:
            scanMode === 'shortlist'
              ? 'The Football Manager shortlist is already being read.'
              : 'The full Football Manager scan is still running.',
        }),
      );
      return;
    }
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const file = GAME_SHORTLIST_FILE;
      fs.writeFileSync(
        file + '.tmp',
        JSON.stringify({
          state: 'scanning',
          at: new Date().toISOString().slice(0, 19),
        }),
      );
      fs.renameSync(file + '.tmp', file);
      const child = startReader('shortlist');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, running: true, pid: child.pid }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }
  if (url.pathname === '/api/shortlist-status') {
    try {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(fs.readFileSync(GAME_SHORTLIST_FILE));
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  if (url.pathname === '/api/shortlist-fmf' && req.method === 'POST') {
    readBody(req, 2 * 1024 * 1024)
      .then((buf) => {
        const input = JSON.parse(buf.toString('utf8'));
        const out = createShortlistFmf(input.name, input.ids);
        const filename = out.name.replace(/[^a-z0-9 _.-]/gi, '_') + '.fmf';
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': out.data.length,
          'Cache-Control': 'no-store',
        });
        res.end(out.data);
      })
      .catch((e) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      });
    return;
  }

  if (url.pathname === '/api/shortlist-fmf/import' && req.method === 'POST') {
    readBody(req, 64 * 1024 * 1024)
      .then((buf) => {
        const out = importShortlistFmf(buf);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ ok: true, ...out }));
      })
      .catch((e) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      });
    return;
  }

  if (url.pathname === '/api/history/deltas') {
    // Bulk variant of /series: return each player's position on the reference date and the index
    // of their first snapshot. This serves the growth column, growth filter, and "new since" query
    // without one request per player (about 1.3 MB for 59,000 players).
    const h = loadHist(url.searchParams.get('manager'));
    const since = String(url.searchParams.get('since') || '');
    const idx = new Map(h.dates.map((d, i) => [d, i]));
    const p = {};
    // Without a reference date, return only the date list. The app uses it to select the
    // "since previous dump" range and avoids transferring more than a megabyte of player data.
    if (!since) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ dates: h.dates, ref: null, p }));
      return;
    }
    for (const uid in h.players) {
      const e = h.players[uid];
      // Dates per player are sparse; sorting is cheaper than expiring all the dates.
      const keys = Object.keys(e).sort();
      if (!keys.length) continue;
      let ref = null;
      for (const k of keys) {
        if (k > since) break;
        ref = e[k];
      }
      p[uid] = ref ? [ref[0], ref[1], idx.get(keys[0]) ?? 0] : [null, null, idx.get(keys[0]) ?? 0];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ dates: h.dates, ref: since, p }));
    return;
  }

  if (url.pathname === '/api/history/series') {
    const h = loadHist(url.searchParams.get('manager'));
    const uid = String(url.searchParams.get('uid') || '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ dates: h.dates, entries: h.players[uid] || {} }));
    return;
  }

  if (url.pathname === '/api/update-install' && req.method === 'POST') {
    if (updState.phase === 'idle' || updState.phase === 'error')
      runUpdate().catch((e) => {
        updState = { phase: 'error', error: String(e.message || e) };
      });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === '/api/update-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(updState));
    return;
  }

  if (url.pathname === '/api/dump') {
    const dump = latestDump();
    if (!dump) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'No dump found. Start Football Manager 24 and click New data.',
        }),
      );
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': dump.size,
      'Cache-Control': 'no-store',
    });
    // Handle read errors so a dump replacement or lock does not terminate the server.
    // The client reports the incomplete read and can retry after the file is available.
    const rs = fs.createReadStream(dump.full);
    rs.on('error', () => res.destroy());
    rs.pipe(res);
    return;
  }

  // Static files
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^([.][.][\\/])+/, '');
  const full = path.join(APP_DIR, file);
  if (!full.startsWith(APP_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
  });
  const sf = fs.createReadStream(full);
  sf.on('error', () => res.destroy());
  sf.pipe(res);
});

// Keep the server running after an unexpected request-handler error, such as a file race
// with the plugin. Log the error so the client can reconnect and report it.
process.on('uncaughtException', (e) =>
  console.error('Unexpected error (server will continue running):', e),
);

const URL_LOCAL = `http://localhost:${PORT}`;

// Open the app in an Edge app window when available, otherwise use the default browser.
function openApp() {
  const edge = [
    path.join(
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    ),
    path.join(
      process.env['ProgramFiles'] || 'C:\\Program Files',
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    ),
  ].find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  try {
    if (edge) {
      const profile = path.join(DATA_DIR, 'window');
      spawn(
        edge,
        [
          `--app=${URL_LOCAL}`,
          `--user-data-dir=${profile}`,
          '--window-size=1440,900',
          '--no-first-run',
        ],
        { detached: true, stdio: 'ignore' },
      ).unref();
    } else {
      spawn('cmd', ['/c', 'start', '""', URL_LOCAL], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
  } catch {
    /* browser opening failed: user can manually navigate to the URL */
  }
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Already an instance active: simply open the window (again) and close it.
    if (APP_MODE) openApp();
    else console.error('Port ' + PORT + ' is already in use; open ' + URL_LOCAL);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('FMSuperScout 24 is running at ' + URL_LOCAL);
  console.log('Data directory: ' + DATA_DIR);
  if (APP_MODE) openApp();
});

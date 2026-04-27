'use strict';

const { spawn }  = require('child_process');
const http       = require('http');
const fs         = require('fs');
const path       = require('path');
// [FIX Djamel] — atomic writes for settings + cookie files served by
// the panel API. A panel save mid-write would otherwise corrupt the
// active config or appstate.
const { atomicWriteFileSync } = (() => {
  try { return require('./utils/atomicWrite'); }
  catch (_) { return { atomicWriteFileSync: fs.writeFileSync.bind(fs) }; }
})();

const PORT          = parseInt(process.env.PORT || '5000', 10);
const BOT_API_PORT  = 3001;
const __dir         = __dirname;
const ALT_PATH      = path.join(__dir, 'alt.json');
const STATE_PATH    = path.join(__dir, 'ZAO-STATE.json');
const SETTINGS_PATH = path.join(__dir, 'ZAO-SETTINGS.json');
const CMDS_PATH     = path.join(__dir, 'SCRIPTS', 'ZAO-CMDS');
const PANEL_PATH    = path.join(__dir, 'panel', 'index.html');

function log(tag, msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

log('ZAO', '══════════════════════════════════════');
log('ZAO', '   ZAO Bot — Unified Launcher          ');
log('ZAO', '   by SAIM — Single-bot mode           ');
log('ZAO', '══════════════════════════════════════');

let botChild   = null;
let restarts   = 0;
let botStart   = Date.now();
let isStopping = false;

const logBuffer  = [];
const MAX_BUFFER = 1000;
const sseClients = new Set();

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, '').replace(/\r/g, '');
}

function appendLog(line) {
  const entry = { ts: new Date().toISOString(), text: line };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER) logBuffer.shift();
  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch (_) { sseClients.delete(client); }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function jsonRes(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

function proxyToBot(method, botPath, body, res) {
  const opts = {
    hostname: '127.0.0.1',
    port: BOT_API_PORT,
    path: botPath,
    method,
    headers: { 'Content-Type': 'application/json', 'Content-Length': body ? Buffer.byteLength(body) : 0 }
  };
  const proxyReq = http.request(opts, proxyRes => {
    let data = '';
    proxyRes.on('data', chunk => data += chunk);
    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  });
  proxyReq.on('error', () => {
    jsonRes(res, { error: 'Bot API unavailable. Bot may not be connected yet.', connected: false }, 503);
  });
  proxyReq.setTimeout(8000, () => { proxyReq.destroy(); });
  if (body) proxyReq.write(body);
  proxyReq.end();
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  let pathname = url.split('?')[0];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if ((pathname === '/' || pathname === '/index.html') && method === 'GET') {
      try {
        const html = fs.readFileSync(PANEL_PATH);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(html);
      } catch (_) {
        res.writeHead(503);
        return res.end('<h2>Panel not found. Build may be incomplete.</h2>');
      }
    }

    if (pathname === '/api/status' && method === 'GET') {
      return jsonRes(res, {
        status: 'running',
        bot: 'ZAO',
        restarts,
        uptime: Math.floor(process.uptime()),
        botAlive: botChild !== null,
        time: new Date().toISOString()
      });
    }

    if (pathname === '/api/logs' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(': connected\n\n');
      for (const entry of logBuffer) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }
      sseClients.add(res);
      const keepAlive = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (_) { clearInterval(keepAlive); sseClients.delete(res); }
      }, 20000);
      req.on('close', () => { clearInterval(keepAlive); sseClients.delete(res); });
      return;
    }

    if (pathname === '/api/config') {
      if (method === 'GET') {
        try {
          const cfg = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
          return jsonRes(res, cfg);
        } catch (e) { return jsonRes(res, { error: e.message }, 500); }
      }
      if (method === 'POST') {
        try {
          const body = await readBody(req);
          const cfg = JSON.parse(body);
          atomicWriteFileSync(SETTINGS_PATH, JSON.stringify(cfg, null, 4), 'utf-8');
          return jsonRes(res, { ok: true });
        } catch (e) { return jsonRes(res, { error: e.message }, 400); }
      }
    }

    if (pathname === '/api/account') {
      if (method === 'GET') {
        try {
          const cfg = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
          let cookies = '';
          try { cookies = fs.readFileSync(STATE_PATH, 'utf-8'); } catch (_) {}
          return jsonRes(res, { email: cfg.EMAIL || '', password: cfg.PASSWORD || '', cookies });
        } catch (e) { return jsonRes(res, { error: e.message }, 500); }
      }
      if (method === 'POST') {
        try {
          const body = await readBody(req);
          const { email, password, cookies } = JSON.parse(body);
          const cfg = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
          if (email !== undefined) cfg.EMAIL = email;
          if (password !== undefined) cfg.PASSWORD = password;
          atomicWriteFileSync(SETTINGS_PATH, JSON.stringify(cfg, null, 4), 'utf-8');
          if (cookies && cookies.trim()) {
            // [FIX] — validate strictly before overwriting BOTH cookie files.
            // A bad paste (empty array, wrong shape, plain object, etc.)
            // used to nuke the live session AND its only backup.
            let parsed;
            try { parsed = JSON.parse(cookies); }
            catch (_) { return jsonRes(res, { error: 'Cookies are not valid JSON.' }, 400); }
            if (!Array.isArray(parsed) || parsed.length === 0) {
              return jsonRes(res, { error: 'Cookies must be a non-empty AppState JSON array.' }, 400);
            }
            const looksLikeAppState = parsed.every(c =>
              c && typeof c === 'object' && typeof c.key === 'string' && 'value' in c
            );
            if (!looksLikeAppState) {
              return jsonRes(res, { error: 'AppState entries must each have a "key" and "value".' }, 400);
            }
            atomicWriteFileSync(STATE_PATH, cookies, 'utf-8');
            atomicWriteFileSync(ALT_PATH, cookies, 'utf-8');
          }
          return jsonRes(res, { ok: true });
        } catch (e) { return jsonRes(res, { error: e.message }, 400); }
      }
    }

    if (pathname === '/api/commands' && method === 'GET') {
      try {
        const files = fs.readdirSync(CMDS_PATH).filter(f => f.endsWith('.js'));
        const cmds = [];
        for (const file of files) {
          try {
            const fullPath = path.join(CMDS_PATH, file);
            delete require.cache[require.resolve(fullPath)];
            const cmd = require(fullPath);
            if (cmd && cmd.config) {
              cmds.push({
                name: cmd.config.name || file,
                description: cmd.config.description || '',
                category: cmd.config.commandCategory || 'General',
                usage: cmd.config.usages || '',
                version: cmd.config.version || '1.0.0',
                permission: cmd.config.hasPermssion || 0,
                file
              });
            }
          } catch (_) {}
        }
        return jsonRes(res, cmds);
      } catch (e) { return jsonRes(res, { error: e.message }, 500); }
    }

    if (pathname === '/api/accounts' && method === 'GET') {
      const TIER_FILES = [
        { tier: 1, stateFile: 'ZAO-STATE.json',  altFile: 'alt.json',  credsFile: 'ZAO-STATEC.json'  },
        { tier: 2, stateFile: 'ZAO-STATEX.json', altFile: 'altx.json', credsFile: 'ZAO-STATEXC.json' },
        { tier: 3, stateFile: 'ZAO-STATEV.json', altFile: 'altv.json', credsFile: 'ZAO-STATEVC.json' }
      ];
      function fileStatus(filename) {
        const full = path.join(__dir, filename);
        try {
          if (!fs.existsSync(full)) return { exists: false, size: 0 };
          const st = fs.statSync(full);
          return { exists: true, size: st.size };
        } catch (_) { return { exists: false, size: 0 }; }
      }
      const tiers = TIER_FILES.map(t => ({
        tier:      t.tier,
        stateFile: t.stateFile,
        altFile:   t.altFile,
        credsFile: t.credsFile,
        state:     fileStatus(t.stateFile),
        alt:       fileStatus(t.altFile),
        creds:     fileStatus(t.credsFile)
      }));
      return jsonRes(res, { tiers, activeTier: null, loginMethod: null });
    }

    if (pathname.startsWith('/api/bot/')) {
      const botPath = pathname.replace('/api', '');
      const body = (method === 'POST' || method === 'PUT') ? await readBody(req) : null;
      return proxyToBot(method, botPath, body, res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (e) {
    log('HTTP', `Error handling ${method} ${pathname}: ${e.message}`);
    jsonRes(res, { error: 'Internal server error' }, 500);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log('SERVER', `Panel server listening on 0.0.0.0:${PORT}`);
});

server.on('error', (err) => {
  log('SERVER', `HTTP server error: ${err.message}`);
});

setInterval(() => {
  const req = http.get(`http://127.0.0.1:${PORT}/api/status`, { timeout: 8000 }, () => {});
  req.on('error', () => {});
  req.end();
}, 10_000);

// [FIX Djamel] — restoreCookies now handles ALL three tiers, not just Tier 1.
// Previously a corrupt ZAO-STATEX.json or ZAO-STATEV.json would never be
// restored from its sibling alt file, so a crash on Tier 2 or 3 would
// permanently nuke that tier on disk and force a downgrade to Tier 1.
function _validAppStateFile(p) {
  try {
    if (!fs.existsSync(p)) return false;
    const raw = fs.readFileSync(p, 'utf-8').trim();
    if (!raw) return false;
    const data = JSON.parse(raw);
    return Array.isArray(data) && data.length > 0;
  } catch (_) {
    return false;
  }
}

function restoreCookies() {
  const TIER_PAIRS = [
    { state: STATE_PATH,                              alt: ALT_PATH },
    { state: path.join(__dir, 'ZAO-STATEX.json'),     alt: path.join(__dir, 'altx.json') },
    { state: path.join(__dir, 'ZAO-STATEV.json'),     alt: path.join(__dir, 'altv.json') },
  ];

  for (const pair of TIER_PAIRS) {
    try {
      if (_validAppStateFile(pair.state)) continue;
      if (!_validAppStateFile(pair.alt))  continue;

      const altRaw = fs.readFileSync(pair.alt, 'utf-8').trim();
      atomicWriteFileSync(pair.state, altRaw, 'utf-8');
      log('PROTECT', `تم استعادة ${path.basename(pair.state)} من ${path.basename(pair.alt)} ✓`);
    } catch (e) {
      log('PROTECT', `خطأ في الاستعادة (${path.basename(pair.state)}): ${e.message}`);
    }
  }
}

const MAX_RESTARTS = 100;
const STABLE_MS    = 10 * 60 * 1000;
// [FIX Djamel] — Crash retry policy redesigned per user request:
//   • CLEAN_DELAY: clean exit (autoRelogin success) → restart immediately.
//   • QUICK_DELAY: a single fast retry after the FIRST crash, in case the
//     crash was transient (e.g. one-off network blip). Avoids 10 minutes
//     of downtime for benign crashes.
//   • CRASH_INTERVAL_MS: from the second crash onward, wait 10 minutes
//     between restart attempts. This gives the tier-switching logic a
//     full breath cycle and stops the watchdog from hammering Facebook
//     in tight loops, which is what gets accounts permanently banned.
const CLEAN_DELAY        = 1_000;
const QUICK_DELAY        = 30_000;
const CRASH_INTERVAL_MS  = 10 * 60 * 1000;

function startBot() {
  if (isStopping) return;

  restoreCookies();

  botChild = spawn(process.execPath, ['ZAO.js'], {
    cwd:   __dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env:   { ...process.env, FORCE_COLOR: '1' },
  });

  botStart = Date.now();
  log('WATCHDOG', `تم تشغيل ZAO.js — PID ${botChild.pid} — إعادة تشغيل رقم ${restarts}`);
  appendLog(`[WATCHDOG] Started ZAO.js (PID ${botChild.pid}) — restart #${restarts}`);

  botChild.stdout.on('data', chunk => {
    const raw = chunk.toString();
    process.stdout.write(raw);
    const clean = stripAnsi(raw);
    const lines = clean.split('\n');
    for (const line of lines) {
      if (line.trim()) appendLog(line.trim());
    }
  });

  botChild.stderr.on('data', chunk => {
    const raw = chunk.toString();
    process.stderr.write(raw);
    const clean = stripAnsi(raw);
    const lines = clean.split('\n');
    for (const line of lines) {
      if (line.trim()) appendLog('[ERR] ' + line.trim());
    }
  });

  botChild.on('error', (err) => {
    log('WATCHDOG', `خطأ في spawn: ${err.message}`);
    appendLog(`[WATCHDOG] Spawn error: ${err.message}`);
  });

  botChild.on('close', (code) => {
    botChild = null;
    appendLog(`[WATCHDOG] ZAO.js exited with code ${code}`);
    if (isStopping) return;

    const uptime = Date.now() - botStart;

    if (code === 0) {
      // Clean exit usually means autoRelogin succeeded and asked us to
      // cycle. Restart immediately and reset the crash counter.
      log('WATCHDOG', 'خروج نظيف — إعادة التشغيل فوراً...');
      restarts = 0;
      return setTimeout(startBot, CLEAN_DELAY);
    }

    if (uptime >= STABLE_MS) {
      // The bot stayed up for at least the stable window before crashing,
      // so this is treated as a fresh single failure, not a crash loop.
      log('WATCHDOG', `كان مستقراً ${Math.round(uptime / 60000)} دقيقة — إعادة تعيين عداد الأعطال.`);
      restarts = 0;
    }

    restarts++;
    log('WATCHDOG', `انتهى بكود ${code} — محاولة ${restarts}/${MAX_RESTARTS}`);

    if (restarts > MAX_RESTARTS) {
      log('WATCHDOG', `تجاوز الحد الأقصى — انتظار 10 دقائق.`);
      restarts = Math.floor(MAX_RESTARTS / 2);
      return setTimeout(startBot, CRASH_INTERVAL_MS);
    }

    // [FIX Djamel] — 10-minute interval between crash retries (per user request).
    // First crash gets a 30-second grace retry in case the failure was
    // transient (network blip, momentary FCA glitch). From the second
    // crash onward we wait a full 10 minutes so:
    //   1. tier-switching logic in Emalogin can cycle accounts cleanly,
    //   2. Facebook stops seeing rapid login bursts that look bot-like,
    //   3. the operator gets a predictable rhythm to inspect logs.
    const delay = (restarts === 1) ? QUICK_DELAY : CRASH_INTERVAL_MS;
    log('WATCHDOG', `إعادة التشغيل بعد ${Math.round(delay / 60000)} دقيقة (${Math.round(delay / 1000)} ثانية)...`);
    setTimeout(startBot, delay);
  });
}

function shutdown(signal) {
  isStopping = true;
  log('LAUNCHER', `استُقبل ${signal} — إيقاف تشغيل ZAO...`);
  if (botChild) {
    try { botChild.kill('SIGTERM'); } catch (_) {}
  }
  setTimeout(() => process.exit(0), 4_000);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason || 'unknown');
  log('LAUNCHER', `unhandledRejection: ${msg}`);
});

process.on('uncaughtException', (err) => {
  log('LAUNCHER', `uncaughtException: ${err?.message || err}`);
});

startBot();

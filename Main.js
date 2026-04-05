'use strict';

const { spawn }  = require('child_process');
const http       = require('http');
const fs         = require('fs');
const path       = require('path');

const PORT          = parseInt(process.env.PORT || '3000', 10);
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
          fs.writeFileSync(SETTINGS_PATH, JSON.stringify(cfg, null, 4), 'utf-8');
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
          fs.writeFileSync(SETTINGS_PATH, JSON.stringify(cfg, null, 4), 'utf-8');
          if (cookies && cookies.trim()) {
            JSON.parse(cookies);
            fs.writeFileSync(STATE_PATH, cookies, 'utf-8');
            fs.writeFileSync(ALT_PATH, cookies, 'utf-8');
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

function restoreCookies() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      try {
        const raw  = fs.readFileSync(STATE_PATH, 'utf-8').trim();
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0) return;
      } catch (_) {
        log('PROTECT', 'ZAO-STATE.json تالف — محاولة الاستعادة من alt.json...');
      }
    }
    if (!fs.existsSync(ALT_PATH)) return;
    const altRaw  = fs.readFileSync(ALT_PATH, 'utf-8').trim();
    const altData = JSON.parse(altRaw);
    if (!Array.isArray(altData) || altData.length === 0) return;
    fs.writeFileSync(STATE_PATH, altRaw, 'utf-8');
    log('PROTECT', `تم استعادة ${altData.length} كوكي من alt.json ✓`);
  } catch (e) {
    log('PROTECT', `خطأ في الاستعادة: ${e.message}`);
  }
}

const MAX_RESTARTS = 100;
const STABLE_MS    = 10 * 60 * 1000;
const BASE_DELAY   = 3_000;
const MAX_DELAY    = 2 * 60 * 1000;

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
      log('WATCHDOG', 'خروج نظيف — إعادة التشغيل فوراً...');
      restarts = 0;
      return setTimeout(startBot, 1_000);
    }

    if (uptime >= STABLE_MS) {
      log('WATCHDOG', `كان مستقراً ${Math.round(uptime / 60000)} دقيقة — إعادة تعيين عداد الأعطال.`);
      restarts = 0;
    }

    restarts++;
    log('WATCHDOG', `انتهى بكود ${code} — محاولة ${restarts}/${MAX_RESTARTS}`);

    if (restarts > MAX_RESTARTS) {
      log('WATCHDOG', `تجاوز الحد الأقصى — انتظار 5 دقائق.`);
      restarts = Math.floor(MAX_RESTARTS / 2);
      return setTimeout(startBot, 5 * 60 * 1000);
    }

    const delay = Math.min(BASE_DELAY * Math.pow(2, restarts - 1), MAX_DELAY);
    log('WATCHDOG', `إعادة التشغيل بعد ${Math.round(delay / 1000)} ثانية...`);
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

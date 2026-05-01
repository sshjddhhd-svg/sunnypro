/**
 * keepAlive.js — Session maintenance for ZAO
 * - Pings Facebook every 5-10 minutes via rotating endpoints
 * - Saves cookies every 30 minutes
 * - Refreshes fb_dtsg every 24 hours
 * - Uses realistic browser headers and diverse endpoints for stealth
 */

const axios = require('axios');
const fs    = require('fs-extra');
const path  = require('path');

let pingTimer     = null;
let dtsgTimer     = null;
let saveTimer     = null;
let notiTimer     = null;
let isSaving      = false;

function log(level, msg) {
  try {
    const logger = global.loggeryuki;
    if (logger) {
      logger.log([
        { message: '[ KEEP-ALIVE ]: ', color: ['red', 'cyan'] },
        { message: msg, color: 'white' }
      ]);
      return;
    }
  } catch (_) {}
  console[level === 'error' ? 'error' : 'log']('[KEEP-ALIVE]', msg);
}

function getRandomMs(minMin, maxMin) {
  return Math.floor(Math.random() * ((maxMin - minMin) * 60000 + 1)) + minMin * 60000;
}

function getCookieStr(api) {
  // [FIX] During relogin / tier-switch the api object can throw from
  // getAppState() (internal state torn down). A throw here used to crash
  // the keep-alive cycle and leave the bot un-pinged until the next
  // restart. Defensive guard returns null and lets the caller no-op.
  try {
    if (!api || typeof api.getAppState !== 'function') return null;
    const appState = api.getAppState();
    if (!Array.isArray(appState) || !appState.length) return null;
    return appState
      .filter(c => c && c.key && c.value)
      .map(c => `${c.key}=${c.value}`)
      .join('; ');
  } catch (_) {
    return null;
  }
}

const MODERN_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

// mbasic.facebook.com is a mobile-only site and will redirect desktop UAs to
// its login page even with a perfectly valid session cookie. Always pair the
// mbasic endpoints with a mobile UA to avoid false-positive "session expired"
// warnings.
const MOBILE_USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
];

function getUserAgent(forEndpointLabel) {
  // Force mobile UA for mbasic — desktop UAs are auto-bounced to login.
  if (typeof forEndpointLabel === 'string' && forEndpointLabel.startsWith('mbasic')) {
    return MOBILE_USER_AGENTS[Math.floor(Math.random() * MOBILE_USER_AGENTS.length)];
  }
  if (global.config?.FCAOption?.userAgent && !global.config?.stealthMode?.rotateUserAgentOnReconnect) {
    return global.config.FCAOption.userAgent;
  }
  return MODERN_USER_AGENTS[Math.floor(Math.random() * MODERN_USER_AGENTS.length)];
}

const PING_ENDPOINTS = [
  {
    url: 'https://www.facebook.com/home.php',
    label: 'www-home',
    referer: 'https://www.facebook.com/'
  },
  {
    url: 'https://www.facebook.com/messages/',
    label: 'www-messages',
    referer: 'https://www.facebook.com/home.php'
  },
  {
    url: 'https://www.facebook.com/notifications',
    label: 'www-notifs',
    referer: 'https://www.facebook.com/'
  },
  {
    url: 'https://mbasic.facebook.com/',
    label: 'mbasic',
    referer: null
  },
  {
    url: 'https://mbasic.facebook.com/home.php',
    label: 'mbasic-home',
    referer: 'https://mbasic.facebook.com/'
  }
];

// Reliable fallback that has never produced a false "expired" signal in
// practice — desktop www.facebook.com/home.php with a desktop UA. Used when
// the random primary endpoint reports a login page so we don't immediately
// alarm the operator.
const FALLBACK_ENDPOINT = PING_ENDPOINTS[0];

// Treat the session as alive (regardless of any HTML-based check) when the
// MQTT listener has received traffic within this many milliseconds. The
// listener is the ground truth — if it's flowing, the cookie is good.
const MQTT_ALIVE_WINDOW_MS = 10 * 60 * 1000;

let _lastEndpointIndex = -1;

function pickEndpoint() {
  const stealth = global.config?.stealthMode;
  if (!stealth?.enabled || !stealth?.diversePingEndpoints) {
    return PING_ENDPOINTS[0];
  }

  let idx;
  do {
    idx = Math.floor(Math.random() * PING_ENDPOINTS.length);
  } while (idx === _lastEndpointIndex && PING_ENDPOINTS.length > 1);
  _lastEndpointIndex = idx;
  return PING_ENDPOINTS[idx];
}

function buildHeaders(cookieStr, userAgent, referer) {
  const accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
  const headers = {
    'cookie': cookieStr,
    'user-agent': userAgent,
    'accept': accept,
    'accept-language': 'en-US,en;q=0.9,ar;q=0.7',
    'accept-encoding': 'gzip, deflate, br',
    'upgrade-insecure-requests': '1',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': referer ? 'same-origin' : 'none',
    'sec-fetch-user': '?1',
    'cache-control': 'max-age=0',
    'dnt': '1'
  };
  if (referer) headers['referer'] = referer;
  return headers;
}

async function httpGet(url, cookieStr, userAgent, referer) {
  return axios.get(url, {
    headers: buildHeaders(cookieStr, userAgent, referer),
    timeout: 18000,
    maxRedirects: 5,
    validateStatus: () => true
  });
}

function isLoginPage(html, responseUrl) {
  const url = String(responseUrl || '');
  const body = String(html || '');
  return (
    /\/login[/?]/.test(url) ||
    body.includes('id="login_form"') ||
    body.includes('You must log in to continue') ||
    body.includes('Log in to Facebook')
  );
}

function isMqttRecentlyAlive() {
  const ts = Number(global.lastMqttActivity) || 0;
  if (!ts) return false;
  return (Date.now() - ts) < MQTT_ALIVE_WINDOW_MS;
}

async function doPing() {
  try {
    const api = global._botApi;
    if (!api) return;

    const cookieStr = getCookieStr(api);
    if (!cookieStr) return;

    const endpoint = pickEndpoint();
    const UA       = getUserAgent(endpoint.label);
    let success    = false;
    let primaryWasLoginPage = false;

    try {
      const r    = await httpGet(endpoint.url, cookieStr, UA, endpoint.referer);
      const html = String(r.data || '');
      const resUrl = String(r.request?.res?.responseUrl || r.config?.url || '');

      if (isLoginPage(html, resUrl)) {
        primaryWasLoginPage = true;
        // Quietly fall through to fallback before logging anything alarming.
      } else {
        success = true;
        log('info', `Ping ${endpoint.label} ✓ — session alive`);
      }
    } catch (e) {
      log('warn', `Ping ${endpoint.label} failed: ${e.message || e}`);
    }

    if (!success) {
      const fallback = FALLBACK_ENDPOINT;
      try {
        const r2     = await httpGet(fallback.url, cookieStr, getUserAgent(fallback.label), fallback.referer);
        const html2  = String(r2.data || '');
        const resUrl2 = String(r2.request?.res?.responseUrl || '');

        if (isLoginPage(html2, resUrl2)) {
          // Both endpoints returned login HTML. Before crying wolf, consult
          // MQTT — if the listener is actively receiving traffic, the cookie
          // is fine and only the HTML probe was bounced (common with mbasic
          // or geo redirects). Otherwise, escalate.
          if (isMqttRecentlyAlive()) {
            log('info', `Ping probes bounced (${endpoint.label}, ${fallback.label}) — MQTT still alive, ignoring`);
            success = true; // treat as alive for cookie-save purposes
          } else if (primaryWasLoginPage) {
            log('warn', `Ping ${endpoint.label} & fallback ${fallback.label} → login page; MQTT idle — session may have expired`);
          } else {
            log('warn', `Fallback ping ${fallback.label} → login page — session may have expired`);
          }
        } else {
          success = true;
          log('info', `Fallback ping ${fallback.label} ✓`);
        }
      } catch (e) {
        log('warn', `Fallback ping failed: ${e.message || e}`);
      }
    }

    if (success) {
      global.lastMqttActivity = Date.now();
      await doSaveCookies('post-ping');
    }
  } catch (e) {
    log('warn', `doPing unexpected error: ${e.message || e}`);
  }
}

async function doSaveCookies(source) {
  if (isSaving) return;
  if (global.isRelogining) return;
  isSaving = true;
  try {
    const api = global._botApi;
    if (!api) return;

    const appState = api.getAppState();
    if (!appState || !appState.length) return;

    const statePath = path.join(process.cwd(), global.config?.APPSTATEPATH || 'ZAO-STATE.json');
    const altPath   = path.join(process.cwd(), 'alt.json');
    const newData   = JSON.stringify(appState, null, 2);

    const current = await fs.readFile(statePath, 'utf-8').catch(() => '');
    if (current.trim() === newData.trim()) return;

    const tmpPath = statePath + '.tmp';
    await fs.writeFile(tmpPath, newData, 'utf-8');
    await fs.move(tmpPath, statePath, { overwrite: true });
    const altTmp = altPath + '.tmp';
    await fs.writeFile(altTmp, newData, 'utf-8');
    await fs.move(altTmp, altPath, { overwrite: true });

    log('info', `Cookies saved to ZAO-STATE.json & alt.json${source ? ` (${source})` : ''} ✓`);

    // [PROTECT] Cookie snapshot ring — capture a validated copy so we can
    // restore from a known-good backup if the live file ever turns corrupt.
    try {
      const snap = require('./cookieSnapshot');
      const r = snap.snapshot(appState, statePath);
      if (r.ok) log('info', `Snapshot saved → ${path.basename(r.file)} ✓`);
    } catch (_) {}
  } catch (e) {
    log('warn', `Failed to save cookies: ${e.message || e}`);
  } finally {
    isSaving = false;
  }
}

async function doRefreshDtsg() {
  try {
    const api = global._botApi;
    if (!api || typeof api.refreshFb_dtsg !== 'function') return;
    await api.refreshFb_dtsg();
    log('info', 'fb_dtsg token refreshed ✓');
    await doSaveCookies('post-dtsg-refresh');
  } catch (e) {
    log('warn', `fb_dtsg refresh failed: ${e.message || e}`);
  }
}

async function doNotificationVisit() {
  try {
    const api = global._botApi;
    if (!api) return;

    const botID = api.getCurrentUserID ? api.getCurrentUserID() : (global.botUserID || '');
    if (!botID) return;

    // Prefer api.httpPost when available to reuse FCA headers/session
    if (typeof api.httpPost === 'function') {
      const form = {
        av: botID,
        fb_api_req_friendly_name: 'CometNotificationsDropdownQuery',
        fb_api_caller_class: 'RelayModern',
        doc_id: '5025284284225032',
        variables: JSON.stringify({
          count: 5,
          environment: 'MAIN_SURFACE',
          menuUseEntryPoint: true,
          scale: 1
        })
      };
      await new Promise((resolve, reject) => {
        api.httpPost('https://www.facebook.com/api/graphql/', form, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      log('info', 'Notifications tab visited ✓');
      return;
    }

    // Fallback: raw HTTP using axios
    const cookieStr = getCookieStr(api);
    if (!cookieStr) return;
    const UA = getUserAgent();
    const body = new URLSearchParams({
      av: botID,
      fb_api_req_friendly_name: 'CometNotificationsDropdownQuery',
      fb_api_caller_class: 'RelayModern',
      doc_id: '5025284284225032',
      variables: JSON.stringify({
        count: 5,
        environment: 'MAIN_SURFACE',
        menuUseEntryPoint: true,
        scale: 1
      })
    });

    await axios.post('https://www.facebook.com/api/graphql/', body.toString(), {
      headers: {
        ...buildHeaders(cookieStr, UA, 'https://www.facebook.com/'),
        'content-type': 'application/x-www-form-urlencoded'
      },
      timeout: 20000,
      maxRedirects: 0,
      validateStatus: () => true
    });
    log('info', 'Notifications tab visited (http) ✓');
  } catch (e) {
    log('warn', `Notification visit failed: ${e.message || e}`);
  }
}

function getNightModeMultiplier() {
  try {
    const { isNightMode } = require('./humanTyping');
    return isNightMode() ? 1.6 : 1.0;
  } catch (_) {
    return 1.0;
  }
}

function schedulePing() {
  if (pingTimer) clearTimeout(pingTimer);
  const baseFactor = getNightModeMultiplier();
  // Honor ZAO-SETTINGS.json keepAlive.pingMin/MaxIntervalMin (default 8–18 min,
  // matching the long-lived white/holo profile — far less suspicious than 5–10 min).
  const cfg        = global.config?.keepAlive || {};
  const cfgMin     = Number(cfg.pingMinIntervalMin) || 8;
  const cfgMax     = Number(cfg.pingMaxIntervalMin) || 18;
  const minMin     = cfgMin * baseFactor;
  const maxMin     = Math.max(cfgMax, cfgMin + 1) * baseFactor;
  const delay      = getRandomMs(minMin, maxMin);
  const minutes    = Math.round(delay / 60000);
  pingTimer = setTimeout(async () => {
    await doPing();
    schedulePing();
  }, delay);
  log('info', `Next ping in ${minutes} min`);
}

function scheduleNotificationVisit() {
  if (notiTimer) clearTimeout(notiTimer);
  // Opt-in: notifications GraphQL traffic adds detection surface and
  // is not used by the long-lived white/holo bots. Default OFF.
  const cfg = global.config?.keepAlive || {};
  if (cfg.enableNotificationVisit !== true) return;
  const minMin = Number(cfg.notiMinIntervalMin) || 60;
  const maxMin = Math.max(Number(cfg.notiMaxIntervalMin) || 180, minMin + 1);
  const delay = getRandomMs(minMin, maxMin);
  const minutes = Math.round(delay / 60000);
  notiTimer = setTimeout(async () => {
    await doNotificationVisit();
    scheduleNotificationVisit();
  }, delay);
  log('info', `Next notifications visit in ${minutes} min`);
}

// [FIX Djamel] — jittered re-schedulers replace the old fixed-interval
// setInterval calls. Honour configured base hours from ZAO-SETTINGS.json
// (saveCookiesIntervalHours / refreshDtsgIntervalHours) so admins can
// tune without code edits, then add ±20% random jitter so consecutive
// runs don't fire on a perfectly regular boundary (a strong fingerprint).
function _scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  const cfg     = global.config?.keepAlive || {};
  const baseHr  = Math.max(0.25, Number(cfg.saveCookiesIntervalHours) || 0.5);
  const baseMs  = baseHr * 60 * 60 * 1000;
  const jitter  = Math.floor((Math.random() - 0.5) * 0.4 * baseMs);
  const delay   = Math.max(2 * 60 * 1000, baseMs + jitter);
  saveTimer = setTimeout(async () => {
    await doSaveCookies('scheduled');
    _scheduleSave();
  }, delay);
}

function _scheduleDtsg() {
  if (dtsgTimer) clearTimeout(dtsgTimer);
  const cfg     = global.config?.keepAlive || {};
  const baseHr  = Math.max(2, Number(cfg.refreshDtsgIntervalHours) || 24);
  const baseMs  = baseHr * 60 * 60 * 1000;
  const jitter  = Math.floor((Math.random() - 0.5) * 0.4 * baseMs);
  const delay   = Math.max(60 * 60 * 1000, baseMs + jitter);
  dtsgTimer = setTimeout(async () => {
    await doRefreshDtsg();
    _scheduleDtsg();
  }, delay);
}

function startKeepAlive() {
  if (pingTimer) clearTimeout(pingTimer);
  if (dtsgTimer) clearTimeout(dtsgTimer);
  if (saveTimer) clearTimeout(saveTimer);
  if (notiTimer) clearTimeout(notiTimer);

  log('info', 'Session keep-alive started — pings/save/dtsg jittered to avoid predictable cadence');

  // [Sustain priming — reinq pattern]
  // Fire one ping 30-90s after login so a fresh session shows activity
  // immediately, instead of being silent for the first 8-18 min window.
  const primingMs = (30 + Math.floor(Math.random() * 61)) * 1000;
  setTimeout(() => {
    doPing().catch(() => {});
  }, primingMs);
  log('info', `priming ping in ${Math.round(primingMs / 1000)}s`);

  schedulePing();
  scheduleNotificationVisit();
  _scheduleSave();
  _scheduleDtsg();
}

function stopKeepAlive() {
  // [FIX Djamel] — all four timers now use setTimeout (jittered scheduling),
  // so use clearTimeout uniformly. clearInterval is harmless on a setTimeout
  // handle but kept for safety on older code paths.
  if (pingTimer) { try { clearTimeout(pingTimer); } catch (_) {} }
  if (dtsgTimer) { try { clearTimeout(dtsgTimer); } catch (_) {} try { clearInterval(dtsgTimer); } catch (_) {} }
  if (saveTimer) { try { clearTimeout(saveTimer); } catch (_) {} try { clearInterval(saveTimer); } catch (_) {} }
  if (notiTimer) { try { clearTimeout(notiTimer); } catch (_) {} }
  pingTimer = dtsgTimer = saveTimer = null;
  notiTimer = null;
}

module.exports = { startKeepAlive, stopKeepAlive, doSaveCookies, doPing };

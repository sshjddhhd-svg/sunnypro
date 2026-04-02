/**
 * keepAlive.js — مقتبس من GoatBot V2 ومُكيّف لـ ZAO
 * يرسل ping لفيسبوك مباشرةً عبر الكوكيز لإبقاء الجلسة حية
 * ويحدّث fb_dtsg كل 24 ساعة لمنع انتهاء صلاحية الرمز
 *
 * تحسينات v2:
 *  - Ping أكثر تكراراً: كل 5-10 دقائق (بدلاً من 8-18)
 *  - حفظ كوكيز كل 30 دقيقة (بدلاً من كل ساعتين)
 *  - تجديد fb_dtsg كل 24 ساعة (بدلاً من 48)
 *  - محاولة ثانية عبر www.facebook.com إذا فشل mbasic
 *  - حفظ تلقائي بعد كل ping ناجح يكشف تغيير في الكوكيز
 */

const axios = require('axios');
const fs    = require('fs-extra');
const path  = require('path');

let pingTimer     = null;
let dtsgTimer     = null;
let saveTimer     = null;
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
  const appState = api.getAppState();
  if (!appState || !appState.length) return null;
  return appState.map(c => `${c.key}=${c.value}`).join('; ');
}

function getUserAgent() {
  return global.config?.FCAOption?.userAgent ||
    'Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36';
}

async function httpGet(url, cookieStr, userAgent) {
  return axios.get(url, {
    headers: {
      cookie: cookieStr,
      'user-agent': userAgent,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ar,en-US;q=0.9',
      'upgrade-insecure-requests': '1'
    },
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: () => true
  });
}

async function doPing() {
  try {
    const api = global._botApi;
    if (!api) return;

    const cookieStr = getCookieStr(api);
    if (!cookieStr) return;

    const UA = getUserAgent();

    let success = false;

    // Primary: mbasic (lightest endpoint)
    try {
      const r = await httpGet('https://mbasic.facebook.com/', cookieStr, UA);
      const html = String(r.data || '');
      const isLoginPage = /\/login[/?]/.test(String(r.request?.res?.responseUrl || ''))
        || html.includes('id="login_form"')
        || html.includes('You must log in to continue');

      if (isLoginPage) {
        log('warn', 'Ping mbasic → صفحة تسجيل الدخول — الجلسة ربما انتهت!');
      } else {
        success = true;
        log('info', 'Ping mbasic ✓ — الجلسة حية');
      }
    } catch (e) {
      log('warn', 'Ping mbasic فشل: ' + (e.message || e));
    }

    // Fallback: www.facebook.com/home.php
    if (!success) {
      try {
        const r2 = await httpGet('https://www.facebook.com/home.php', cookieStr, UA);
        const html2 = String(r2.data || '');
        const isLoginPage2 = /\/login[/?]/.test(String(r2.request?.res?.responseUrl || ''))
          || html2.includes('id="login_form"')
          || html2.includes('You must log in to continue');

        if (isLoginPage2) {
          log('warn', 'Ping www ← صفحة تسجيل الدخول — الجلسة منتهية!');
        } else {
          success = true;
          log('info', 'Ping www ✓ (mbasic كان يتعثر)');
        }
      } catch (e) {
        log('warn', 'Ping www فشل أيضاً: ' + (e.message || e));
      }
    }

    // Update activity timestamp so MQTT healthcheck knows things are alive
    if (success) {
      global.lastMqttActivity = Date.now();
      // Opportunistically save if appState changed
      await doSaveCookies('post-ping');
    }
  } catch (e) {
    log('warn', 'doPing خطأ غير متوقع: ' + (e.message || e));
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

    // Atomic write: write to temp then rename to avoid corruption
    const tmpPath = statePath + '.tmp';
    await fs.writeFile(tmpPath, newData, 'utf-8');
    await fs.move(tmpPath, statePath, { overwrite: true });
    await fs.writeFile(altPath, newData, 'utf-8');

    log('info', `تم حفظ الكوكيز إلى ZAO-STATE.json & alt.json${source ? ` (${source})` : ''} ✓`);
  } catch (e) {
    log('warn', 'فشل حفظ الكوكيز: ' + (e.message || e));
  } finally {
    isSaving = false;
  }
}

async function doRefreshDtsg() {
  try {
    const api = global._botApi;
    if (!api || typeof api.refreshFb_dtsg !== 'function') return;
    await api.refreshFb_dtsg();
    log('info', 'تم تجديد رمز fb_dtsg بنجاح ✓');
    await doSaveCookies('post-dtsg-refresh');
  } catch (e) {
    log('warn', 'فشل تجديد fb_dtsg: ' + (e.message || e));
  }
}

function schedulePing() {
  if (pingTimer) clearTimeout(pingTimer);
  const delay   = getRandomMs(5, 10);
  const minutes = Math.round(delay / 60000);
  pingTimer = setTimeout(async () => {
    await doPing();
    schedulePing();
  }, delay);
  log('info', `Ping القادم بعد ${minutes} دقيقة`);
}

function startKeepAlive() {
  if (pingTimer) clearTimeout(pingTimer);
  if (dtsgTimer) clearInterval(dtsgTimer);
  if (saveTimer) clearInterval(saveTimer);

  log('info', 'بدأ نظام إبقاء الجلسة — Ping كل 5-10 دقائق | كوكيز كل 30 دقيقة | dtsg كل 24 ساعة');

  schedulePing();

  // Save cookies every 30 minutes
  saveTimer = setInterval(() => doSaveCookies('scheduled'), 30 * 60 * 1000);

  // Refresh fb_dtsg every 24 hours
  dtsgTimer = setInterval(() => doRefreshDtsg(), 24 * 60 * 60 * 1000);
}

function stopKeepAlive() {
  if (pingTimer) clearTimeout(pingTimer);
  if (dtsgTimer) clearInterval(dtsgTimer);
  if (saveTimer) clearInterval(saveTimer);
  pingTimer = dtsgTimer = saveTimer = null;
}

module.exports = { startKeepAlive, stopKeepAlive, doSaveCookies, doPing };

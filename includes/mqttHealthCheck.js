let healthTimer    = null;
let restartCount   = 0;
let backoffMs      = 0;
let lastRestartTs  = null;   // timestamp of the most recent restart attempt
let lastRestartReason = null; // reason string passed to _restartListener

function getConfig() {
  const cfg = global.config?.mqttHealthCheck || {};
  return {
    enable:               cfg.enable !== false,
    silentTimeoutMs:      (cfg.silentTimeoutMinutes  || 5) * 60 * 1000,
    checkIntervalMinMs:   (cfg.checkIntervalMinMinutes || 2) * 60 * 1000,
    checkIntervalMaxMs:   (cfg.checkIntervalMaxMinutes || 5) * 60 * 1000,
    maxRestarts:          cfg.maxRestarts          || 5,
    notifyAdmins:         cfg.notifyAdmins         !== false,
    backoffMultiplier:    cfg.backoffMultiplier     || 1.5,
    maxBackoffMs:         (cfg.maxBackoffMinutes    || 15) * 60 * 1000
  };
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function log(level, msg) {
  try {
    const logger = global.loggeryuki;
    if (logger) {
      logger.log([
        { message: '[ MQTT-HEALTH ]: ', color: ['red', 'cyan'] },
        { message: msg, color: 'white' }
      ]);
      return;
    }
  } catch (_) {}
  console[level === 'error' ? 'error' : 'log']('[MQTT-HEALTH]', msg);
}

function sendAdminMessage(message) {
  try {
    const api = global._botApi;
    const admins = global.config?.ADMINBOT || [];
    if (!api) return;
    for (const adminID of admins) {
      const id = String(adminID).trim();
      if (!id) continue;
      api.sendMessage(message, id).catch(() => {});
    }
  } catch (e) {}
}

async function doHealthCheck() {
  const cfg = getConfig();
  if (!cfg.enable) return scheduleNextCheck();

  const api = global._botApi;
  if (!api) return scheduleNextCheck();

  const lastActivity = global.lastMqttActivity || global._botStartTime || Date.now();
  const silentFor    = Date.now() - lastActivity;

  if (silentFor < cfg.silentTimeoutMs) {
    backoffMs = 0;
    return scheduleNextCheck();
  }

  if (global.isRelogining) {
    log('warn', 'إعادة تسجيل الدخول جارية — تم تخطي فحص MQTT.');
    return scheduleNextCheck();
  }

  if (restartCount >= cfg.maxRestarts) {
    log('error', `تم الوصول للحد الأقصى من المحاولات (${cfg.maxRestarts}). إيقاف فحص MQTT.`);
    stopHealthCheck();
    if (cfg.notifyAdmins) {
      sendAdminMessage(
        `⛔ فحص صحة MQTT\n\nالبوت أعاد تشغيل MQTT ${cfg.maxRestarts} مرات بدون استرداد.\nيتطلب تدخلاً يدوياً.`
      );
    }
    return;
  }

  if (backoffMs > 0) {
    log('warn', `انتظار ${Math.round(backoffMs / 1000)}s قبل المحاولة التالية...`);
    await new Promise(r => setTimeout(r, backoffMs));
    backoffMs = Math.min(backoffMs * cfg.backoffMultiplier, cfg.maxBackoffMs);
  } else {
    backoffMs = randomBetween(15000, 45000);
  }

  restartCount++;
  const silentMinutes = Math.round(silentFor / 60000);
  log('warn', `لا نشاط MQTT منذ ${silentMinutes} دقيقة. إعادة تشغيل المستمع (${restartCount}/${cfg.maxRestarts})...`);

  if (cfg.notifyAdmins) {
    sendAdminMessage(
      `⚠️ فحص صحة MQTT\n\nلا نشاط منذ ${silentMinutes} دقيقة.\nإعادة تشغيل المستمع (محاولة ${restartCount}/${cfg.maxRestarts})...`
    );
  }

  // [FIX] If `_restartListener` isn't wired up there is no real restart we
  // can perform, so don't burn a `restartCount` slot — otherwise after
  // `maxRestarts` boot cycles the watcher silently disables itself even
  // though it never actually rebooted anything.
  if (typeof global._restartListener !== 'function') {
    log('warn', 'دالة إعادة تشغيل المستمع غير متوفرة بعد — سيُعاد المحاولة في الدورة القادمة. البوت يبقى يعمل.');
    global.lastMqttActivity = Date.now();
    restartCount = Math.max(0, restartCount - 1);
    return scheduleNextCheck();
  }

  try {
    if (global.handleListen) {
      try { global.handleListen.stopListening(); } catch (_) {}
    }
    const pauseMs = randomBetween(800, 2500);
    await new Promise(r => setTimeout(r, pauseMs));

    // Do NOT stamp lastMqttActivity here — safeRestartListener already stamps
    // it when the new listenMqtt handle is confirmed open (line ~653 ZAO.js).
    // Stamping early masked failed restarts: if the new listener never fired,
    // the next health cycle saw silence of only ~2-5 min (< silentTimeoutMs)
    // and skipped the restart entirely, stalling recovery for another full
    // timeout window.
    const restartReason = `mqtt-health-${restartCount}-of-${getConfig().maxRestarts}`;
    lastRestartTs     = Date.now();
    lastRestartReason = restartReason;
    log('info', 'إعادة تشغيل المستمع لاسترداد MQTT...');
    global._restartListener(restartReason);
    restartCount = 0;
    backoffMs    = 0;
  } catch (e) {
    log('error', 'خطأ أثناء إعادة التشغيل: ' + (e?.message || e));
  }

  scheduleNextCheck();
}

function scheduleNextCheck() {
  if (healthTimer) clearTimeout(healthTimer);
  const cfg = getConfig();
  if (!cfg.enable) return;
  const delay   = randomBetween(cfg.checkIntervalMinMs, cfg.checkIntervalMaxMs);
  const minutes = (delay / 60000).toFixed(1);
  log('info', `الفحص القادم بعد ${minutes} دقيقة`);
  healthTimer = setTimeout(doHealthCheck, delay);
}

function startHealthCheck() {
  if (healthTimer) clearTimeout(healthTimer);
  restartCount      = 0;
  backoffMs         = 0;
  lastRestartTs     = null;
  lastRestartReason = null;
  global.lastMqttActivity = Date.now();

  const cfg = getConfig();
  if (!cfg.enable) {
    log('info', 'فحص صحة MQTT معطّل في الإعدادات.');
    return;
  }

  log('info',
    `بدأ — فحص كل ${cfg.checkIntervalMinMs / 60000}–${cfg.checkIntervalMaxMs / 60000} دقيقة (عشوائي)، ` +
    `إعادة تشغيل إذا صمت ${cfg.silentTimeoutMs / 60000} دقيقة`
  );

  scheduleNextCheck();
}

function stopHealthCheck() {
  if (healthTimer) clearTimeout(healthTimer);
  healthTimer = null;
}

/**
 * Returns a snapshot of the watchdog's current state.
 * Used by /bot/mqtt-status in ZAO.js's internal panel.
 */
function getStatus() {
  const cfg         = getConfig();
  const now         = Date.now();
  const lastActivity = global.lastMqttActivity || null;
  const silentForMs = lastActivity ? (now - lastActivity) : null;
  return {
    enabled:           cfg.enable,
    watcherActive:     healthTimer !== null,
    mqttAlive:         lastActivity ? silentForMs < 120000 : false,
    silentForMs,
    silentForSec:      silentForMs !== null ? Math.floor(silentForMs / 1000) : null,
    silentTimeoutMs:   cfg.silentTimeoutMs,
    lastActivity:      lastActivity ? new Date(lastActivity).toISOString() : null,
    restartCount,
    maxRestarts:       cfg.maxRestarts,
    backoffMs,
    lastRestartTs:     lastRestartTs ? new Date(lastRestartTs).toISOString() : null,
    lastRestartReason
  };
}

module.exports = { startHealthCheck, stopHealthCheck, getStatus };

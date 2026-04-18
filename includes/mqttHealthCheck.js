let healthTimer = null;
let restartCount = 0;
let backoffMs = 0;

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
    log('warn',
      `تم الوصول للحد الأقصى (${cfg.maxRestarts}). إعادة تعيين العداد والانتظار ${Math.round(cfg.maxBackoffMs / 60000)} دقيقة قبل الاستمرار.`
    );
    restartCount = 0;
    backoffMs    = cfg.maxBackoffMs;
    // Reset the activity timestamp so the check does not fire instantly again
    global.lastMqttActivity = Date.now();
    if (cfg.notifyAdmins) {
      sendAdminMessage(
        `⚠️ فحص صحة MQTT\n\nوصل لأقصى محاولات (${cfg.maxRestarts}) — يعيد تعيين العداد ويكمل المراقبة بـ backoff ${Math.round(cfg.maxBackoffMs / 60000)} دقيقة.\nالبوت لا يزال يعمل.`
      );
    }
    return scheduleNextCheck();
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

  try {
    if (global.handleListen) {
      try { global.handleListen.stopListening(); } catch (_) {}
    }
    const pauseMs = randomBetween(800, 2500);
    await new Promise(r => setTimeout(r, pauseMs));

    if (typeof global._restartListener === 'function') {
      global.lastMqttActivity = Date.now();
      log('info', 'إعادة تشغيل المستمع لاسترداد MQTT...');
      global._restartListener();
      restartCount = 0;
      backoffMs    = 0;
    } else {
      // دالة الإعادة غير جاهزة بعد — تحديث الطابع الزمني والمحاولة لاحقاً
      log('warn', 'دالة إعادة تشغيل المستمع غير متوفرة بعد — سيُعاد المحاولة في الدورة القادمة. البوت يبقى يعمل.');
      global.lastMqttActivity = Date.now();
    }
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
  restartCount = 0;
  backoffMs    = 0;
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

module.exports = { startHealthCheck, stopHealthCheck };

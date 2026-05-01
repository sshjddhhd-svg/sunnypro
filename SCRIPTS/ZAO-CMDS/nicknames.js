"use strict";

const { getLocks, getLock, setLock, setLockTime, clearLock, saveLocks } = require("../../includes/nicknameLocks");

const SWEEP_TICK_MS    = 500;
const PARTICIPANTS_TTL = 5 * 60 * 1000;

const _participantsCache = new Map();
const _sweepCursor       = { threadIdx: 0, memberIdx: 0 };

function getBotApi(api) {
  return global._botApi || api;
}

function isMqttUp() {
  const health = global.nkx?.health;
  if (!health) return true;
  const mqttOk = health?.mqtt?.isConnected ?? health?.mqttConnected ?? true;
  return !!mqttOk;
}

function getThreadInfoP(botApi, threadID) {
  return new Promise((resolve, reject) => {
    try {
      const r = botApi.getThreadInfo(threadID, (err, info) => {
        if (err) return reject(err);
        resolve(info);
      });
      if (r && typeof r.then === "function") r.then(resolve).catch(reject);
    } catch (e) {
      reject(e);
    }
  });
}

function changeNicknameP(botApi, nickname, threadID, userID) {
  return new Promise((resolve) => {
    try {
      const r = botApi.changeNickname(nickname, threadID, userID, () => resolve());
      if (r && typeof r.catch === "function") r.catch(() => resolve());
    } catch (_) { resolve(); }
  });
}

async function getParticipants(botApi, threadID) {
  const cached = _participantsCache.get(threadID);
  if (cached && Date.now() < cached.refreshAt && cached.ids.length) return cached.ids;
  try {
    const info = await getThreadInfoP(botApi, threadID);
    const ids = (info && Array.isArray(info.participantIDs)) ? info.participantIDs.slice() : [];
    if (!ids.length) return [];
    _participantsCache.set(threadID, { ids, refreshAt: Date.now() + PARTICIPANTS_TTL });
    return ids;
  } catch (e) {
    const msg = String(e && (e.message || e)).toLowerCase();
    if (
      msg.includes("no message_thread") ||
      msg.includes("thread may not exist") ||
      msg.includes("not a participant") ||
      msg.includes("not found") ||
      msg.includes("access may be restricted")
    ) {
      const locks = getLocks();
      if (locks.delete(String(threadID))) saveLocks(locks);
      _participantsCache.delete(threadID);
    }
    return [];
  }
}

function botUserId(botApi) {
  try {
    return String(global.botUserID || (botApi.getCurrentUserID ? botApi.getCurrentUserID() : ""));
  } catch (_) { return ""; }
}

function _parseRandomRange(rangeStr) {
  if (!rangeStr || !rangeStr.trim()) return { min: 500, max: 3000 };
  const m = String(rangeStr).trim().match(/^([0-9.]+)(s|m)?-([0-9.]+)(s|m)?$/i);
  if (!m) return null;
  const toMs = (v, u) => {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return null;
    return u && u.toLowerCase() === "m" ? Math.round(n * 60000) : Math.round(n * 1000);
  };
  const minMs = toMs(m[1], m[2]);
  const maxMs = toMs(m[3], m[4]);
  if (!minMs || !maxMs) return null;
  if (minMs < 100)      return null;
  if (maxMs <= minMs)   return null;
  return { min: minMs, max: maxMs };
}

function _randInRange(range) {
  return Math.round(range.min + Math.random() * (range.max - range.min));
}

function _fmtTime(lock) {
  if (lock.randomTime && lock.randomRange) {
    return `🎲 ${lock.randomRange.min / 1000}s–${lock.randomRange.max / 1000}s`;
  }
  const ms = lock.time || 500;
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000)  return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

async function startGlobalSweep(api) {
  if (global._nickSweepInterval) {
    try { clearInterval(global._nickSweepInterval); } catch (_) {}
    global._nickSweepInterval = null;
  }
  if (!global._nickNextApply) global._nickNextApply = new Map();

  global._nickSweepInterval = setInterval(async () => {
    const botApi = getBotApi(api);
    if (!botApi) return;
    const locks = getLocks();
    if (locks.size === 0) return;
    if (!isMqttUp()) return;

    const threads = [...locks.keys()];
    if (!threads.length) return;

    const tIdx     = _sweepCursor.threadIdx % threads.length;
    const threadID = threads[tIdx];
    const lock     = locks.get(threadID);
    if (!lock) {
      _sweepCursor.threadIdx = (tIdx + 1) % Math.max(1, threads.length);
      _sweepCursor.memberIdx = 0;
      return;
    }

    const now = Date.now();
    const nextApply = global._nickNextApply.get(threadID) || 0;
    if (now < nextApply) {
      _sweepCursor.threadIdx = (tIdx + 1) % Math.max(1, threads.length);
      return;
    }

    let targets;
    if (lock.scope === "bot") {
      const bid = botUserId(botApi);
      if (!bid) {
        _sweepCursor.threadIdx = (tIdx + 1) % threads.length;
        _sweepCursor.memberIdx = 0;
        return;
      }
      targets = [bid];
    } else {
      targets = await getParticipants(botApi, threadID);
      if (!targets.length) {
        _sweepCursor.threadIdx = (tIdx + 1) % Math.max(1, threads.length);
        _sweepCursor.memberIdx = 0;
        return;
      }
    }

    const mIdx   = _sweepCursor.memberIdx % targets.length;
    const userID = targets[mIdx];

    try {
      await changeNicknameP(botApi, lock.nickname, threadID, userID);
    } catch (_) {}

    _sweepCursor.memberIdx = mIdx + 1;
    if (_sweepCursor.memberIdx >= targets.length) {
      _sweepCursor.memberIdx = 0;
      _sweepCursor.threadIdx = (tIdx + 1) % threads.length;

      const interval = lock.randomTime && lock.randomRange
        ? _randInRange(lock.randomRange)
        : (lock.time || 500);
      global._nickNextApply.set(threadID, Date.now() + interval);
    }
  }, SWEEP_TICK_MS);
}

module.exports.config = {
  name: "كنيات",
  version: "4.0.0",
  hasPermssion: 2,
  credits: "ZAO + reinq",
  description: "قفل كنيات المجموعة مع نظام توقيت قابل للضبط",
  commandCategory: "نظام",
  usages: "تشغيل [الكنية] | ايقاف | قائمة | بوت [الكنية] | وقت [s/m أو r]",
  cooldowns: 3
};

module.exports.languages = { "vi": {}, "en": {} };

module.exports.onLoad = function ({ api }) {
  if (!global.nicknameLocks) global.nicknameLocks = getLocks();
  startGlobalSweep(api);
};

module.exports.handleEvent = async function ({ api, event }) {
  try {
    const { threadID, logMessageType, logMessageData } = event;
    if (!threadID) return;

    if (logMessageType === "log:subscribe" || logMessageType === "log:unsubscribe") {
      _participantsCache.delete(String(threadID));

      if (logMessageType === "log:subscribe") {
        const lock = getLock(threadID);
        if (lock && lock.scope === "all" && isMqttUp()) {
          const botApi = getBotApi(api);
          const added  = Array.isArray(logMessageData?.addedParticipants)
            ? logMessageData.addedParticipants
            : [];
          for (const p of added) {
            const uid = String(p?.userFbId || p?.userID || p?.id || "");
            if (uid) await changeNicknameP(botApi, lock.nickname, threadID, uid);
          }
        }
      }
      return;
    }

    if (logMessageType !== "log:subscribe:update-nickname" && logMessageType !== "log:user-nickname") return;

    const lock = getLock(threadID);
    if (!lock) return;

    const newNickname = logMessageData?.nickname ?? "";
    if (newNickname === lock.nickname) return;

    const targetId = String(
      logMessageData?.participant_id ||
      logMessageData?.participantId  ||
      event.author || ""
    );
    if (!targetId) return;

    if (lock.scope === "bot") {
      const bid = botUserId(getBotApi(api));
      if (!bid || targetId !== bid) return;
    }

    if (!isMqttUp()) return;
    await changeNicknameP(getBotApi(api), lock.nickname, threadID, targetId);
  } catch (_) {}
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const tid    = String(threadID);
  const action = args[0];

  const helpMsg =
    "📌 أوامر كنيات:\n" +
    "• كنيات تشغيل [الكنية] — قفل كنيات الجميع\n" +
    "• كنيات بوت [الكنية] — قفل كنية البوت فقط\n" +
    "• كنيات ايقاف — إيقاف القفل في هذه المجموعة\n" +
    "• كنيات وقت [قيمة] — ضبط فترة إعادة التطبيق\n" +
    "  مثال: كنيات وقت 2s | كنيات وقت 500ms\n" +
    "  🎲 عشوائي: كنيات وقت r | كنيات وقت r 1-5 | كنيات وقت r 0.5s-3s\n" +
    "• كنيات حالة — عرض الإعدادات الحالية\n" +
    "• كنيات قائمة — عرض المجموعات المقفولة";

  if (!action) return api.sendMessage(helpMsg, threadID, messageID);

  if (action === "تشغيل") {
    const nickname = args.slice(1).join(" ").trim();
    if (!nickname) return api.sendMessage("⚠️ أدخل الكنية.\nمثال: كنيات تشغيل ZAO", threadID, messageID);
    const existing = getLock(tid);
    setLock(tid, nickname, "all", {
      time:        existing?.time        ?? 500,
      randomTime:  existing?.randomTime  ?? false,
      randomRange: existing?.randomRange ?? null
    });
    const lock = getLock(tid);
    return api.sendMessage(
      `🔒 تم قفل كنيات الجميع على:\n"${nickname}"\n\n⏱ فترة الإعادة: ${_fmtTime(lock)}\n⚡ أي تغيير سيُعاد تلقائياً`,
      threadID, messageID
    );
  }

  if (action === "بوت") {
    const nickname = args.slice(1).join(" ").trim();
    if (!nickname) return api.sendMessage("⚠️ أدخل الكنية.\nمثال: كنيات بوت ZAO", threadID, messageID);
    const existing = getLock(tid);
    setLock(tid, nickname, "bot", {
      time:        existing?.time        ?? 500,
      randomTime:  existing?.randomTime  ?? false,
      randomRange: existing?.randomRange ?? null
    });
    const lock = getLock(tid);
    return api.sendMessage(
      `🔒 تم قفل كنية البوت فقط على:\n"${nickname}"\n\n⏱ فترة الإعادة: ${_fmtTime(lock)}\n⚡ أي تغيير سيُعاد تلقائياً`,
      threadID, messageID
    );
  }

  if (action === "ايقاف") {
    const had = clearLock(tid);
    if (global._nickNextApply) global._nickNextApply.delete(tid);
    return api.sendMessage(
      had ? "🔓 تم إيقاف قفل الكنيات." : "⚠️ لا يوجد قفل مفعل في هذه المجموعة.",
      threadID, messageID
    );
  }

  if (action === "وقت") {
    const lock = getLock(tid);
    if (!lock) return api.sendMessage("⚠️ لا يوجد قفل مفعل في هذه المجموعة.\nفعّل القفل أولاً.", threadID, messageID);

    const rawInput = args.slice(1).join(" ").trim();
    if (!rawInput) {
      return api.sendMessage(
        `⏱ الوقت الحالي: ${_fmtTime(lock)}\n\n` +
        "ضبط جديد:\n" +
        "• كنيات وقت 2s — كل 2 ثانية\n" +
        "• كنيات وقت 500ms — كل 0.5s (السرعة القصوى)\n" +
        "🎲 كنيات وقت r — عشوائي (افتراضي 0.5s–3s)\n" +
        "🎲 كنيات وقت r 1-5 — عشوائي 1s–5s\n" +
        "🎲 كنيات وقت r 0.5s-3s",
        threadID, messageID
      );
    }

    if (rawInput.toLowerCase().startsWith("r")) {
      const rangeStr = rawInput.slice(1).trim();
      const range = _parseRandomRange(rangeStr);
      if (!range) return api.sendMessage(
        "⚠️ صيغة النطاق غير صحيحة.\nأمثلة: r  |  r 1-5  |  r 0.5s-3s\n(الحد الأدنى 100ms، القيمة الكبرى > الصغرى)",
        threadID, messageID
      );
      setLockTime(tid, { time: Math.round((range.min + range.max) / 2), randomTime: true, randomRange: range });
      if (global._nickNextApply) global._nickNextApply.set(tid, Date.now() + _randInRange(range));
      return api.sendMessage(
        `🎲 تم تفعيل الوقت العشوائي للكنيات.\nالنطاق: ${range.min / 1000}s — ${range.max / 1000}s\n💾 يُحفظ بعد إعادة التشغيل.`,
        threadID, messageID
      );
    }

    let ms = 0;
    const raw = rawInput.toLowerCase();
    if (raw.endsWith("ms"))     ms = parseFloat(raw);
    else if (raw.endsWith("s")) ms = parseFloat(raw) * 1000;
    else if (raw.endsWith("m")) ms = parseFloat(raw) * 60000;
    else return api.sendMessage("⚠️ استخدم ms/s/m للوحدة.\n🎲 أو r للعشوائي.", threadID, messageID);
    if (ms < 100) return api.sendMessage("⚠️ الحد الأدنى 100ms.", threadID, messageID);

    setLockTime(tid, { time: ms, randomTime: false, randomRange: null });
    if (global._nickNextApply) global._nickNextApply.set(tid, Date.now() + ms);
    const updated = getLock(tid);
    return api.sendMessage(`✅ تم حفظ الوقت: ${_fmtTime(updated)}\n💾 يُحفظ بعد إعادة التشغيل.`, threadID, messageID);
  }

  if (action === "حالة") {
    const lock = getLock(tid);
    if (!lock) return api.sendMessage("📋 لا يوجد قفل مفعل في هذه المجموعة.", threadID, messageID);
    const nextApply = global._nickNextApply?.get(tid);
    const remaining = nextApply ? Math.max(0, ((nextApply - Date.now()) / 1000).toFixed(1)) : "—";
    return api.sendMessage(
      `🔒 كنيات — حالة:\n` +
      `📝 الكنية: "${lock.nickname}"\n` +
      `👥 النطاق: ${lock.scope === "bot" ? "البوت فقط" : "الجميع"}\n` +
      `⏱ الفترة: ${_fmtTime(lock)}\n` +
      `⏳ الدورة القادمة: خلال ${remaining}s`,
      threadID, messageID
    );
  }

  if (action === "قائمة") {
    const locks = getLocks();
    if (locks.size === 0) return api.sendMessage("📋 لا توجد مجموعات مقفولة حالياً.", threadID, messageID);
    let list = "🔒 المجموعات المقفولة:\n";
    let i = 1;
    for (const [t, lock] of locks.entries()) {
      const scopeLabel = lock.scope === "bot" ? "(بوت فقط)" : "(الجميع)";
      list += `${i}. [${t}] ${scopeLabel}: "${lock.nickname}" ⏱ ${_fmtTime(lock)}\n`;
      i++;
    }
    return api.sendMessage(list.trim(), threadID, messageID);
  }

  return api.sendMessage(helpMsg, threadID, messageID);
};

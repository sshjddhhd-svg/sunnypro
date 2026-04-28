"use strict";

const { getLocks, getLock, setLock, clearLock, saveLocks } = require("../../includes/nicknameLocks");

const SWEEP_INTERVAL_MS  = 500;
const PARTICIPANTS_TTL   = 5 * 60 * 1000;

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

async function startGlobalSweep(api) {
  if (global._nickSweepInterval) {
    try { clearInterval(global._nickSweepInterval); } catch (_) {}
    global._nickSweepInterval = null;
  }

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
    }
  }, SWEEP_INTERVAL_MS);
}

module.exports.config = {
  name: "كنيات",
  version: "3.0.0",
  hasPermssion: 2,
  credits: "ZAO + reinq",
  description: "قفل كنيات المجموعة وحمايتها (تطبيق على الجميع + إعادة فورية عند التغيير)",
  commandCategory: "نظام",
  usages: "تشغيل [الكنية] | ايقاف | قائمة | بوت [الكنية]",
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
    if (logMessageType !== "log:subscribe:update-nickname" && logMessageType !== "log:user-nickname") return;

    const lock = getLock(threadID);
    if (!lock) return;

    const newNickname = logMessageData?.nickname ?? "";
    if (newNickname === lock.nickname) return;

    const targetId = String(
      logMessageData?.participant_id ||
      logMessageData?.participantId ||
      event.author ||
      ""
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
  const action = args[0];

  const helpMsg =
    "📌 أوامر كنيات:\n" +
    "• كنيات تشغيل [الكنية] — قفل كنيات الجميع\n" +
    "• كنيات بوت [الكنية] — قفل كنية البوت فقط\n" +
    "• كنيات ايقاف — إيقاف القفل في هذه المجموعة\n" +
    "• كنيات قائمة — عرض المجموعات المقفولة";

  if (!action) return api.sendMessage(helpMsg, threadID, messageID);

  if (action === "تشغيل") {
    const nickname = args.slice(1).join(" ").trim();
    if (!nickname) return api.sendMessage("⚠️ أدخل الكنية.\nمثال: كنيات تشغيل ZAO", threadID, messageID);
    setLock(threadID, nickname, "all");
    return api.sendMessage(
      `🔒 تم قفل كنيات الجميع على:\n"${nickname}"\n\n⏱ معدل التطبيق: كل 0.5s\n⚡ أي تغيير سيُعاد تلقائياً`,
      threadID, messageID
    );
  }

  if (action === "بوت") {
    const nickname = args.slice(1).join(" ").trim();
    if (!nickname) return api.sendMessage("⚠️ أدخل الكنية.\nمثال: كنيات بوت ZAO", threadID, messageID);
    setLock(threadID, nickname, "bot");
    return api.sendMessage(
      `🔒 تم قفل كنية البوت فقط على:\n"${nickname}"\n\n⚡ أي تغيير سيُعاد تلقائياً`,
      threadID, messageID
    );
  }

  if (action === "ايقاف") {
    const had = clearLock(threadID);
    return api.sendMessage(
      had ? "🔓 تم إيقاف قفل الكنيات." : "⚠️ لا يوجد قفل مفعل في هذه المجموعة.",
      threadID, messageID
    );
  }

  if (action === "قائمة") {
    const locks = getLocks();
    if (locks.size === 0) return api.sendMessage("📋 لا توجد مجموعات مقفولة حالياً.", threadID, messageID);
    let list = "🔒 المجموعات المقفولة:\n";
    let i = 1;
    for (const [tid, lock] of locks.entries()) {
      const scopeLabel = lock.scope === "bot" ? "(بوت فقط)" : "(الجميع)";
      list += `${i}. [${tid}] ${scopeLabel}: "${lock.nickname}"\n`;
      i++;
    }
    return api.sendMessage(list.trim(), threadID, messageID);
  }

  return api.sendMessage(helpMsg, threadID, messageID);
};

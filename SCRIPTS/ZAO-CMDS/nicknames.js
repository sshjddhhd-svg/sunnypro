const fs = require("fs-extra");
const path = require("path");

const NICK_STATE_FILE  = path.join(process.cwd(), "data", "nicknames-state.json");
const DEFAULT_INTERVAL = 3000;
const MIN_INTERVAL     = 3000;

// ── Persist helpers ──────────────────────────────────────────────────────────

function loadNickState() {
  try {
    fs.ensureDirSync(path.dirname(NICK_STATE_FILE));
    if (fs.existsSync(NICK_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(NICK_STATE_FILE, "utf8"));
    }
  } catch (_) {}
  return {};
}

function saveNickState() {
  try {
    fs.ensureDirSync(path.dirname(NICK_STATE_FILE));
    const out = {};
    for (const [tid, cfg] of Object.entries(global.nickPersist || {})) {
      if (cfg && cfg.nickname) {
        out[tid] = { nickname: cfg.nickname, intervalMs: cfg.intervalMs || DEFAULT_INTERVAL };
      }
    }
    const tmp = NICK_STATE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2), "utf8");
    fs.renameSync(tmp, NICK_STATE_FILE);
  } catch (_) {}
}

function parseInterval(input) {
  if (!input) return null;
  if (input.endsWith("s")) { const v = parseFloat(input) * 1000;  return isNaN(v) ? null : v; }
  if (input.endsWith("m")) { const v = parseFloat(input) * 60000; return isNaN(v) ? null : v; }
  return null;
}

// ── Core protection engine ───────────────────────────────────────────────────

/**
 * Start (or restart) the continuous nickname-protection loop for a thread.
 * The loop iterates through all members, then refreshes the member list and
 * repeats — indefinitely — until stopProtection() is called.
 *
 * IMPORTANT: if getThreadInfo fails (e.g. bot not yet fully connected on
 * startup), we abort the loop but do NOT touch nickPersist so the state
 * survives until the next restart.
 */
function startProtection(api, threadID, nickname, intervalMs) {
  if (!global.nickProtect)  global.nickProtect  = {};
  if (!global.nickSessions) global.nickSessions = new Map();

  _clearProtection(threadID);

  const state = {
    nickname,
    intervalMs,
    participantIDs: [],
    index:          0,
    cycleCount:     0,
    active:         true,
    intervalId:     null,
    failCount:      0
  };
  global.nickProtect[threadID] = state;

  const botApi = global._botApi || api;
  botApi.getThreadInfo(threadID, (err, threadInfo) => {
    if (!state.active) return;

    if (err || !threadInfo?.participantIDs?.length) {
      // Cannot reach thread — abort protection for now, but deliberately
      // do NOT delete nickPersist or call saveNickState so the persisted
      // data survives until the next restart when connectivity may be ready.
      _clearProtection(threadID);
      return;
    }

    state.participantIDs = threadInfo.participantIDs;

    state.intervalId = setInterval(async () => {
      if (!state.active) { clearInterval(state.intervalId); return; }

      const health = global.nkx?.health;
      if (health) {
        const mqttOk = health?.mqtt?.isConnected ?? health?.mqttConnected ?? true;
        if (!mqttOk) return;
      }

      const currentApi = global._botApi || api;

      if (state.index >= state.participantIDs.length) {
        state.cycleCount++;
        state.index = 0;
        state.failCount = 0;
        try {
          const fresh = await currentApi.getThreadInfo(threadID);
          if (fresh?.participantIDs?.length) state.participantIDs = fresh.participantIDs;
        } catch (_) {}
        return;
      }

      const userID = state.participantIDs[state.index];
      try {
        await new Promise((resolve) => {
          try {
            const r = currentApi.changeNickname(state.nickname, threadID, userID, () => resolve());
            if (r && typeof r.catch === "function") r.catch(() => resolve());
          } catch (_) { resolve(); }
        });
        state.failCount = 0;
      } catch (_) {}
      state.index++;
    }, intervalMs);

    global.nickSessions.set(threadID, state.intervalId);
  });
}

function _clearProtection(threadID) {
  const old = global.nickProtect?.[threadID];
  if (old) {
    old.active = false;
    if (old.intervalId) { clearInterval(old.intervalId); old.intervalId = null; }
    delete global.nickProtect[threadID];
  }
  if (global.nickSessions?.has(threadID)) {
    clearInterval(global.nickSessions.get(threadID));
    global.nickSessions.delete(threadID);
  }
}

function stopProtection(threadID) {
  _clearProtection(threadID);
  if (global.nickPersist) delete global.nickPersist[threadID];
  saveNickState();
}

// ── Module ───────────────────────────────────────────────────────────────────

module.exports.config = {
  name:            "كنيات",
  version:         "3.1.0",
  hasPermssion:    1,
  credits:         "Gemini / Djamel",
  description:     "حماية كنيات الأعضاء — تطبيق مستمر ومتكرر، وليس تغيير لمرة واحدة",
  commandCategory: "إدارة المجموعة",
  usages:          "تشغيل [الكنية] / ايقاف / وقت [3s | 0.5m] / حالة",
  cooldowns:       5
};

if (!global.nickSessions) global.nickSessions = new Map();
if (!global.nickPersist)  global.nickPersist  = {};
if (!global.nickProtect)  global.nickProtect  = {};

module.exports.onLoad = function ({ api }) {
  global.nickSessions = global.nickSessions || new Map();
  global.nickPersist  = global.nickPersist  || {};
  global.nickProtect  = global.nickProtect  || {};

  const saved = loadNickState();
  for (const [threadID, cfg] of Object.entries(saved)) {
    const nickname   = typeof cfg === "string" ? cfg : cfg.nickname;
    const intervalMs = (typeof cfg === "object" && cfg.intervalMs) || DEFAULT_INTERVAL;
    if (!nickname) continue;
    // Restore persisted entry — always keep it even if startProtection fails
    global.nickPersist[threadID] = { nickname, intervalMs };
    if (!global.nickProtect[threadID]?.active) {
      startProtection(api, threadID, nickname, intervalMs);
    }
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const type = args[0];

  if (type === "ايقاف") {
    const isActive = global.nickProtect?.[threadID]?.active || global.nickSessions.has(threadID);
    if (!isActive && !global.nickPersist?.[threadID]) {
      return api.sendMessage("⚠️ لا توجد حماية كنيات نشطة في هذه المجموعة حالياً.", threadID, messageID);
    }
    stopProtection(threadID);
    return api.sendMessage("🛑 تم إيقاف حماية الكنيات بنجاح.", threadID, messageID);
  }

  if (type === "وقت") {
    const input = args[1];
    if (!input) {
      return api.sendMessage(
        "📌 الاستخدام: كنيات وقت [السرعة]\n\nأمثلة:\n• كنيات وقت 3s  ← 3 ثواني بين كل عضو\n• كنيات وقت 10s ← 10 ثواني\n• كنيات وقت 0.5m ← 30 ثانية",
        threadID, messageID
      );
    }

    const ms = parseInterval(input);
    if (!ms || ms < MIN_INTERVAL) {
      return api.sendMessage(
        `⚠️ الحد الأدنى المسموح هو ${MIN_INTERVAL / 1000} ثواني.\nمثال: كنيات وقت 3s`,
        threadID, messageID
      );
    }

    const state = global.nickProtect?.[threadID];
    if (state?.active) {
      const { nickname } = state;
      _clearProtection(threadID);
      global.nickPersist[threadID] = { nickname, intervalMs: ms };
      saveNickState();
      startProtection(api, threadID, nickname, ms);
      return api.sendMessage(
        `✅ تم تحديث السرعة إلى ${ms / 1000}s لكل عضو.\n🔄 الحماية لا تزال نشطة.`,
        threadID, messageID
      );
    } else {
      if (!global.nickPersist[threadID]) global.nickPersist[threadID] = { nickname: null, intervalMs: ms };
      else global.nickPersist[threadID].intervalMs = ms;
      return api.sendMessage(
        `✅ تم حفظ السرعة: ${ms / 1000}s لكل عضو.\n` +
        `(ستُطبَّق عند تشغيل الحماية بأمر: كنيات تشغيل [الكنية])`,
        threadID, messageID
      );
    }
  }

  if (type === "حالة") {
    const state = global.nickProtect?.[threadID];
    if (state?.active) {
      const members  = state.participantIDs?.length || 0;
      const idx      = state.index || 0;
      const spd      = (state.intervalMs / 1000).toFixed(1);
      const cycle    = (state.cycleCount || 0) + 1;
      return api.sendMessage(
        `🛡️ حماية الكنيات نشطة\n\n` +
        `📝 الكنية   : "${state.nickname}"\n` +
        `⏱️ السرعة   : ${spd}s لكل عضو\n` +
        `👥 الأعضاء  : ${members}\n` +
        `🔄 الدورة   : ${cycle} | العضو الحالي: ${idx}/${members}\n\n` +
        `للإيقاف: كنيات ايقاف\n` +
        `لتغيير السرعة: كنيات وقت [3s / 0.5m]`,
        threadID, messageID
      );
    } else {
      const cfg = global.nickPersist?.[threadID];
      const savedSpd = ((cfg?.intervalMs || DEFAULT_INTERVAL) / 1000).toFixed(1);
      const savedNick = cfg?.nickname || "غير محددة";
      return api.sendMessage(
        `🔴 حماية الكنيات غير نشطة حالياً\n` +
        `📝 الكنية المحفوظة: ${savedNick}\n` +
        `⏱️ السرعة المحفوظة: ${savedSpd}s\n\n` +
        `لتشغيلها: كنيات تشغيل [الكنية]`,
        threadID, messageID
      );
    }
  }

  if (type === "تشغيل") {
    const nickname = args.slice(1).join(" ").trim();
    if (!nickname) {
      return api.sendMessage("📌 الاستخدام: كنيات تشغيل [الكنية المطلوبة]", threadID, messageID);
    }

    const existing = global.nickProtect?.[threadID];
    if (existing?.active) {
      return api.sendMessage(
        `⚠️ حماية الكنيات تعمل بالفعل بكنية: "${existing.nickname}"\nأوقفها أولاً: كنيات ايقاف`,
        threadID, messageID
      );
    }

    const intervalMs = global.nickPersist?.[threadID]?.intervalMs || DEFAULT_INTERVAL;

    try {
      const threadInfo = await api.getThreadInfo(threadID);
      const count      = threadInfo?.participantIDs?.length || 0;

      global.nickPersist[threadID] = { nickname, intervalMs };
      saveNickState();

      startProtection(api, threadID, nickname, intervalMs);

      return api.sendMessage(
        `🛡️ تم تفعيل حماية الكنيات\n\n` +
        `📝 الكنية  : "${nickname}"\n` +
        `👥 الأعضاء : ${count}\n` +
        `⏱️ السرعة  : ${intervalMs / 1000}s لكل عضو\n\n` +
        `🔄 الحماية مستمرة — تُعاد الكنية تلقائياً بعد كل دورة.\n\n` +
        `للإيقاف: كنيات ايقاف\n` +
        `لتغيير السرعة: كنيات وقت [3s / 0.5m]\n` +
        `لعرض الحالة: كنيات حالة`,
        threadID, messageID
      );
    } catch (error) {
      return api.sendMessage("❌ حدث خطأ أثناء جلب بيانات الأعضاء.", threadID, messageID);
    }
  }

  return api.sendMessage(
    "📌 أوامر الكنيات:\n\n" +
    "• كنيات تشغيل [الكنية] — تفعيل حماية الكنيات\n" +
    "• كنيات ايقاف           — إيقاف الحماية\n" +
    "• كنيات وقت [3s / 0.5m] — ضبط سرعة التغيير\n" +
    "• كنيات حالة            — عرض الحالة الحالية",
    threadID, messageID
  );
};

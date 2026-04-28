const fs = require("fs-extra");
const path = require("path");

const MOTOR2_FILE = path.join(process.cwd(), "data", "motor2-state.json");

function loadState() {
  try {
    fs.ensureDirSync(path.dirname(MOTOR2_FILE));
    if (fs.existsSync(MOTOR2_FILE)) {
      return JSON.parse(fs.readFileSync(MOTOR2_FILE, "utf8"));
    }
  } catch (_) {}
  return {};
}

function saveState() {
  try {
    fs.ensureDirSync(path.dirname(MOTOR2_FILE));
    const toSave = {};
    for (const [tid, d] of Object.entries(global.motorData2 || {})) {
      toSave[tid] = {
        status:      d.status,
        message:     d.message,
        time:        d.time,
        randomTime:  d.randomTime  || false,
        randomRange: d.randomRange || null
      };
    }
    fs.writeFileSync(MOTOR2_FILE, JSON.stringify(toSave, null, 2), "utf8");
  } catch (_) {}
}

function startInterval(api, threadID) {
  const d = global.motorData2[threadID];
  if (!d || !d.status || !d.message || !d.time) return;
  try { clearInterval(d.interval); } catch (_) {}
  try { clearTimeout(d.interval); } catch (_) {}
  d.interval = null;

  d.shouldSend = function () {
    const lastActive = (global.lastActivity || {})[threadID];
    if (!lastActive) return false;
    return (Date.now() - lastActive) < (Number(d.time) || 0) * 2;
  };

  try {
    const { scheduleMotorLoop } = require("../../includes/motorSafeSend");
    scheduleMotorLoop({
      api,
      threadID,
      getData: () => global.motorData2[threadID],
      onDisable: () => {
        try { saveState(); } catch (_) {}
      }
    });
  } catch (_) {}
}

module.exports.config = {
  name: "محرك2",
  version: "2.0.0",
  hasPermssion: 2,
  credits: "لي حواك",
  description: "إرسال رسالة تلقائية بشرط وجود نشاط — يبقى بعد إعادة التشغيل",
  commandCategory: "إدارة البوت",
  usages: "تفعيل | ايقاف | رسالة [نص] | وقت [30s/0.5m] | حالة",
  cooldowns: 0
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.onLoad = function ({ api }) {
  global.motorData2   = global.motorData2   || {};
  global.lastActivity = global.lastActivity || {};

  // Restore persisted state and re-start active intervals
  const saved = loadState();
  for (const [tid, d] of Object.entries(saved)) {
    global.motorData2[tid] = {
      status:      d.status      || false,
      message:     d.message     || null,
      time:        d.time        || null,
      randomTime:  d.randomTime  || false,
      randomRange: d.randomRange || null,
      interval:    null
    };
    if (d.status && d.message && d.time) {
      startInterval(api, tid);
    }
  }
};

module.exports.handleEvent = async function ({ event }) {
  const { threadID, isGroup, senderID } = event;
  if (!isGroup) return;
  const botID = String(global.botUserID || "");
  if (String(senderID) !== botID) {
    if (!global.lastActivity) global.lastActivity = {};
    global.lastActivity[threadID] = Date.now();
  }
};

module.exports.run = async function ({ api, event, args, permssion }) {
  const { threadID, messageID } = event;

  if (permssion < 2) {
    return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);
  }

  if (!args[0]) {
    return api.sendMessage(
      "📌 الاستخدام:\nمحرك2 تفعيل\nمحرك2 ايقاف\nمحرك2 رسالة [النص]\nمحرك2 وقت [30s أو 0.5m]\nمحرك2 حالة",
      threadID, messageID
    );
  }

  if (!global.motorData2[threadID]) {
    global.motorData2[threadID] = { status: false, message: null, time: null, randomTime: false, randomRange: null, interval: null };
  }
  const data = global.motorData2[threadID];

  if (args[0] === "رسالة") {
    const msg = args.slice(1).join(" ").trim();
    if (!msg) return api.sendMessage("⚠️ اكتب الرسالة بعد الأمر.", threadID, messageID);
    data.message = msg;
    saveState();
    return api.sendMessage(`✅ تم حفظ الرسالة:\n"${msg}"`, threadID, messageID);
  }

  if (args[0] === "وقت") {
    const input = args[1];
    if (!input) return api.sendMessage("⚠️ حدد الوقت.\nمثال: محرك2 وقت 30s\n🎲 محرك2 وقت r — وقت عشوائي بين 12s و 50s", threadID, messageID);

    if (String(input).trim().toLowerCase() === "r") {
      data.randomTime  = true;
      data.randomRange = { min: 12000, max: 50000 };
      data.time        = 31000;
      saveState();
      return api.sendMessage("🎲 تم تفعيل الوقت العشوائي للمحرك الذكي\nكل رسالة سترسل بفاصل عشوائي بين 12s و 50s", threadID, messageID);
    }

    let ms = 0;
    if (input.endsWith("s"))      ms = parseFloat(input) * 1000;
    else if (input.endsWith("m")) ms = parseFloat(input) * 60 * 1000;
    else return api.sendMessage("⚠️ استخدم s للثواني أو m للدقائق.\n🎲 أو r للعشوائي", threadID, messageID);
    if (ms < 5000) return api.sendMessage("⚠️ الحد الأدنى 5 ثواني.", threadID, messageID);

    data.time        = ms;
    data.randomTime  = false;
    data.randomRange = null;
    saveState();
    return api.sendMessage(`✅ تم حفظ الوقت: ${input}`, threadID, messageID);
  }

  if (args[0] === "تفعيل") {
    if (data.status === true) return api.sendMessage("⚠️ المحرك مفعل مسبقاً.", threadID, messageID);
    if (!data.message) return api.sendMessage("⚠️ لم تحدد الرسالة بعد.\nاستخدم: محرك2 رسالة [النص]", threadID, messageID);
    if (!data.time) return api.sendMessage("⚠️ لم تحدد الوقت بعد.\nاستخدم: محرك2 وقت [30s أو 0.5m]", threadID, messageID);
    data.status = true;
    startInterval(api, threadID);
    saveState();
    return api.sendMessage(
      `✅ تم تفعيل المحرك الذكي.\n📝 الرسالة: "${data.message}"\n⏱ كل: ${data.time / 1000}s\n🔔 يرسل فقط عند وجود نشاط\n💾 يُحفظ عبر إعادة التشغيل`,
      threadID, messageID
    );
  }

  if (args[0] === "ايقاف") {
    if (data.status === false) return api.sendMessage("⚠️ المحرك غير مفعل أصلاً.", threadID, messageID);
    // Mark stopped FIRST so any in-flight tick aborts before re-scheduling.
    data.status = false;
    try {
      const { stopMotorLoop } = require("../../includes/motorSafeSend");
      stopMotorLoop(threadID);
    } catch (_) {}
    try { clearInterval(data.interval); } catch (_) {}
    try { clearTimeout(data.interval); } catch (_) {}
    data.interval = null;
    saveState();
    return api.sendMessage("🔴 تم إيقاف المحرك.", threadID, messageID);
  }

  if (args[0] === "حالة") {
    const active = data.status === true;
    const timeStr = data.randomTime
      ? `🎲 عشوائي ${(data.randomRange?.min || 12000) / 1000}s - ${(data.randomRange?.max || 50000) / 1000}s`
      : (data.time ? data.time / 1000 + "s" : "غير محدد");
    return api.sendMessage(
      `📊 حالة المحرك الذكي (هذه المجموعة)\n\n` +
      `الحالة  : ${active ? "✅ مفعّل" : "🔴 موقوف"}\n` +
      `الرسالة : ${data.message || "غير محددة"}\n` +
      `الوقت   : ${timeStr}`,
      threadID, messageID
    );
  }

  return api.sendMessage(
    "📌 الاستخدام:\nمحرك2 تفعيل\nمحرك2 ايقاف\nمحرك2 رسالة [النص]\nمحرك2 وقت [30s أو 0.5m]\nمحرك2 حالة",
    threadID, messageID
  );
};

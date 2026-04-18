const fs = require("fs-extra");
const path = require("path");

const MOTOR2_FILE = path.join(process.cwd(), "data", "motor2-state.json");

// A transient FB error won't disable motor2. Only after FAIL_THRESHOLD
// consecutive send failures on the same thread is it auto-disabled.
const FAIL_THRESHOLD = 3;
const _failCounts = {};

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
        status:  d.status,
        message: d.message,
        time:    d.time
      };
    }
    const tmp = MOTOR2_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(toSave, null, 2), "utf8");
    fs.renameSync(tmp, MOTOR2_FILE);
  } catch (_) {}
}

function startInterval(api, threadID) {
  const d = global.motorData2[threadID];
  if (!d || !d.status || !d.message || !d.time) return;
  if (d.interval) { clearInterval(d.interval); d.interval = null; }
  d.interval = setInterval(() => {
    const botApi = global._botApi || api;
    if (!botApi) return;
    const lastActive = (global.lastActivity || {})[threadID];
    if (!lastActive) return;
    if (Date.now() - lastActive < d.time * 2) {
      botApi.sendMessage(d.message, threadID).then(() => {
        // Success — reset fail counter
        _failCounts[threadID] = 0;
      }).catch((err) => {
        const msg = String(err && (err.message || err)).toLowerCase();

        // Skip MQTT/connectivity errors — don't count them against the thread
        if (msg.includes("mqtt") || msg.includes("not connected")) return;

        // Only count definitively dead-thread errors toward auto-disable
        const isDeadThread =
          msg.includes("no message_thread") ||
          msg.includes("thread may not exist") ||
          msg.includes("not a participant") ||
          msg.includes("you are not a member");

        if (isDeadThread) {
          _failCounts[threadID] = (_failCounts[threadID] || 0) + 1;
          if (_failCounts[threadID] >= FAIL_THRESHOLD) {
            if (d.interval) { clearInterval(d.interval); d.interval = null; }
            d.status = false;
            delete _failCounts[threadID];
            saveState();
          }
        }
        // All other errors are transient — keep the motor running
      });
    }
  }, d.time);
}

module.exports.config = {
  name: "محرك2",
  version: "2.1.0",
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

  const saved = loadState();
  for (const [tid, d] of Object.entries(saved)) {
    global.motorData2[tid] = {
      status:   d.status  || false,
      message:  d.message || null,
      time:     d.time    || null,
      interval: null
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
    global.motorData2[threadID] = { status: false, message: null, time: null, interval: null };
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
    if (!input) return api.sendMessage("⚠️ حدد الوقت.\nمثال: محرك2 وقت 30s", threadID, messageID);
    let ms = 0;
    if (input.endsWith("s"))      ms = parseFloat(input) * 1000;
    else if (input.endsWith("m")) ms = parseFloat(input) * 60 * 1000;
    else return api.sendMessage("⚠️ استخدم s للثواني أو m للدقائق.", threadID, messageID);
    if (ms < 5000) return api.sendMessage("⚠️ الحد الأدنى 5 ثواني.", threadID, messageID);
    data.time = ms;
    saveState();
    return api.sendMessage(`✅ تم حفظ الوقت: ${input}`, threadID, messageID);
  }

  if (args[0] === "تفعيل") {
    if (data.status === true) return api.sendMessage("⚠️ المحرك مفعل مسبقاً.", threadID, messageID);
    if (!data.message) return api.sendMessage("⚠️ لم تحدد الرسالة بعد.\nاستخدم: محرك2 رسالة [النص]", threadID, messageID);
    if (!data.time) return api.sendMessage("⚠️ لم تحدد الوقت بعد.\nاستخدم: محرك2 وقت [30s أو 0.5m]", threadID, messageID);
    data.status = true;
    _failCounts[threadID] = 0;
    startInterval(api, threadID);
    saveState();
    return api.sendMessage(
      `✅ تم تفعيل المحرك الذكي.\n📝 الرسالة: "${data.message}"\n⏱ كل: ${data.time / 1000}s\n🔔 يرسل فقط عند وجود نشاط\n💾 يُحفظ عبر إعادة التشغيل`,
      threadID, messageID
    );
  }

  if (args[0] === "ايقاف") {
    if (data.status === false) return api.sendMessage("⚠️ المحرك غير مفعل أصلاً.", threadID, messageID);
    if (data.interval) { clearInterval(data.interval); data.interval = null; }
    data.status = false;
    delete _failCounts[threadID];
    saveState();
    return api.sendMessage("🔴 تم إيقاف المحرك.", threadID, messageID);
  }

  if (args[0] === "حالة") {
    const active = data.status === true;
    return api.sendMessage(
      `📊 حالة المحرك الذكي (هذه المجموعة)\n\n` +
      `الحالة  : ${active ? "✅ مفعّل" : "🔴 موقوف"}\n` +
      `الرسالة : ${data.message || "غير محددة"}\n` +
      `الوقت   : ${data.time ? data.time / 1000 + "s" : "غير محدد"}`,
      threadID, messageID
    );
  }

  return api.sendMessage(
    "📌 الاستخدام:\nمحرك2 تفعيل\nمحرك2 ايقاف\nمحرك2 رسالة [النص]\nمحرك2 وقت [30s أو 0.5m]\nمحرك2 حالة",
    threadID, messageID
  );
};

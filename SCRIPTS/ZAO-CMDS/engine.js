module.exports.config = {
  name: "محرك",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "SAIN",
  description: "إرسال رسالة تلقائية كل فترة زمنية محددة",
  commandCategory: "إدارة البوت",
  usages: "تفعيل | ايقاف | رسالة [نص] | وقت [مثال: 30s أو 0.5m]",
  cooldowns: 0
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.onLoad = () => {
  global.motorData = global.motorData || {};
};

module.exports.run = async function ({ api, event, args, permssion }) {
  const { threadID, messageID } = event;

  if (permssion < 2) return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);
  if (!args[0]) return api.sendMessage(
    "📌 الاستخدام:\nمحرك تفعيل\nمحرك ايقاف\nمحرك رسالة [النص]\nمحرك وقت [مثال: 30s أو 0.5m]",
    threadID, messageID
  );

  if (!global.motorData[threadID]) {
    global.motorData[threadID] = {
      status: false,
      message: null,
      time: null,
      interval: null
    };
  }

  const data = global.motorData[threadID];

  // ── رسالة المحرك ──
  if (args[0] === "رسالة") {
    const body = event.body || "";
    const subCmd = "رسالة";
    const subCmdIdx = body.indexOf(subCmd);
    let msg;
    if (subCmdIdx !== -1) {
      msg = body.slice(subCmdIdx + subCmd.length).replace(/^ /, "");
    } else {
      msg = args.slice(1).join(" ");
    }
    if (!msg) return api.sendMessage("⚠️ اكتب الرسالة بعد الأمر.\nمثال: محرك رسالة اهلا", threadID, messageID);
    data.message = msg;
    return api.sendMessage(`✅ تم حفظ رسالة المحرك:\n"${msg}"`, threadID, messageID);
  }

  // ── وقت المحرك ──
  else if (args[0] === "وقت") {
    const input = args[1];
    if (!input) return api.sendMessage(
      "⚠️ حدد الوقت.\nمثال: محرك وقت 30s أو محرك وقت 0.5m\n🎲 محرك وقت r — وقت عشوائي بين 12s و 50s",
      threadID, messageID
    );

    if (String(input).trim().toLowerCase() === "r") {
      data.randomTime  = true;
      data.randomRange = { min: 12000, max: 50000 };
      data.time        = 31000;
      return api.sendMessage("🎲 تم تفعيل الوقت العشوائي للمحرك\nكل رسالة سترسل بفاصل عشوائي بين 12s و 50s", threadID, messageID);
    }

    let ms = 0;
    if (input.endsWith("s")) ms = parseFloat(input) * 1000;
    else if (input.endsWith("m")) ms = parseFloat(input) * 60 * 1000;
    else return api.sendMessage("⚠️ صيغة الوقت غير صحيحة.\nاستخدم s للثواني أو m للدقائق.\nمثال: 30s أو 0.5m\n🎲 أو r للعشوائي", threadID, messageID);

    if (ms < 5000) return api.sendMessage("⚠️ الحد الأدنى للوقت هو 5 ثواني.", threadID, messageID);

    data.time        = ms;
    data.randomTime  = false;
    data.randomRange = null;
    return api.sendMessage(`✅ تم حفظ وقت المحرك: ${input}`, threadID, messageID);
  }

  // ── تفعيل المحرك ──
  else if (args[0] === "تفعيل") {
    if (data.status === true) return api.sendMessage("⚠️ المحرك مفعل مسبقاً.", threadID, messageID);
    if (!data.message) return api.sendMessage("⚠️ لم تحدد رسالة المحرك بعد.\nاستخدم: محرك رسالة [النص]", threadID, messageID);
    if (!data.time) return api.sendMessage("⚠️ لم تحدد وقت المحرك بعد.\nاستخدم: محرك وقت [مثال: 30s]", threadID, messageID);

    data.status = true;
    try {
      const { scheduleMotorLoop } = require("../../includes/motorSafeSend");
      if (data.interval) {
        try { clearInterval(data.interval); } catch (_) {}
        try { clearTimeout(data.interval); } catch (_) {}
        data.interval = null;
      }
      scheduleMotorLoop({
        api,
        threadID,
        getData: () => global.motorData[threadID],
        onDisable: () => {}
      });
    } catch (_) {}

    return api.sendMessage(`✅ تم تفعيل المحرك.\n📝 الرسالة: "${data.message}"\n⏱ كل: ${data.time / 1000}s`, threadID, messageID);
  }

  // ── ايقاف المحرك ──
  else if (args[0] === "ايقاف") {
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
    return api.sendMessage("🔴 تم إيقاف المحرك.", threadID, messageID);
  }

  else {
    return api.sendMessage(
      "📌 الاستخدام:\nمحرك تفعيل\nمحرك ايقاف\nمحرك رسالة [النص]\nمحرك وقت [مثال: 30s أو 0.5m]",
      threadID, messageID
    );
  }
};
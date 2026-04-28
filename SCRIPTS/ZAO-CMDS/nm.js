const { loadLocks, saveLocks } = require("../../includes/nameLocks");

function setTitle(api, name, threadID) {
  return new Promise((resolve, reject) => {
    try {
      const result = api.gcname(name, threadID, (err) => {
        if (err) reject(err);
        else resolve();
      });
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (e) {
      reject(e);
    }
  });
}

module.exports.config = {
  name: "nm",
  version: "2.0.0",
  hasPermssion: 2,
  credits: "l7wak",
  description: "قفل اسم المجموعة ومنع تغييره",
  commandCategory: "نظام",
  usages: "تفعيل [الاسم] | ايقاف | قائمة | تنظيف",
  cooldowns: 3
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.onLoad = function ({ api }) {
  global.nameLocks = loadLocks();

  if (global._nmInterval) {
    clearInterval(global._nmInterval);
    global._nmInterval = null;
  }

  global._nmInterval = setInterval(async () => {
    const botApi = global._botApi || api;
    if (!botApi || global.nameLocks.size === 0) return;

    const health = global.nkx?.health;
    if (health) {
      const mqttOk = health?.mqtt?.isConnected ?? health?.mqttConnected ?? true;
      if (!mqttOk) return;
    }

    for (const [threadID, lockedName] of global.nameLocks.entries()) {
      try {
        await setTitle(botApi, lockedName, threadID);
      } catch (err) {
        const msg = String(err && (err.message || err)).toLowerCase();
        if (
          msg.includes("not connected to mqtt") ||
          msg.includes("mqtt client is not initialized") ||
          msg.includes("mqtt")
        ) {
          continue;
        }
        if (
          msg.includes("no message_thread") ||
          msg.includes("thread may not exist") ||
          msg.includes("access may be restricted") ||
          msg.includes("not a participant") ||
          msg.includes("not found") ||
          msg.includes("cannot set title")
        ) {
          global.nameLocks.delete(threadID);
          saveLocks(global.nameLocks);
        }
      }
    }
  }, 6000);
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const action = args[0];

  const helpMsg =
    "📌 أوامر nm:\n" +
    "• nm تفعيل [الاسم] — قفل اسم المجموعة\n" +
    "• nm ايقاف — إيقاف القفل\n" +
    "• nm قائمة — عرض المجموعات المقفولة\n" +
    "• nm تنظيف — حذف جميع الأقفال";

  if (!action) return api.sendMessage(helpMsg, threadID, messageID);

  if (action === "تفعيل") {
    const name = args.slice(1).join(" ").trim();
    if (!name) return api.sendMessage("⚠️ أدخل الاسم.\nمثال: nm تفعيل اسم المجموعة", threadID, messageID);
    try {
      await setTitle(api, name, threadID);
    } catch (e) {
      return api.sendMessage(`❌ فشل تغيير الاسم: ${e.message || e}`, threadID, messageID);
    }
    global.nameLocks.set(threadID, name);
    saveLocks(global.nameLocks);
    return api.sendMessage(`🔒 تم قفل اسم المجموعة:\n"${name}"`, threadID, messageID);
  }

  if (action === "ايقاف") {
    if (!global.nameLocks.has(threadID))
      return api.sendMessage("⚠️ لا يوجد قفل مفعل في هذه المجموعة.", threadID, messageID);
    global.nameLocks.delete(threadID);
    saveLocks(global.nameLocks);
    return api.sendMessage("🔓 تم إيقاف قفل اسم المجموعة.", threadID, messageID);
  }

  if (action === "قائمة") {
    if (global.nameLocks.size === 0)
      return api.sendMessage("📋 لا توجد مجموعات مقفولة حالياً.", threadID, messageID);
    let list = "🔒 المجموعات المقفولة:\n";
    let i = 1;
    for (const [tid, name] of global.nameLocks.entries()) {
      list += `${i}. [${tid}]: "${name}"\n`;
      i++;
    }
    return api.sendMessage(list.trim(), threadID, messageID);
  }

  if (action === "تنظيف") {
    const count = global.nameLocks.size;
    if (count === 0) return api.sendMessage("🗑️ لا توجد بيانات لحذفها.", threadID, messageID);
    global.nameLocks.clear();
    saveLocks(global.nameLocks);
    return api.sendMessage(`🧹 تم حذف جميع الأقفال.\nعدد المجموعات المحذوفة: ${count}`, threadID, messageID);
  }

  return api.sendMessage(helpMsg, threadID, messageID);
};

module.exports.config = {
  name: "nm",
  version: "1.0.2",
  hasPermssion: 2,
  credits: "l7wak",
  description: "تغيير اسم المجموعة باستمرار",
  commandCategory: "نظام",
  usages: "[تفعيل/ايقاف] [الاسم]",
  cooldowns: 5
};

module.exports.onLoad = function () {
  global.nameLocks = global.nameLocks || new Map();
  if (global.nmIntervalStarted) return;
  global.nmIntervalStarted = true;
  setInterval(async () => {
    if (!global.client?.api) return;
    for (const [threadID, lockedName] of global.nameLocks.entries()) {
      try {
        const info = await global.client.api.getThreadInfo(threadID);
        if (info.threadName !== lockedName) {
          await global.client.api.setTitle(lockedName, threadID);
        }
      } catch (e) {}
    }
  }, 5000);
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID } = event;

  if (!global.config.ADMINBOT.includes(senderID.toString()))
    return api.sendMessage("❌ هذا الأمر خاص بإدارة البوت فقط.", threadID);

  const action = args[0];

  if (action === "تفعيل") {
    const name = args.slice(1).join(" ");
    if (!name) return api.sendMessage("⚠️ الرجاء إدخال الاسم.\nمثال: nm تفعيل [الاسم]", threadID);
    await api.setTitle(name, threadID);
    global.nameLocks.set(threadID, name);
    return api.sendMessage(`🔒 تم قفل اسم المجموعة:\n${name}`, threadID);
  }

  else if (action === "ايقاف") {
    if (!global.nameLocks.has(threadID))
      return api.sendMessage("⚠️ لا يوجد قفل مفعل في هذه المجموعة.", threadID);
    global.nameLocks.delete(threadID);
    return api.sendMessage("🔓 تم إيقاف قفل اسم المجموعة بنجاح.", threadID);
  }

  else if (action === "تنظيف") {
    const count = global.nameLocks.size;
    if (count === 0) return api.sendMessage("🗑️ لا توجد بيانات مخزنة لحذفها.", threadID);
    global.nameLocks.clear();
    return api.sendMessage(`🧹 تم تنظيف جميع البيانات.\n📦 عدد المجموعات: ${count}`, threadID);
  }

  else {
    return api.sendMessage(
      "📌 طريقة الاستخدام:\n" +
      "• nm تفعيل [الاسم] — لقفل اسم المجموعة\n" +
      "• nm ايقاف — لإيقاف القفل\n" +
      "• nm تنظيف — لحذف جميع البيانات",
      threadID
    );
  }
};
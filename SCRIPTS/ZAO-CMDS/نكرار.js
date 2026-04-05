module.exports.config = {
  name: "تكرار",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "نوت دفاين",
  description: "تكرار اسم المجموعة للحفاظ عليه",
  commandCategory: "مسؤولي المجموعات",
  usages: "تفعيل | ايقاف",
  cooldowns: 0
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.onLoad = () => {
  global.repeatName = global.repeatName || {};
};

module.exports.handleEvent = async function ({ api, event }) {
  try {
    const { threadID, isGroup, logMessageType, logMessageData } = event;
    if (!isGroup) return;

    if (logMessageType === "log:thread-name") {
      const entry = global.repeatName && global.repeatName[threadID];
      if (!entry || entry.status !== true) return;
      const savedName = entry.name;
      const newName = logMessageData?.name;
      if (!savedName || !newName) return;
      if (newName !== savedName) {
        try { await api.setTitle(savedName, threadID); } catch (_) {}
      }
    }
  } catch (e) {}
};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID, senderID, isGroup } = event;
  const args = event.body.trim().split(/ +/).slice(1);

  if (!isGroup) return api.sendMessage("⛔ هذا الأمر للمجموعات فقط.", threadID, messageID);
  if (!global.config.ADMINBOT.includes(senderID.toString()))
    return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);
  if (!args[0]) return api.sendMessage("📌 الاستخدام: تكرار تفعيل | تكرار ايقاف", threadID, messageID);

  if (!global.repeatName) global.repeatName = {};

  if (args[0] === "تفعيل") {
    const entry = global.repeatName[threadID];
    if (entry && entry.status === true)
      return api.sendMessage(
        `⚠️ التكرار مفعل مسبقاً.\n📌 الاسم المحفوظ: ${entry.name}`,
        threadID, messageID
      );

    const customName = args.slice(1).join(" ").trim();
    if (customName) {
      global.repeatName[threadID] = { name: customName, status: true };
      return api.sendMessage(
        `✅ تم تفعيل حماية اسم المجموعة.\n📌 الاسم المحفوظ: ${customName}`,
        threadID, messageID
      );
    }

    api.sendMessage("⏳ جاري جلب اسم المجموعة...", threadID);

    try {
      const info = await new Promise((resolve, reject) => {
        api.getThreadInfo(threadID, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });

      const threadName = info?.threadName || info?.name;
      if (!threadName) {
        return api.sendMessage(
          "⚠️ لم أتمكن من جلب اسم المجموعة.\nاكتب: تكرار تفعيل [الاسم]",
          threadID, messageID
        );
      }

      global.repeatName[threadID] = { name: threadName, status: true };
      return api.sendMessage(
        `✅ تم تفعيل حماية اسم المجموعة.\n📌 الاسم المحفوظ: ${threadName}`,
        threadID, messageID
      );
    } catch (e) {
      return api.sendMessage(
        "⚠️ فشل جلب اسم المجموعة.\nاكتب: تكرار تفعيل [الاسم]",
        threadID, messageID
      );
    }
  }

  else if (args[0] === "ايقاف") {
    const entry = global.repeatName[threadID];
    if (!entry || entry.status === false)
      return api.sendMessage("⚠️ التكرار غير مفعل أصلاً.", threadID, messageID);
    global.repeatName[threadID].status = false;
    return api.sendMessage("🔓 تم إيقاف حماية اسم المجموعة.", threadID, messageID);
  }

  else {
    return api.sendMessage(
      "📌 الاستخدام:\nتكرار تفعيل\nتكرار تفعيل [اسم مخصص]\nتكرار ايقاف",
      threadID, messageID
    );
  }
};

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

    // التقاط تغيير الاسم
    if (logMessageType === "log:thread-name") {
      if (!global.repeatName[threadID] || global.repeatName[threadID].status === false) return;
      const savedName = global.repeatName[threadID].name;
      const newName = logMessageData?.name;
      if (!savedName || !newName) return;
      if (newName !== savedName) api.setTitle(savedName, threadID);
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
    if (global.repeatName[threadID] && global.repeatName[threadID].status === true)
      return api.sendMessage("⚠️ التكرار مفعل مسبقاً.", threadID, messageID);

    // اكتب اسم المجموعة يدوياً من event
    const threadName = event.threadName || global.data?.threadInfo?.get(threadID)?.threadName;

    if (!threadName) return api.sendMessage(
      "⚠️ لم أتمكن من جلب اسم المجموعة.\nاكتب: تكرار تفعيل [الاسم]",
      threadID, messageID
    );

    global.repeatName[threadID] = { name: threadName, status: true };
    return api.sendMessage(`✅ تم تفعيل حماية اسم المجموعة.\n📌 الاسم المحفوظ: ${threadName}`, threadID, messageID);
  }

  else if (args[0] === "ايقاف") {
    if (!global.repeatName[threadID] || global.repeatName[threadID].status === false)
      return api.sendMessage("⚠️ التكرار غير مفعل أصلاً.", threadID, messageID);
    global.repeatName[threadID].status = false;
    return api.sendMessage("🔓 تم إيقاف حماية اسم المجموعة.", threadID, messageID);
  }

  else if (args[0] === "تفعيل" && args[1]) {
    const threadName = args.slice(1).join(" ");
    global.repeatName[threadID] = { name: threadName, status: true };
    return api.sendMessage(`✅ تم تفعيل حماية اسم المجموعة.\n📌 الاسم المحفوظ: ${threadName}`, threadID, messageID);
  }

  else {
    return api.sendMessage("📌 الاستخدام:\nتكرار تفعيل\nتكرار ايقاف\nأو: تكرار تفعيل [اسم المجموعة]", threadID, messageID);
  }
};
```

---

الآن عندما لا يستطيع جلب الاسم تلقائياً يمكنك كتابته يدوياً:
```
تكرار تفعيل اسم مجموعتي
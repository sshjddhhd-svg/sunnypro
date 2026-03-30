module.exports.config = {
  name: "التحكم",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "SAIN",
  description: "لوحة تحكم البوت",
  commandCategory: "إدارة البوت",
  usages: "",
  cooldowns: 0
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.onLoad = () => {
  global.controlPanel = global.controlPanel || {};
};

module.exports.run = async function ({ api, event, permssion }) {
  const { threadID, messageID, senderID } = event;

  if (permssion < 2) return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);

  global.controlPanel[senderID] = { step: "main", botMessageID: null };

  api.sendMessage(
    "🎛️ لوحة التحكم\n\n1. المتاح\n2. طلبات المراسلة\n\nأرسل رقم بالرد على هذه الرسالة:",
    threadID,
    (err, info) => {
      if (!err) global.controlPanel[senderID].botMessageID = info.messageID;
    },
    messageID
  );
};

module.exports.handleEvent = async function ({ api, event, permssion }) {
  const { threadID, messageID, senderID, body, messageReply } = event;

  if (permssion < 2) return;
  if (!body || !body.trim()) return;
  if (!global.controlPanel || !global.controlPanel[senderID]) return;

  // ── التحقق أنه رد على رسالة البوت ──
  const session = global.controlPanel[senderID];
  if (!messageReply || messageReply.messageID !== session.botMessageID) return;

  const input = body.trim();

  // ── الخطوة الرئيسية ──
  if (session.step === "main") {

    if (input === "1") {
      try {
        const threads = await api.getThreadList(20, null, ["INBOX"]);
        if (!threads || threads.length === 0)
          return api.sendMessage("⚠️ لا توجد محادثات متاحة.", threadID, messageID);

        let list = "📋 المتاح:\n\n";
        const map = {};
        let i = 1;

        for (const t of threads) {
          const name = t.isGroup
            ? (t.name || `مجموعة`)
            : `DM`;
          list += `${i}. ${t.isGroup ? "👥" : "👤"} ${name}\n🆔 ${t.threadID}\n\n`;
          map[i] = t.threadID;
          i++;
        }

        list += "أرسل بالرد: رقم:رسالة\nمثال: 1:مرحبا";

        api.sendMessage(list, threadID, (err, info) => {
          if (!err) {
            global.controlPanel[senderID] = {
              step: "select",
              map,
              botMessageID: info.messageID
            };
          }
        }, messageID);

      } catch (e) {
        return api.sendMessage("⚠️ حدث خطأ أثناء جلب المحادثات.", threadID, messageID);
      }
    }

    else if (input === "2") {
      try {
        const pending = await api.getThreadList(20, null, ["PENDING"]);
        if (!pending || pending.length === 0)
          return api.sendMessage("📭 لا توجد طلبات مراسلة.", threadID, messageID);

        let list = "📩 طلبات المراسلة:\n\n";
        const map = {};
        let i = 1;

        for (const t of pending) {
          const name = t.isGroup ? (t.name || `مجموعة`) : `DM`;
          list += `${i}. ${t.isGroup ? "👥" : "👤"} ${name}\n🆔 ${t.threadID}\n\n`;
          map[i] = t.threadID;
          i++;
        }

        list += "أرسل بالرد:\nقبول رقم\nرفض رقم";

        api.sendMessage(list, threadID, (err, info) => {
          if (!err) {
            global.controlPanel[senderID] = {
              step: "pending",
              map,
              botMessageID: info.messageID
            };
          }
        }, messageID);

      } catch (e) {
        return api.sendMessage("⚠️ حدث خطأ أثناء جلب الطلبات.", threadID, messageID);
      }
    }

    else {
      return api.sendMessage("⚠️ اختر 1 أو 2 فقط بالرد.", threadID, messageID);
    }
  }

  // ── خطوة اختيار المجموعة وتنفيذ الأمر ──
  else if (session.step === "select") {
    if (input === "خروج") {
      delete global.controlPanel[senderID];
      return api.sendMessage("👋 تم الخروج من لوحة التحكم.", threadID, messageID);
    }

    if (input.includes(":")) {
      const [numStr, ...cmdParts] = input.split(":");
      const num = parseInt(numStr.trim());
      const cmd = cmdParts.join(":").trim();

      if (!session.map[num])
        return api.sendMessage("⚠️ رقم غير موجود.", threadID, messageID);

      const targetThread = session.map[num];
      if (!cmd)
        return api.sendMessage("⚠️ اكتب الرسالة بعد الرقم.\nمثال: 1:مرحبا", threadID, messageID);

      await api.sendMessage(`${cmd}`, targetThread);
      return api.sendMessage(`✅ تم الإرسال إلى:\n🆔 ${targetThread}`, threadID, messageID);
    }

    return api.sendMessage("📌 الصيغة: رقم:رسالة\nمثال: 1:مرحبا\nأو اكتب 'خروج'", threadID, messageID);
  }

  // ── خطوة طلبات المراسلة ──
  else if (session.step === "pending") {
    if (input === "خروج") {
      delete global.controlPanel[senderID];
      return api.sendMessage("👋 تم الخروج من لوحة التحكم.", threadID, messageID);
    }

    const parts = input.split(" ");
    const action = parts[0];
    const num = parseInt(parts[1]);

    if (!session.map[num])
      return api.sendMessage("⚠️ رقم غير موجود.", threadID, messageID);

    const targetThread = session.map[num];

    if (action === "قبول") {
      try {
        await api.handleMessageRequest(targetThread, true);
        return api.sendMessage(`✅ تم قبول الطلب.\n🆔 ${targetThread}\nيمكنك الآن التحكم فيه من خيار 1.`, threadID, messageID);
      } catch (e) {
        return api.sendMessage("⚠️ حدث خطأ أثناء القبول.", threadID, messageID);
      }
    }

    else if (action === "رفض") {
      try {
        await api.handleMessageRequest(targetThread, false);
        return api.sendMessage(`🗑️ تم الرفض.\n🆔 ${targetThread}`, threadID, messageID);
      } catch (e) {
        return api.sendMessage("⚠️ حدث خطأ أثناء الرفض.", threadID, messageID);
      }
    }

    else {
      return api.sendMessage("📌 أرسل:\nقبول رقم\nرفض رقم\nأو اكتب 'خروج'", threadID, messageID);
    }
  }
};
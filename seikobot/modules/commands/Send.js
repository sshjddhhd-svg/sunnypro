module.exports.config = {
  name: "ارسل",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "عمر",
  description: "ارسال رسالة الى المستخدمين او الكروبات عن طريق حساب البوت",
  commandCategory: "المطور",
  usages: "للمستخدم/للكروب ID الرسالة",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const moment = require("moment-timezone");

  // جمع إداريين البوت من config
  const botAdmins = [
    ...(global.config.ADMINBOT || []),
    ...(global.config.OPERATOR || []),
    ...(global.config.OWNER || [])
  ].map(String);

  // التحقق من الصلاحية
  if (!botAdmins.includes(String(senderID))) {
    return api.sendMessage("❌ هذا الأمر خاص بإدارة البوت فقط.", threadID, messageID);
  }

  if (!args[0] || !args[1] || !args[2]) {
    return api.sendMessage("⚠️ طريقة الاستخدام:\nارسل للمستخدم/للكروب ID الرسالة", threadID, messageID);
  }

  const type = args[0];
  const targetID = args[1];
  const msg = args.slice(2).join(" ");
  const time = moment.tz("Asia/Baghdad").format("HH:mm:ss D/MM/YYYY");

  const content = `رسالة من المطور !\nالوقت : ${time}\n\nالرسالة : ${msg}`;

  if (type === "للمستخدم" || type === "للكروب") {
    return api.sendMessage(content, targetID)
      .then(() => {
        api.sendMessage("✅ تم إرسال الرسالة بنجاح.", threadID, messageID);
      })
      .catch(() => {
        api.sendMessage("❌ فشل في إرسال الرسالة.", threadID, messageID);
      });
  } else {
    return api.sendMessage("⚠️ استخدم: للمستخدم أو للكروب", threadID, messageID);
  }
};

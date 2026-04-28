module.exports.config = {
  name: "رست",
  version: "2.0.0",
  hasPermssion: 2,
  credits: "عمر",
  description: "اعاده تشغيل البوت",
  commandCategory: "المطور",
  cooldowns: 5
};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID, senderID } = event;

  // جمع كل إداريين البوت من config
  const botAdmins = [
    ...(global.config.ADMINBOT || []),
    ...(global.config.OPERATOR || []),
    ...(global.config.OWNER || [])
  ].map(String);

  // التحقق من الصلاحية
  if (!botAdmins.includes(String(senderID))) {
    return api.sendMessage("❌ هذا الأمر خاص بإدارة البوت فقط.", threadID, messageID);
  }

  // رسالة إعادة التشغيل
  return api.sendMessage(
    "جاري اعادة التشغيل ...⏳🕞",
    threadID,
    () => process.exit(1),
    messageID
  );
};

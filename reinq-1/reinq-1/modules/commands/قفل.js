module.exports.config = {
  name: "قفل",
  version: "1.0.1",
  hasPermission: 2,
  credits: "Replit Agent",
  description: "قفل البوت في جميع المجموعات",
  commandCategory: "نظام",
  usages: "[تفعيل/ايقاف]",
  cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID } = event;

  const action = args[0];

  if (action === "تفعيل") {
    global.lockAll = true;
    return api.sendMessage("🔒 تم تفعيل القفل العام في جميع المجموعات.", threadID, messageID);

  } else if (action === "ايقاف") {
    global.lockAll = false;
    return api.sendMessage("🔓 تم إيقاف القفل العام. البوت متاح للجميع الآن.", threadID, messageID);

  } else {
    return api.sendMessage("الاستخدام: قفل [تفعيل/ايقاف]", threadID, messageID);
  }
};

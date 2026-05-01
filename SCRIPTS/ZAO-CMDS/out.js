module.exports.config = {
  name: "out",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "ZAO",
  description: "إخراج البوت من الغروب",
  commandCategory: "إدارة البوت",
  usages: "out",
  cooldowns: 5
};

module.exports.languages = { vi: {}, en: {} };

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID, isGroup } = event;

  if (!isGroup) {
    return api.sendMessage("⚠️ هذا الأمر يعمل في الغروبات فقط.", threadID, messageID);
  }

  const botID = (api.getCurrentUserID && api.getCurrentUserID()) || global.botUserID;
  if (!botID) {
    return api.sendMessage("❌ ما قدرتش نحدد ID البوت.", threadID, messageID);
  }

  try {
    await api.sendMessage("👋 وداعاً! خارج من الغروب...", threadID);
  } catch (_) {}

  setTimeout(() => {
    try {
      api.removeUserFromGroup(String(botID), String(threadID), (err) => {
        if (err) {
          api.sendMessage(`❌ فشل الخروج: ${err.message || "خطأ غير معروف"}`, threadID, messageID);
        }
      });
    } catch (e) {
      api.sendMessage(`❌ فشل الخروج: ${e.message || "خطأ غير معروف"}`, threadID, messageID);
    }
  }, 800);
};

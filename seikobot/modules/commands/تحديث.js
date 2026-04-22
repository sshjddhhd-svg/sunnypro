module.exports.config = {
  name: "تحديث",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "𝒍𝒊𝒏𝒖𝒙",
  description: "تحديث appstate.json",
  commandCategory: "⭐️𝗔𝗗𝗠𝗜𝗡⭐️",
  usages: "appstate",
  cooldowns: 5,
  dependencies: {
  }
};

module.exports.run = async function ({ api, event, args }) {
  const fs = require("fs-extra");
  const botAdmins = [
    ...(global.config.ADMINBOT || []),
    ...(global.config.OPERATOR || []),
    ...(global.config.OWNER || [])
  ].map(String);

  if (!botAdmins.includes(String(event.senderID))) {
    return api.sendMessage("❌ هذا الأمر خاص بإدارة البوت فقط", event.threadID, event.messageID);
  }
  let appstate = api.getAppState();
  // convert JSON object to a string
  const data = JSON.stringify(appstate);
  // write file to disk
  fs.writeFile(`${__dirname}/../../appstate.json`, data, 'utf8', (err) => {
    if (err) {
      return api.sendMessage(`Error writing file: ${err}`, event.threadID);
    } else {
      return api.sendMessage(`• تــم الـتـحـديـث بـنـجـاح ✅.`, event.threadID);
    }
  });

}

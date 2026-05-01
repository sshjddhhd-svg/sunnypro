module.exports.config = {
  name: "اوامر",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "ZAO Team",
  description: "عرض قائمة الأوامر المتاحة",
  commandCategory: "معلومات",
  usages: "اوامر",
  cooldowns: 3
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.onLoad = () => {};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID } = event;
  const fs = require("fs");
  const path = require("path");

  const cmdsPath = __dirname;
  const files = fs.readdirSync(cmdsPath).filter(f => f.endsWith(".js"));

  const names = [];
  for (const f of files) {
    try {
      const cmd = require(path.join(cmdsPath, f));
      if (cmd.config?.name) names.push(cmd.config.name);
    } catch {}
  }

  const cmdList = names.map(n => `❏ - ﹝${n}﹞`).join("\n\n");

  const msg =
    `ꄥ⃪ | 𝗭'𝖆⃪̷͚𝛔̵̶ᬼ 𒍟 𝐂'o⃪ᬇm̸̷ɑ̶̶ທ̶͟d𝖘 🇷🇸ᬼ\n\n` +
    `${cmdList}`;

  return api.sendMessage(msg, threadID, messageID);
};

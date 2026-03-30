module.exports.config = {
  name: "اوامر",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "نوت دفاين",
  description: "عرض قائمة الأوامر",
  commandCategory: "النظام",
  usages: "",
  cooldowns: 3
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID } = event;
  const { commands } = global.client;

  let list = "📋 قائمة الأوامر:\n\n";
  const categories = {};

  for (const [name, cmd] of commands) {
    const cat = cmd.config.commandCategory || "عام";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(name);
  }

  for (const [cat, cmds] of Object.entries(categories)) {
    list += `[ ${cat} ]\n`;
    list += cmds.map(c => `• ${c}`).join("\n");
    list += "\n\n";
  }

  list += `📦 المجموع: ${commands.size} أمر`;

  api.sendMessage(list, threadID, messageID);
};
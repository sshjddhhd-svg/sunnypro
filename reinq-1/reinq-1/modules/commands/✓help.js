module.exports.config = {
  name: "اوامر",
  version: "3.0.0",
  hasPermssion: 0,
  credits: "انس",
  description: "عرض قائمة الاوامر",
  commandCategory: "نظام",
  usages: "[اسم الامر/رقم الصفحة]",
  cooldowns: 5
};

module.exports.run = function ({ api, event, args }) {
  const { commands } = global.client;
  const { threadID } = event;

  const threadSetting = global.data.threadData.get(parseInt(threadID)) || {};
  const prefix = threadSetting.PREFIX || global.config.PREFIX;

  // لو كتب اسم أمر
  if (args[0] && isNaN(args[0])) {
    const command = commands.get(args[0].toLowerCase());
    if (!command) {
      return api.sendMessage("الامر غير موجود", threadID);
    }

    let msg = `⍆ ㍿⏤͟͟͞͞ 👁️‍🗨️ 𝕭҉𝛐ȶ ꭖ↴☢️٭ꞌ Ꮯyp︩︪hꬴr 𖤌\n\n\n`;
    msg += `⌯ ‹ ${command.config.name} › ¦ ﹟ ${command.config.description}\n\n`;
    msg += `طريقة الاستخدام:\n${prefix}${command.config.name} ${command.config.usages || ""}`;

    return api.sendMessage(msg, threadID);
  }

  // نظام الصفحات
  const page = parseInt(args[0]) || 1;
  const numberOfOnePage = 10;
  const arrayInfo = [];

  for (let [name] of commands) {
    arrayInfo.push(name);
  }

  arrayInfo.sort();

  const totalPage = Math.ceil(arrayInfo.length / numberOfOnePage);
  const start = (page - 1) * numberOfOnePage;
  const end = start + numberOfOnePage;
  const list = arrayInfo.slice(start, end);

  let msg = `⍆ ㍿⏤͟͟͞͞ 👁️‍🗨️ 𝕭҉𝛐ȶ ꭖ↴☢️٭ꞌ Ꮯyp︩︪hꬴr 𖤌\n\n\n`;

  for (let name of list) {
    const command = commands.get(name);
    msg += `⌯ ‹ ${name} › ¦ ﹟ ${command.config.description}\n\n\n`;
  }

  msg += `صفحة ${page}/${totalPage}\n`;
  msg += `عدد الاوامر: ${arrayInfo.length}`;

  return api.sendMessage(msg, threadID);
};

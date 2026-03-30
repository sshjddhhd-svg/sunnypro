module.exports.config = {
  name: "ابتيم",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Mustapha",
  description: "عرض معلومات السيرفر",
  commandCategory: "النظام",
  usages: "ابتيم",
  cooldowns: 3
};

module.exports.run = async function ({ api, event }) {
  const os = require("os");
  const moment = require("moment-timezone");

  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
  const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);
  const usedMem = totalMem - freeMem;
  const memUsage = ((usedMem / totalMem) * 100).toFixed(0);

  const cpuModel = os.cpus()[0].model;
  const cpuCores = os.cpus().length;
  const osType = `${os.type()} ${os.release()}`;

  const rawMethod = global.loginMethod || "appstate";
  const loginLabel = rawMethod === "credentials" ? "📧 Credentials (Email/Password)" : "🍪 AppState (Cookies)";

  const bar = (percent) => {
    const filled = Math.round(percent / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${percent}%`;
  };

  const currentTime = (tz) => moment.tz(tz).format("HH:mm:ss");

  const message = [
    "┌─────────────────────────┐",
    "│   📊 بيانات السيرفر   │",
    "└─────────────────────────┘",
    "",
    `⏳ وقت التشغيل`,
    `   ${hours}س ${minutes}د ${seconds}ث`,
    "",
    `🔑 نظام الدخول: ${loginLabel}`,
    "",
    `🖥️ النظام: ${osType}`,
    `⚙️ المعالج: ${cpuModel}`,
    `🧠 الأنوية: ${cpuCores} نواة`,
    "",
    `💾 الرام: ${usedMem}MB / ${totalMem}MB`,
    `   ${bar(memUsage)}`,
    "",
    "🕰️ التوقيت:",
    `   🇪🇬 القاهرة:    ${currentTime("Africa/Cairo")}`,
    `   🇩🇿 الجزائر:    ${currentTime("Africa/Algiers")}`,
    `   🇲🇦 كازابلانكا: ${currentTime("Africa/Casablanca")}`,
    `   🇧🇾 غوميل:      ${currentTime("Europe/Minsk")}`
  ].join("\n");

  api.sendMessage(message, event.threadID, event.messageID);
};

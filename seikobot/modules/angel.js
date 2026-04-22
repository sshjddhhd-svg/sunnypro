if (!global.angelIntervals) global.angelIntervals = new Map();

module.exports.config = {
  name: "angel",
  version: "1.1.0",
  hasPermission: 2,
  credits: "Gemini",
  description: "Toggle sending 'hi' every 30 seconds for 1 hour",
  category: "admin",
  prefix: true,
  usages: "!angel [on/off]",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID } = event;
  const action = args[0]?.toLowerCase();

  // Admin Check
  const admins = global.config.ADMINBOT.map(String);
  if (!admins.includes(String(senderID))) {
    return api.sendMessage("❌ Admins only.", threadID);
  }

  // Handle "OFF"
  if (action === "off") {
    if (global.angelIntervals.has(threadID)) {
      clearInterval(global.angelIntervals.get(threadID));
      global.angelIntervals.delete(threadID);
      return api.sendMessage("⏹️ Angel Engine deactivated.", threadID);
    } else {
      return api.sendMessage("⚠️ Angel Engine is not running in this thread.", threadID);
    }
  }

  // Handle "ON"
  if (action === "on") {
    if (global.angelIntervals.has(threadID)) {
      return api.sendMessage("⚠️ Angel Engine is already running.", threadID);
    }

    let count = 0;
    const maxCycles = 9007199254740991; // 120 * 30s = 3600s (1 hour)

    api.sendMessage("Angel Engine is active ✅ (1 hour duration).", threadID);

    const interval = setInterval(() => {
      count++;
      
      if (count >= maxCycles) {
        clearInterval(interval);
        global.angelIntervals.delete(threadID);
        api.sendMessage("⏹️ Angel Engine finished its 1-hour cycle.", threadID);
      } else {
        api.sendMessage("𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ, 𝗫. 𖠄⃪͜͡🌪ـ, 𝗤. 𖤛⃪͜͡🌪ـ,", threadID);
      }
    }, 30 * 1000);

    global.angelIntervals.set(threadID, interval);
  } else {
    return api.sendMessage("Usage: !angel [on/off]", threadID);
  }
};

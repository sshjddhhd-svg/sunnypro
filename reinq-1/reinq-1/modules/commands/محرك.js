if (!global.engineIntervals) global.engineIntervals = new Map();

module.exports.config = {
  name: "محرك",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "Replit Agent",
  description: "يرسل رسالة كل 30 ثانية (تفعيل/ايقاف)",
  commandCategory: "نظام",
  prefix: true,
  usages: "[تفعيل/ايقاف]",
  cooldowns: 5
};

console.log("DEBUG: Loaded 'محرك' command config.");

module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID } = event;
  const action = args[0]?.toLowerCase();

  // Admin Check
  const admins = (global.config.ADMINBOT || []).map(String);
  if (!admins.includes(String(senderID))) {
    return api.sendMessage("❌ هذا الأمر مخصص لأدمن البوت فقط.", threadID);
  }

  // Handle "ايقاف" or "stop" or "off"
  if (action === "ايقاف" || action === "off" || action === "stop") {
    if (global.engineIntervals.has(threadID)) {
      clearInterval(global.engineIntervals.get(threadID));
      global.engineIntervals.delete(threadID);
      return api.sendMessage("⏹️ تم إيقاف المحرك في هذه المجموعة.", threadID);
    } else {
      return api.sendMessage("⚠️ المحرك ليس قيد التشغيل في هذه المجموعة.", threadID);
    }
  }

  // Handle "تفعيل" or "on" or "start"
  if (action === "تفعيل" || action === "on" || action === "start") {
    if (global.engineIntervals.has(threadID)) {
      return api.sendMessage("⚠️ المحرك قيد التشغيل بالفعل.", threadID);
    }

    api.sendMessage("🚀 تم تفعيل المحرك بنجاح (رسالة كل 30 ثانية).", threadID);

    const interval = setInterval(() => {
      api.sendMessage(`㷭 𝗦𝗔𝗜𝗡 𝚾 𝖱𝚵𝚸𝖫𝚼 㷭
          - 𝜣𝐒⃢𝐀-𝐈𝐍  𛀧 -
         ﹫𝗦𝖺𝗂𝗇 𝐗 𝗛𝖾𝗋𝗂𝗼𝗇

﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭' 𑩜 ⃢יּ ❄﹟𝗦 ៹࣪. َ ᳸🗞᳭'﹟𝗤 ៹࣪. َ ᳸☁᳭'﹟𝗦 ៹࣪. َ ᳸🗞᳭'


- ⋮≬ 𝄞  𝗦𝗔𝗜𝗡 𒀗

𖠆❉҉. ⋆ ࣪ 𝕬҉𝐍𝐆𝐄𝐋 𝕶𝐈𝐍𝐆.. ❞ 𝗛𝗘̲/𝗛𝗜𝗠.̲ ፡
⨾  ٛ  , 𝗦𝗣𝗜𝗗𝗘𝗥𝗦  ۬ ۬  ༐  𝗠𝗢𝗡𝗦𝗧𝗘𝗥𝗦
❞ 𝐀  𝐁  𝐘  𝐒  𝐒͟.̲ ፡   𓉚🪽𓉛      
 ➣  𝆺𝅥⃝𝗔𝗡𝗚𝗘𝗟 ۬༐ 𝗦҈𝗮𝗶𝗻 🇹🇻𒁂 
                    ⏤͟͟͞͞⚪                         
     𝗥𝗲𝘁𝘂𝗿𝗻 𝗼𝗳 𝘁𝗵𝗲 𝗗𝗲𝗮𝗱     
 ‌ ‌     ─⃝͎̽𝙎𖤐˖𝘼ɵ⃪𝆭͜͡X͎𝆭̽ʌ𝆭⃟ɴ𝙄🌪𝆺𝅥⃝𝙉✬

⋮ ➣ ‖ 𖣘 ‖〔 𐨿 𝐁𝐋𝐎𝐎𝐃 𝐎𝐅 𝐊𝐀𝐓𝐔𝐒𝐇𝐘𝐀
𒀱 𝚵  -ℙ- 〕► ☢️`, threadID);
    }, 60 * 1000);

    global.engineIntervals.set(threadID, interval);
  } else {
    return api.sendMessage("⚠️ الاستخدام: !محرك [تفعيل/ايقاف]", threadID);
  }
};

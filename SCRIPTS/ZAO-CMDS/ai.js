const axios = require("axios");

module.exports.config = {
  name: "زاو",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "نوت دفاين",
  description: "محادثة مع الذكاء الاصطناعي",
  commandCategory: "ذكاء اصطناعي",
  usages: "زاو [رسالتك]",
  cooldowns: 3
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.onLoad = () => {
  global.zaoHistory = global.zaoHistory || {};
};

const CF_ACCOUNT_ID = "c98f69d61f4d84f76ed1b601f1754c37";
const CF_API_TOKEN = "cfut_27I2LKbDCcLC3FyvaHvf1PO0v3Sh8er36AZPhDVAb2c30943";

const SYSTEM_PROMPT = `أنت عضو في المجموعة اسمك زاو، شخصيتك:
- تتكلم بشكل عفوي وطبيعي مثل أي شخص في المجموعة
- تستخدم لغة بسيطة وأحياناً عامية
- لديك روح دعابة خفيفة
- لست رسمياً ولا تبدأ ردودك بـ "بالطبع" أو "يسعدني مساعدتك"
- ترد بإيجاز ما لم يطلب منك التفصيل
- تتفاعل مع المواضيع بشكل طبيعي كأنك تشارك في نقاش`;

async function askAI(messages) {
  const res = await axios.post(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
  return res.data.result.response;
}

module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, messageID, senderID, body, messageReply } = event;

  if (!messageReply) return;
  if (!global.zaoHistory[senderID]) return;

  const session = global.zaoHistory[senderID];
  if (messageReply.messageID !== session.lastBotMessageID) return;
  if (!body || !body.trim()) return;

  session.history.push({ role: "user", content: body.trim() });

  try {
    const reply = await askAI(session.history);
    session.history.push({ role: "assistant", content: reply });

    api.sendMessage(reply, threadID, (err, info) => {
      if (!err) session.lastBotMessageID = info.messageID;
    }, messageID);

  } catch (e) {
    api.sendMessage("⚠️", threadID, messageID);
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;

  const userMsg = args.join(" ");
  if (!userMsg) return api.sendMessage("قول تا حاجة", threadID, messageID);

  if (!global.zaoHistory[senderID]) {
    global.zaoHistory[senderID] = { history: [], lastBotMessageID: null };
  }

  const session = global.zaoHistory[senderID];
  session.history.push({ role: "user", content: userMsg });

  try {
    const reply = await askAI(session.history);
    session.history.push({ role: "assistant", content: reply });

    api.sendMessage(reply, threadID, (err, info) => {
      if (!err) session.lastBotMessageID = info.messageID;
    }, messageID);

  } catch (e) {
    api.sendMessage("حديث خطأ اراس القلوة", threadID, messageID);
  }
};
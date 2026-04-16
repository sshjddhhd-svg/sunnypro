const fs = require("fs-extra");
const path = require("path");

const NICK_STATE_FILE = path.join(process.cwd(), "data", "nicknames-state.json");

function loadNickState() {
  try {
    fs.ensureDirSync(path.dirname(NICK_STATE_FILE));
    if (fs.existsSync(NICK_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(NICK_STATE_FILE, "utf8"));
    }
  } catch (_) {}
  return {};
}

function saveNickState() {
  try {
    fs.ensureDirSync(path.dirname(NICK_STATE_FILE));
    const state = {};
    for (const [tid, nickname] of Object.entries(global.nickPersist || {})) {
      state[tid] = nickname;
    }
    fs.writeFileSync(NICK_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (_) {}
}

module.exports.config = {
  name: "كنيات",
  version: "2.0.0",
  hasPermssion: 1,
  credits: "Gemini",
  description: "تغيير كنيات جميع أعضاء المجموعة بشكل متتابع",
  commandCategory: "إدارة المجموعة",
  usages: "تشغيل [الكنية] / ايقاف",
  cooldowns: 5
};

if (!global.nickSessions) global.nickSessions = new Map();
if (!global.nickPersist) global.nickPersist = {};

module.exports.onLoad = function ({ api }) {
  global.nickSessions = global.nickSessions || new Map();
  global.nickPersist = global.nickPersist || {};

  const saved = loadNickState();
  for (const [threadID, nickname] of Object.entries(saved)) {
    global.nickPersist[threadID] = nickname;
    if (!global.nickSessions.has(threadID)) {
      startNickSession(api, threadID, nickname);
    }
  }
};

function startNickSession(api, threadID, nickname) {
  const botApi = global._botApi || api;
  if (!botApi) return;

  botApi.getThreadInfo(threadID, (err, threadInfo) => {
    if (err || !threadInfo || !threadInfo.participantIDs) {
      delete global.nickPersist[threadID];
      saveNickState();
      return;
    }
    const participantIDs = threadInfo.participantIDs;
    let index = 0;

    const intervalId = setInterval(async () => {
      const currentApi = global._botApi || api;
      if (index >= participantIDs.length) {
        clearInterval(intervalId);
        global.nickSessions.delete(threadID);
        delete global.nickPersist[threadID];
        saveNickState();
        return;
      }
      const userID = participantIDs[index];
      try {
        await new Promise((resolve) => {
          currentApi.changeNickname(nickname, threadID, userID, (e) => resolve());
        });
      } catch (_) {}
      index++;
    }, 3000);

    global.nickSessions.set(threadID, intervalId);
  });
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const type = args[0];

  if (type === "ايقاف") {
    if (global.nickSessions.has(threadID)) {
      clearInterval(global.nickSessions.get(threadID));
      global.nickSessions.delete(threadID);
      delete global.nickPersist[threadID];
      saveNickState();
      return api.sendMessage("🛑 تم إيقاف عملية تغيير الكنيات بنجاح.", threadID, messageID);
    } else {
      return api.sendMessage("⚠️ لا توجد عملية تغيير كنيات جارية حالياً.", threadID, messageID);
    }
  }

  if (type === "تشغيل") {
    const nickname = args.slice(1).join(" ");

    if (!nickname) {
      return api.sendMessage("📌 الاستخدام: كنيات تشغيل [الكنية المطلوبة]", threadID, messageID);
    }

    if (global.nickSessions.has(threadID)) {
      return api.sendMessage("⚠️ هناك عملية جارية بالفعل في هذه المجموعة. أوقفها أولاً.", threadID, messageID);
    }

    try {
      const threadInfo = await api.getThreadInfo(threadID);
      const participantIDs = threadInfo.participantIDs;
      let index = 0;

      api.sendMessage(
        `🔄 جاري بدء تغيير كنيات ${participantIDs.length} عضو إلى "${nickname}"...\n⏱️ المعدل: عضو كل 3 ثوانٍ.`,
        threadID
      );

      global.nickPersist[threadID] = nickname;
      saveNickState();

      const intervalId = setInterval(async () => {
        const currentApi = global._botApi || api;
        if (index >= participantIDs.length) {
          currentApi.sendMessage("✅ اكتملت العملية: تم تغيير كنيات الجميع.", threadID);
          clearInterval(intervalId);
          global.nickSessions.delete(threadID);
          delete global.nickPersist[threadID];
          saveNickState();
          return;
        }
        const userID = participantIDs[index];
        try {
          await new Promise((resolve) => {
            currentApi.changeNickname(nickname, threadID, userID, () => resolve());
          });
        } catch (_) {}
        index++;
      }, 3000);

      global.nickSessions.set(threadID, intervalId);
    } catch (error) {
      console.error(error);
      return api.sendMessage("❌ حدث خطأ أثناء جلب بيانات الأعضاء.", threadID, messageID);
    }
  } else {
    return api.sendMessage("📌 الاستخدام:\n- كنيات تشغيل [الاسم]\n- كنيات ايقاف", threadID, messageID);
  }
};

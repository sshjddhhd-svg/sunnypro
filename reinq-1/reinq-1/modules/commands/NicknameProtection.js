module.exports.config = {
  name: "كنيات",
  version: "1.0.0",
  hasPermission: 2,
  credits: "عمر",
  description: "حماية كنيات المجموعة بتغييرها باستمرار",
  commandCategory: "نظام",
  usages: "[تشغيل/ايقاف] [الكنية]",
  cooldowns: 5
};

let nicknameIntervals = {};

module.exports.handleEvent = async function({ api, event }) {
  const { threadID, logMessageType, logMessageData } = event;
  if (!nicknameIntervals[threadID]) return;

  if (logMessageType === "log:subscribe:update-nickname" || logMessageType === "log:user-nickname") {
    const { nickname: newNickname } = logMessageData;
    const currentProtectedName = nicknameIntervals[threadID].protectedName;
    if (newNickname !== currentProtectedName) {
      try {
        await api.changeNickname(currentProtectedName, threadID, logMessageData.participant_id || event.author);
      } catch (e) {}
    }
  }
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID } = event;

  const botAdmins = [
    ...(global.config.ADMINBOT || []),
    ...(global.config.OPERATOR || []),
    ...(global.config.OWNER || [])
  ].map(String);

  if (!botAdmins.includes(String(senderID))) {
    return api.sendMessage("❌ هذا الأمر خاص بإدارة البوت فقط", threadID, messageID);
  }

  const action = args[0];
  const nickname = args.slice(1).join(" ");

  if (action === "تشغيل") {
    if (!nickname) return api.sendMessage("الرجاء إدخال الكنية المطلوبة بعد كلمة تشغيل.", threadID, messageID);
    if (nicknameIntervals[threadID]) return api.sendMessage("حماية الكنيات مفعلة بالفعل في هذه المجموعة.", threadID, messageID);

    api.sendMessage(`تم تفعيل حماية الكنيات! سأقوم بتغيير كنيات جميع الأعضاء إلى: ${nickname} باستمرار`, threadID);

    const protectNicknames = async () => {
      try {
        const threadInfo = await api.getThreadInfo(threadID);
        const { participantIDs } = threadInfo;
        for (let userID of participantIDs) {
          try {
            await api.changeNickname(nickname, threadID, userID);
          } catch (e) {}
        }
      } catch (e) {}
    };

    await protectNicknames(); // Run once immediately
    nicknameIntervals[threadID] = {
      interval: setInterval(protectNicknames, 5000),
      protectedName: nickname
    };
  } 
  else if (action === "ايقاف") {
    if (!nicknameIntervals[threadID]) return api.sendMessage("حماية الكنيات غير مفعلة حالياً.", threadID, messageID);

    clearInterval(nicknameIntervals[threadID].interval);
    delete nicknameIntervals[threadID];
    api.sendMessage("تم إيقاف حماية الكنيات بنجاح.", threadID, messageID);
  } 
  else {
    api.sendMessage("الاستخدام: كنيات [تشغيل/ايقاف] [الكنية]", threadID, messageID);
  }
};
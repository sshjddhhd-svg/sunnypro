const pendingThreadRequests = new Set();
const threadRequestCooldown = new Map();
const THREAD_COOLDOWN_MS = 30000;

module.exports = function ({ Users, Threads, Currencies }) {
  const logger = require("../../utils/log.js");
  return async function ({ event }) {
    const { allUserID, allCurrenciesID, allThreadID, userName, threadInfo } = global.data;
    const { autoCreateDB } = global.config;
    if (autoCreateDB == false) return;
    var { senderID, threadID } = event;
    senderID = String(senderID);
    threadID = String(threadID);
    try {
      if (!allThreadID.includes(threadID) && event.isGroup == true) {
        const now = Date.now();
        const lastRequest = threadRequestCooldown.get(threadID) || 0;
        if (pendingThreadRequests.has(threadID) || (now - lastRequest < THREAD_COOLDOWN_MS)) return;

        pendingThreadRequests.add(threadID);
        threadRequestCooldown.set(threadID, now);
        allThreadID.push(threadID);

        try {
          const threadIn4 = await Threads.getInfo(threadID);
          const setting = {};
          setting.threadName = threadIn4.threadName;
          setting.adminIDs = threadIn4.adminIDs;
          setting.nicknames = threadIn4.nicknames;
          const dataThread = setting;
          threadInfo.set(threadID, dataThread);
          const setting2 = {};
          setting2.threadInfo = dataThread;
          setting2.data = {};
          await Threads.setData(threadID, setting2);
          for (const singleData of threadIn4.userInfo) {
            userName.set(String(singleData.id), singleData.name);
            try {
              if (global.data.allUserID.includes(String(singleData.id))) {
                await Users.setData(String(singleData.id), { name: singleData.name });
              } else {
                await Users.createData(singleData.id, { name: singleData.name, data: {} });
                global.data.allUserID.push(String(singleData.id));
                logger(global.getText('handleCreateDatabase', 'newUser', singleData.id), '[ DATABASE ]');
              }
            } catch (e) { console.log(e); }
          }
          logger(global.getText('handleCreateDatabase', 'newThread', threadID), '[ DATABASE ]');
        } catch (err) {
          allThreadID.splice(allThreadID.indexOf(threadID), 1);
          threadRequestCooldown.delete(threadID);
          console.log('[DB] خطأ في جلب معلومات المجموعة:', err.message || err);
        } finally {
          pendingThreadRequests.delete(threadID);
        }
      }

      if (!allUserID.includes(senderID)) {
        // Genuinely new user: push to cache FIRST so concurrent messages don't
        // trigger another createData before the first one completes.
        allUserID.push(senderID);
        try {
          const infoUsers = await Users.getInfo(senderID);
          await Users.createData(senderID, { name: infoUsers.name, data: {} });
          userName.set(senderID, infoUsers.name);
          logger(global.getText('handleCreateDatabase', 'newUser', senderID), '[ DATABASE ]');
        } catch (e) {}
      } else if (!userName.has(senderID)) {
        // User exists in DB but name is absent from the in-memory cache
        // (e.g. partial startup load). Fetch and cache the name only —
        // calling createData here would hit a unique-constraint failure every
        // single message and silently loop forever.
        try {
          const infoUsers = await Users.getInfo(senderID);
          userName.set(senderID, infoUsers.name);
          await Users.setData(senderID, { name: infoUsers.name });
        } catch (e) {}
      }

      if (!allCurrenciesID.includes(senderID)) {
        try {
          const setting4 = {};
          setting4.data = {};
          await Currencies.createData(senderID, setting4);
          allCurrenciesID.push(senderID);
        } catch (e) {}
      }
      return;
    } catch (err) {
      return console.log(err);
    }
  };
};

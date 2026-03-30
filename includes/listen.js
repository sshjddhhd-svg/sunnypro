const fs = require("fs-extra");
const path = require("path");
const Messages = global.funcs.message;
module.exports = function({ api, models, globalData, usersData, threadsData }) {

        const Users = require("./controllers/users")({ models, api }),
                                Threads = require("./controllers/threads")({ models, api }),
                                Currencies = require("./controllers/currencies")({ models });
        const logger = require("../utils/log.js");
  const chalk = require("chalk");
   const cv = chalk.bold.hex("#1390f0");
   const gradient = require("gradient-string")
   const redToGreen = gradient("red", "cyan");
   
   // Pre-load all handlers outside event listener for performance
   const handleCommand = require("./handle/handleCommand");
   const handleCommandEvent = require("./handle/handleCommandEvent");
   const handleReply = require("./handle/handleReply");
   const handleReaction = require("./handle/handleReaction");
   const handleEvent = require("./handle/handleEvent");
   const handleCreateDatabase = require("./handle/handleCreateDatabase");

   // Auto cleanup setup
  const cacheDirectory = __dirname + '/../SCRIPTS/ZAO-CMDS/cache';
  const autoClean = [".jpg", ".gif", ".mp4", ".mp3", ".png", ".m4a"];

  const clean = async () => {
    try {
      const files = await fs.promises.readdir(cacheDirectory);
      for (const exit of autoClean) {
        for (const file of files) {
          if (file.includes(exit)) {
            try {
              await fs.promises.unlink(path.join(cacheDirectory, file));
            } catch (e) {
              // Silent fail for individual files
            }
          }
        }
      }
    } catch (err) {
      // Silent fail for cleanup
    }
  };
  setInterval(clean, 60000);
  
        
  
(async function () {
 try {
    
        let threads = await Threads.getAll(),
            users = await Users.getAll(['userID', 'name', 'data']),
            currencies = await Currencies.getAll(['userID']);
        for (const data of threads) {
            const idThread = String(data.threadID);
            global.data.allThreadID.push(idThread), 
            global.data.threadData.set(idThread, data['data'] || {}), 
            global.data.threadInfo.set(idThread, data.threadInfo || {});
            if (data['data'] && data['data']['banned'] == !![]) 
                global.data.threadBanned.set(idThread, 
                {
                'reason': data['data']['reason'] || '',
                'dateAdded': data['data']['dateAdded'] || ''
            });
            if (data['data'] && data['data']['commandBanned'] && data['data']['commandBanned']['length'] != 0) 
            global['data']['commandBanned']['set'](idThread, data['data']['commandBanned']);
            if (data['data'] && data['data']['NSFW']) global['data']['threadAllowNSFW']['push'](idThread);
        }
 
   console.log(cv(`\n` + `●─𝗭𝗔𝗢 𝗙𝗔𝗡─●`));

   logger.log([
     {
       message: "[ 𝗦𝗔𝗜𝗠 ]: ",
        color: ["red", "cyan"],
     },
     {
       message: ` 𝗬𝗢𝗨𝗡𝗚 𝗠𝗥 `,
       color: "white",
     },
   ]);
    console.log(redToGreen("━".repeat(50), { interpolation: "hsv" }));
        for (const dataU of users) {
            const idUsers = String(dataU['userID']);
            global.data['allUserID']['push'](idUsers);
            if (dataU.name && dataU.name['length'] != 0) global.data.userName['set'](idUsers, dataU.name);
            if (dataU.data && dataU.data.banned == 1) global.data['userBanned']['set'](idUsers, {
                'reason': dataU['data']['reason'] || '',
                'dateAdded': dataU['data']['dateAdded'] || ''
            });
            if (dataU['data'] && dataU.data['commandBanned'] && dataU['data']['commandBanned']['length'] != 0) 
            global['data']['commandBanned']['set'](idUsers, dataU['data']['commandBanned']);
        }
        for (const dataC of currencies) global.data.allCurrenciesID.push(String(dataC['userID']));
       
    } catch (error) {
        return  logger.log([
     {
       message: "[ DATABASE ]: ",
       color: ["red", "cyan"],
     },
     {
       message: `Error in LIsen Enviroment : ${error} `,
       color: "white",
     },
   ]);
    }
}());
  console.log(redToGreen("━".repeat(50), { interpolation: "hsv" }));
  console.log(cv(`\n` + `──LOADING LISTENER─●`));

  logger.log([
    {
      message: "[ LISTENER ]: ",
       color: ["red", "cyan"],
    },
    {
      message: `${api.getCurrentUserID()} - [ ZAO BOT ] `,
      color: "white",
    },
  ]);




        
        return (event) => {
  // Raw entry-point trace — catches everything before any processing
  try {
    const _sid = String(event.senderID || "?");
    const _tid = String(event.threadID || "?");
    const _isDM = !event.isGroup && _sid === _tid;
    if (_isDM || event.type === "message" || event.type === "message_reply") {
      console.log(
        chalk.bold.hex("#ff9900")("[RAW] ") +
        chalk.hex("#cccccc")(`type=${event.type} isGroup=${event.isGroup} senderID=${_sid} threadID=${_tid}`)
      );
    }
  } catch (_) {}

  // ── WhiteList enforcement ────────────────────────────────────
  // If enabled, silently drop events from non-whitelisted users/threads.
  try {
    const wlu = global.config.whiteListMode || {};
    const wlt = global.config.whiteListModeThread || {};
    const senderStr = String(event.senderID || "");
    const threadStr = String(event.threadID  || "");
    const adminIDs  = (global.config.ADMINBOT || []).map(String);

    if (wlu.enable && Array.isArray(wlu.whiteListIds) && wlu.whiteListIds.length > 0) {
      if (!adminIDs.includes(senderStr) && !wlu.whiteListIds.map(String).includes(senderStr)) return;
    }
    if (wlt.enable && Array.isArray(wlt.whiteListThreadIds) && wlt.whiteListThreadIds.length > 0) {
      if (!wlt.whiteListThreadIds.map(String).includes(threadStr)) return;
    }
  } catch (_) {}

  try {
    const message = Messages(api, event);
    const handlers = {
      command: handleCommand({ api, models, Users, Threads, Currencies, globalData, usersData, threadsData, message }),
      commandEvent: handleCommandEvent({ api, models, Users, Threads, Currencies, globalData, usersData, threadsData, message }),
      reply: handleReply({ api, models, Users, Threads, Currencies, globalData, usersData, threadsData, message }),
      reaction: handleReaction({ api, models, Users, Threads, Currencies, globalData, usersData, threadsData, message }),
      event: handleEvent({ api, models, Users, Threads, Currencies, globalData, usersData, threadsData, message }),
      database: handleCreateDatabase({ api, Threads, Users, Currencies, models, globalData, usersData, threadsData })
    };
    
    switch (event.type) {
      case "message":
      case "message_reply":
      case "message_unsend": {
        try {
          const senderID  = String(event.senderID);
          const threadID  = String(event.threadID);
          const isGroup   = event.isGroup === true || threadID !== senderID;
          const isAdmin   = (global.config.ADMINBOT || []).map(String).includes(senderID);
          const senderName = global.data.userName.get(senderID) || `User[${senderID}]`;
          const source    = isGroup ? `GROUP[${threadID}]` : `DM[${senderID}]`;
          const msgText   = event.body || "(no text / attachment)";
          const adminTag  = isAdmin ? chalk.bold.hex("#ff4444")(" [BOT ADMIN]") : "";

          console.log(
            chalk.bold.hex("#00ccff")("[MSG] ") +
            chalk.hex("#aaaaaa")(source + " | ") +
            chalk.bold.hex(isAdmin ? "#ff7777" : "#aaffaa")(senderName + " (" + senderID + ")") +
            adminTag +
            chalk.hex("#ffffff")(": " + msgText)
          );
        } catch (_) {}

        try {
          handlers.database({ event });
          handlers.command({ event });
          handlers.reply({ event });
          handlers.commandEvent({ event });
        } catch (err) {
          logger.log([{ message: "[ HANDLER ERROR ]: ", color: ["red", "cyan"] }, { message: err.message, color: "white" }]);
        }
        break;
      }
      case "event":
        try {
          handlers.event({ event });
        } catch (err) {
          logger.log([{ message: "[ EVENT ERROR ]: ", color: ["red", "cyan"] }, { message: err.message, color: "white" }]);
        }
        break;
      case "message_reaction":
        try {
          handlers.reaction({ event });
          if (event.reaction === "🖤") {
            api.setMessageReaction("🖤", event.messageID, () => {}, true);
          }
          if (event.reaction === "😂") {
            api.setMessageReaction("😂", event.messageID, () => {}, true);
          }
          if (event.reaction === "😠" && event.senderID === api.getCurrentUserID()) {
            api.unsendMessage(event.messageID);
          }

          // ── React-Unsend system ──────────────────────────────────
          // Admin (or any user if onlyAdmin=false) reacts with a
          // configured emoji → bot unsends that message.
          try {
            const reactCfg = global.config.reactUnsend || {};
            if (reactCfg.enable) {
              const adminIDs = (global.config.ADMINBOT || []).map(String);
              const reactor  = String(event.userID || event.senderID || "");
              const isAdmin  = adminIDs.includes(reactor);
              const emojis   = Array.isArray(reactCfg.emojis)
                ? reactCfg.emojis
                : ["😡", "🤬"];
              if (emojis.includes(event.reaction) && (!reactCfg.onlyAdmin || isAdmin)) {
                api.unsendMessage(event.messageID, (err) => {
                  if (err) logger.log([
                    { message: "[ REACT-UNSEND ]: ", color: ["red", "cyan"] },
                    { message: `Failed to unsend message: ${err.message || err}`, color: "white" }
                  ]);
                });
              }
            }
          } catch (_) {}
        } catch (err) {
          logger.log([{ message: "[ REACTION ERROR ]: ", color: ["red", "cyan"] }, { message: err.message, color: "white" }]);
        }
        break;
      default:
        break;
    }
  } catch (err) {
    logger.log([{ message: "[ EVENT LOOP ERROR ]: ", color: ["red", "cyan"] }, { message: err.message, color: "white" }]);
  }
        };
};



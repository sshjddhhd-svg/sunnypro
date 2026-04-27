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
   const handleRefresh = require("./handle/handleRefresh");

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

  // Initialize stealth engine globally so commands can access it
  try {
    const { globalStealthEngine } = require('./stealthEngine');
    global._stealthEngine = globalStealthEngine;
  } catch (_) {}

  // ── Shared context object passed to all handler factories ────
  // message is event-specific so it is NOT included here; each factory's
  // inner function now accepts { event, message } and uses the per-event value.
  const handlerCtx = { api, models, Users, Threads, Currencies, globalData, usersData, threadsData };

  // ── Pre-build handler functions ONCE per listen session ──────
  // Factories (require calls, Object.create wrapping, closure setup) run here
  // exactly once instead of on every incoming event.
  const storedDatabase     = handleCreateDatabase(handlerCtx);
  const storedCommand      = handleCommand(handlerCtx);
  const storedReply        = handleReply(handlerCtx);
  const storedCommandEvent = handleCommandEvent(handlerCtx);
  const storedEvent        = handleEvent(handlerCtx);
  const storedReaction     = handleReaction(handlerCtx);
  const storedRefresh      = handleRefresh(handlerCtx);

  // ── Cooldown map + callback array cleanup — runs every 30 minutes ──
  // Prevents unbounded memory growth as more users interact over time.
  setInterval(() => {
    // 1. Trim cooldown timestamps older than 1 hour
    try {
      const { cooldowns } = global.client;
      if (cooldowns) {
        const now = Date.now();
        for (const [cmdName, timestamps] of cooldowns.entries()) {
          for (const [userID, ts] of timestamps.entries()) {
            if (now - ts > 60 * 60 * 1000) timestamps.delete(userID);
          }
          if (timestamps.size === 0) cooldowns.delete(cmdName);
        }
      }
    } catch (_) {}

    // 2. Cap handleReply / handleReaction arrays at 200 entries each.
    // Entries older than the cap are silently dropped (the user never replied).
    // After this fix, entries are removed on execution, so overflow only
    // happens when many users start interactions and never complete them.
    try {
      const MAX_CALLBACKS = 200;
      const { handleReply, handleReaction } = global.client;
      if (Array.isArray(handleReply) && handleReply.length > MAX_CALLBACKS) {
        const pruned = handleReply.length - MAX_CALLBACKS;
        handleReply.splice(0, pruned);
        console.log(`[CLEANUP] Pruned ${pruned} stale handleReply entries.`);
      }
      if (Array.isArray(handleReaction) && handleReaction.length > MAX_CALLBACKS) {
        const pruned = handleReaction.length - MAX_CALLBACKS;
        handleReaction.splice(0, pruned);
        console.log(`[CLEANUP] Pruned ${pruned} stale handleReaction entries.`);
      }
    } catch (_) {}
  }, 30 * 60 * 1000);

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
    // Create per-event message helper; pre-built handler fns receive it as a
    // second argument so factories don't need to be re-called every message.
    const message = Messages(api, event);

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

        ;(async () => {
          try {
            if (global._stealthEngine) {
              await global._stealthEngine.handleIncoming(String(event.threadID || ''));
            }
          } catch (_) {}
          try {
            storedDatabase({ event });
            storedCommand({ event, message });
            storedReply({ event, message });
            storedCommandEvent({ event, message });
          } catch (err) {
            const errMsg = (err && err.message) ? err.message : String(err);
            logger.log([{ message: "[ HANDLER ERROR ]: ", color: ["red", "cyan"] }, { message: errMsg, color: "white" }]);
          }
        })();
        break;
      }
      case "event":
        try {
          storedEvent({ event, message });
          // Refresh cached threadInfo so admin/name/member changes don't go stale.
          // Fire-and-forget — never blocks event dispatch and swallows its own errors.
          try { storedRefresh({ event }); } catch (_) {}
        } catch (err) {
          const errMsg = (err && err.message) ? err.message : String(err);
          logger.log([{ message: "[ EVENT ERROR ]: ", color: ["red", "cyan"] }, { message: errMsg, color: "white" }]);
        }
        break;
      case "message_reaction":
        try {
          storedReaction({ event, message });
          // [FIX Djamel] — Mirror-reactions disabled by default. They were
          // the #1 ban-vector: every incoming 🖤/😂 caused the bot to fire
          // a setMessageReaction call, and if a sister bot was in the same
          // thread the two would echo each other forever (= flagged as
          // automated within minutes). Now opt-in via stealthMode.mirrorReactions
          // and we always skip our OWN reactions to avoid self-loops.
          try {
            const stealth   = global.config?.stealthMode || {};
            const reactorID = String(event.userID || event.senderID || "");
            const botID     = (() => { try { return String(api.getCurrentUserID()); } catch (_) { return ""; } })();
            const isSelf    = botID && reactorID === botID;
            if (stealth.mirrorReactions === true && !isSelf) {
              if (event.reaction === "🖤") api.setMessageReaction("🖤", event.messageID, () => {}, true);
              if (event.reaction === "😂") api.setMessageReaction("😂", event.messageID, () => {}, true);
            }
          } catch (_) {}
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
          const errMsg = (err && err.message) ? err.message : String(err);
          logger.log([{ message: "[ REACTION ERROR ]: ", color: ["red", "cyan"] }, { message: errMsg, color: "white" }]);
        }
        break;
      default:
        break;
    }
  } catch (err) {
    const errMsg = (err && err.message) ? err.message : String(err);
    logger.log([{ message: "[ EVENT LOOP ERROR ]: ", color: ["red", "cyan"] }, { message: errMsg, color: "white" }]);
  }
        };
};



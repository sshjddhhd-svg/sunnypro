/**
 * handleCommand.js
 * Parses incoming messages and dispatches to registered commands.
 *
 * @debugger Djamel — Fixed undefined senderID/threadID crash before toString(),
 *   guarded commandCategory against undefined, fixed lockBot check order.
 */

module.exports = function ({ api, models, Users, Threads, Currencies, globalData, usersData, threadsData ,message }) {
  const humanTyping = (() => { try { return require("../humanTyping"); } catch (_) { return null; } })();
  const stringSimilarity = require("string-similarity"),
    escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    logger = require("../../utils/log.js");
  const chalk = require("chalk");
  const moment = require("moment-timezone");
  
 return async function ({ event, message: _message }) {
    const message = _message;
    const dateNow = Date.now();
    const time = moment.tz("Asia/Manila").format("HH:mm:ss DD/MM/YYYY");
    const { allowInbox, PREFIX, ADMINBOT, DeveloperMode, adminOnly } =
      global.config;

    const { userBanned, threadBanned, threadInfo, threadData, commandBanned } =
      global.data;
    const { commands, cooldowns } = global.client;
    
    var { body, senderID, threadID, messageID } = event;

    // ── [FIX Djamel] — Guard undefined IDs before ANY toString call ──
    if (!senderID || !threadID) return;

    // ── فحص قفل البوت ──────────────────────────────────────
    if (global.lockBot === true && !ADMINBOT.includes(String(senderID))) return;
    // ────────────────────────────────────────────────────────

    var senderID = String(senderID),
      threadID = String(threadID);

    // Drop messages with no text (attachments, stickers, etc.)
    if (!body || !body.trim()) return;

    const isDM = senderID === threadID;
    const threadSetting = threadData.get(threadID) || {};
    const activePrefix = threadSetting.hasOwnProperty("PREFIX")
      ? threadSetting.PREFIX
      : PREFIX;

    // In DMs no prefix is required — match prefix OR bare command
    const prefixRegex = isDM
      ? new RegExp(`^(<@!?${senderID}>|${escapeRegex(activePrefix)}|)`, "i")
      : new RegExp(`^(<@!?${senderID}>|${escapeRegex(activePrefix)})`);

    if (!isDM && !prefixRegex.test(body)) return;

    if (
      userBanned.has(senderID) ||
      threadBanned.has(threadID) ||
      (allowInbox === false && isDM)
    ) {
    

        
      if (!ADMINBOT.includes(senderID.toString())) {
        if (userBanned.has(senderID)) {
          const { reason, dateAdded } = userBanned.get(senderID) || {};
          return api.sendMessage(
            global.getText("handleCommand", "userBanned", reason, dateAdded),
            threadID,
            async (err, info) => {
              if (err || !info) return;
              await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
              return api.unsendMessage(info.messageID);
            },
            messageID
          );
        } else {
          if (threadBanned.has(threadID)) {
            const { reason, dateAdded } = threadBanned.get(threadID) || {};
            return api.sendMessage(
              global.getText(
                "handleCommand",
                "threadBanned",
                reason,
                dateAdded
              ),
              threadID,
              async (err, info) => {
                if (err || !info) return;
                await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
                return api.unsendMessage(info.messageID);
              },
              messageID
            );
          }
        }
      }
    }

    
    const [matchedPrefix] = body.match(prefixRegex),
      args = body.slice(matchedPrefix.length).trim().split(/ +/);
    var commandName = args.shift();
    if (!commandName) return;
    // Lowercase only for ASCII — preserve Arabic/non-Latin characters
    commandName = commandName.replace(/[a-zA-Z]/g, c => c.toLowerCase());
    var command = commands.get(commandName);
    if (!command) {
      var allCommandName = [];
      const commandValues = commands["keys"]();
      for (const cmd of commandValues) allCommandName.push(cmd);
      if (allCommandName.length === 0) return;
      const checker = stringSimilarity.findBestMatch(
        commandName,
        allCommandName
      );
      if (checker.bestMatch.rating >= 0.8)
        command = global.client.commands.get(checker.bestMatch.target);
      else
        return;
    }
  
    if (commandBanned.get(threadID) || commandBanned.get(senderID)) {
      if (!ADMINBOT.includes(senderID)) {
        const banThreads = commandBanned.get(threadID) || [],
          banUsers = commandBanned.get(senderID) || [];
        if (banThreads.includes(command.config.name))
          return api.sendMessage(
            global.getText(
              "handleCommand",
              "commandThreadBanned",
              command.config.name
            ),
            threadID,
            async (err, info) => {
              if (err || !info) return;
              await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
              return api.unsendMessage(info.messageID);
            },
            messageID
          );
        if (banUsers.includes(command.config.name))
          return api.sendMessage(
            global.getText(
              "handleCommand",
              "commandUserBanned",
              command.config.name
            ),
            threadID,
            async (err, info) => {
              if (err || !info) return;
              await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
              return api.unsendMessage(info.messageID);
            },
            messageID
          );
      }
    }
    // [FIX Djamel] — guard commandCategory: some commands omit it, causing crash
    if (
      (command.config.commandCategory || "").toLowerCase() == "nsfw" &&
      !global.data.threadAllowNSFW.includes(threadID) &&
      !ADMINBOT.includes(senderID)
    )
      return api.sendMessage(
        global.getText("handleCommand", "threadNotAllowNSFW"),
        threadID,
        async (err, info) => {
          if (err || !info) return;
          await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
          return api.unsendMessage(info.messageID);
        },
        messageID
      );
    var threadInfo2;
    try {
      threadInfo2 = threadInfo.get(threadID) || (await Threads.getInfo(threadID));
      if (!threadInfo2 || Object.keys(threadInfo2).length == 0) threadInfo2 = null;
    } catch (err) {
      threadInfo2 = null;
    }
    var permssion = 0;
    const adminIDs = (threadInfo2 && Array.isArray(threadInfo2.adminIDs)) ? threadInfo2.adminIDs : [];
    const find = adminIDs.find((el) => el.id == senderID);
    if (ADMINBOT.includes(senderID.toString())) permssion = 2;
    else if (!ADMINBOT.includes(senderID) && find) permssion = 1;
    if (command.config.hasPermssion > permssion)
      return api.sendMessage(
        global.getText(
          "handleCommand",
          "permssionNotEnough",
          command.config.name
        ),
        event.threadID,
        event.messageID
      );
    if (!client.cooldowns.has(command.config.name))
      client.cooldowns.set(command.config.name, new Map());
    const timestamps = client.cooldowns.get(command.config.name);
    const expirationTime = (command.config.cooldowns || 1) * 1000;
    if (
      timestamps.has(senderID) &&
      dateNow < timestamps.get(senderID) + expirationTime
    )
      return api.setMessageReaction(
        "😼",
        event.messageID,
        (err) =>
          err
            ? logger("حدث خطأ أثناء تنفيذ setMessageReaction", "warn")
            : "",
        !![]
      );
    var getText2;
    if (
      command.languages &&
      typeof command.languages == "object" &&
      command.languages.hasOwnProperty(global.config.language)
    )
      getText2 = (...values) => {
        var lang = command.languages[global.config.language][values[0]] || "";
        for (var i = values.length; i > 0; i--) {
          lang = lang.replace(new RegExp("%" + i, "g"), values[i]);
        }
        return lang;
      };
    else getText2 = () => {};
    try {
      const Obj = {};

      // ── Wrap api.sendMessage: log + humanTyping ───────────────
      const _origSend = api.sendMessage.bind(api);
      const _loggingApi = Object.assign(Object.create(api), {
        sendMessage: async function (msg, tid, ...rest) {
          try {
            const preview = typeof msg === "string"
              ? msg
              : (msg && msg.body ? msg.body : JSON.stringify(msg));
            console.log(
              chalk.bold.hex("#ffaa00")("[CMD REPLY] ") +
              chalk.hex("#aaaaaa")("[" + commandName + "] → ") +
              chalk.hex("#ffffff")(preview.slice(0, 300))
            );
          } catch (_) {}
          if (!api.__nkxModernized && humanTyping) {
            const delay = humanTyping.calcDelay(msg);
            if (delay > 0) await humanTyping.simulateTyping(api, tid || threadID, delay);
          }
          return _origSend(msg, tid, ...rest);
        }
      });

      // ── Log the detected command ─────────────────────────────
      console.log(
        chalk.bold.hex("#ff66ff")("[CMD] ") +
        chalk.hex("#aaaaaa")("by " + (global.data.userName.get(senderID) || senderID)) +
        (global.config.ADMINBOT && global.config.ADMINBOT.map(String).includes(senderID)
          ? chalk.bold.hex("#ff4444")(" [BOT ADMIN]") : "") +
        chalk.hex("#ffffff")(" → ") +
        chalk.bold.hex("#ffff00")(commandName) +
        (args.length ? chalk.hex("#cccccc")(" " + args.join(" ")) : "")
      );

      Obj.api = _loggingApi;
      Obj.event = event;
      Obj.args = args;
      Obj.models = models;
      Obj.usersData = usersData;
      Obj.threadsData = threadsData;
      Obj.globalData = globalData;
      Obj.Users = Users;
      Obj.message = message;
      Obj.Threads = Threads;
      Obj.Currencies = Currencies;
      Obj.permssion = permssion;
      Obj.getText = getText2;
      const runResult = command.run(Obj);
      if (runResult && typeof runResult.catch === 'function') {
        runResult.catch(e => {
          logger.log([
            { message: '[ CMD-PROMISE ]: ', color: ['red', 'cyan'] },
            { message: `Unhandled rejection in command "${commandName}": ${e && e.message ? e.message : String(e)}`, color: 'white' }
          ]);
        });
      }
      timestamps.set(senderID, dateNow);
      if (DeveloperMode == !![])
        logger(
          global.getText(
            "handleCommand",
            "executeCommand",
            time,
            commandName,
            senderID,
            threadID,
            args.join(" "),
            Date.now() - dateNow
          ),
          "[ DEV MODE ]"
        );
      return;
    } catch (e) {
      return api.sendMessage(
        global.getText("handleCommand", "commandError", commandName, e),
        threadID
      );
    }
  };
};

/**
 * Deobfuscated listen.js  —  includes/listen.js
 *
 * This is the central message-routing hub for the SAIKO bot.
 * It is exported as a factory function that receives { api, models }
 * and returns an async message handler that is passed to api.listenMqtt().
 *
 * Responsibilities:
 *  1. Load all thread & user data from the database into global state.
 *  2. Start a recurring "scheduled notification" interval (every 10 min)
 *     that delivers any queued / time-triggered messages.
 *  3. Return the listener callback that routes every incoming event to
 *     the correct handler module.
 */

const moment  = require('moment-timezone');
const axios   = require('axios');
const fs      = require('fs-extra');
const logger  = require('../utils/log.js');

// Sub-handler factories (each must be initialized with { api, models, Users, Threads, Currencies })
const handleCommandFactory      = require('./handle/handleCommand');
const handleCommandEventFactory = require('./handle/handleCommandEvent');
const handleEventFactory        = require('./handle/handleEvent');
const handleReplyFactory        = require('./handle/handleReply');
const handleReactionFactory     = require('./handle/handleReaction');
const handleRefreshFactory      = require('./handle/handleRefresh');
const handleNotification        = require('./handle/handleNotification.js');

// Database controllers (factories — must be initialized with { models, api })
const UserController     = require('./controllers/users');
const ThreadController   = require('./controllers/threads');
const CurrencyController = require('./controllers/currencies');

// Path to the scheduled-message data file
const DATLICH_PATH = __dirname + '/../modules/commands/cache/data/datlich.json';

module.exports = function ({ api, models }) {

  // ─── Initialize controllers ─────────────────────────────────────────────────
  const Users      = UserController({ models, api });
  const Threads    = ThreadController({ models, api });
  const Currencies = CurrencyController({ models });

  // ─── Initialize all handler functions ────────────────────────────────────────
  const handlerCtx = { api, models, Users, Threads, Currencies };
  const runCommand      = handleCommandFactory(handlerCtx);
  const runCommandEvent = handleCommandEventFactory(handlerCtx);
  const runEvent        = handleEventFactory(handlerCtx);
  const runReply        = handleReplyFactory(handlerCtx);
  const runReaction     = handleReactionFactory(handlerCtx);
  const runRefresh      = handleRefreshFactory(handlerCtx);

  // Start keepalive and initial notification check (runs once at startup)
  try { handleNotification({ api }); } catch (e) { logger('handleNotification init error: ' + e.message, 'WARN'); }

  // ─── 1. Bootstrap global data from DB ──────────────────────────────────────

  (async function loadEnvironment() {
    try {
      logger('startLoadEnvironment', '[ NINO ]');

      // ── Threads ──────────────────────────────────────────────────────────
      const allThreads = await Threads.getAll();

      for (const thread of allThreads) {
        global.data.threadInfo.set(thread.threadID, thread);
        global.data.threadData.set(thread.threadID, thread.data || {});

        if (!global.data.allThreadID.includes(thread.threadID))
          global.data.allThreadID.push(thread.threadID);

        if (thread.banned)
          global.data.threadBanned.set(thread.threadID, { reason: thread.reason });

        if (thread.data?.NSFW)
          global.data.threadAllowNSFW.push(thread.threadID);
      }

      logger('loadedEnvironmentThread', '[ NINO ]');

      // ── Users / Currencies ───────────────────────────────────────────────
      const allCurrencies = await Currencies.getAll();

      for (const user of allCurrencies) {
        global.data.userName.set(user.userID, user.name);

        if (!global.data.allUserID.includes(user.userID))
          global.data.allUserID.push(user.userID);

        if (!global.data.allCurrenciesID.includes(user.userID))
          global.data.allCurrenciesID.push(user.userID);

        if (user.banned)
          global.data.userBanned.set(user.userID, { reason: user.reason });
      }

      logger('successLoadEnvironment', '[ NINO ]');

    } catch (err) {
      logger('failLoadEnvironment', '[ NINO ]');
      console.log(err);
    }
  })();

  // ─── 2. Scheduled-message interval (every 10 minutes) ──────────────────────

  /**
   * Converts a "DD/MM/YYYY HH:mm:ss" date-string (split on '_' then '/' and ':')
   * into a Unix timestamp in milliseconds relative to the epoch-like reference.
   * Used to determine whether a queued event is "due".
   */
  function parseDateToMs(dateParts, callback) {
    // dateParts = [day, month, year, hour, minute, second]
    const MONTHS = { 1:31, 2:28, 3:31, 4:30, 5:31, 6:30, 7:31, 8:31, 9:30, 10:31, 11:30, 12:31 };

    if (dateParts[0] > MONTHS[dateParts[1]] || dateParts[0] < 1)
      return callback('Ngày của bạn có vẻ không hợp lệ');
    if (dateParts[2] < 2022)
      return callback('Bạn sống ở kỷ nguyên nào thế');
    if (dateParts[3] > 23 || dateParts[3] < 0)
      return callback('Giờ của bạn có vẻ không hợp lệ');
    if (dateParts[4] > 59 || dateParts[4] < 0)
      return callback('Phút của bạn có vẻ không hợp lệ');
    if (dateParts[5] > 59 || dateParts[5] < 0)
      return callback('Giây của bạn có vẻ không hợp lệ');

    const yr = dateParts[2] - 1970;

    let yearToMS = (yr * 365 * 24 * 60 * 60) * 1000;
    yearToMS    += (Math.floor(yr / 2 / 4).toFixed(0) * 24 * 60 * 60) * 1000;

    let monthToMS = 0;
    for (let m = 1; m < dateParts[1]; m++) monthToMS += MONTHS[m];
    if (dateParts[2] % 4 === 0) monthToMS += (24 * 60) * 60 * 1000;

    const dayToMS    = ((dateParts[0] * 24) * 60 * 60) * 1000;
    const hourToMS   = (dateParts[3] * 60 * 60) * 1000;
    const minuteToMS = (dateParts[4] * 60) * 1000;
    const secondToMS =  dateParts[5] * 1000;
    const oneDayToMS = ((24 * 60) * 60) * 1000;

    const timeMs =
      (((yearToMS + monthToMS) + dayToMS) + hourToMS + minuteToMS) - secondToMS - oneDayToMS;

    callback(timeMs);
  }

  // Interval period: 10 minutes
  const INTERVAL_MS = (10 * 60) * 1000;

  const runScheduledMessages = async () => {
    if (!fs.existsSync(DATLICH_PATH))
      fs.writeFileSync(DATLICH_PATH, JSON.stringify({}, null, 4));

    var scheduleData = JSON.parse(fs.readFileSync(DATLICH_PATH));

    var nowStr = moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY_HH:mm:ss');
    nowStr = nowStr.split('_');
    var nowParts = [...nowStr[0].split('/'), ...nowStr[1].split(':')];

    let dueItems = [];

    let nowMs = await new Promise(resolve => parseDateToMs(nowParts, resolve));

    const getItemMs = (boxID, dateStr) => new Promise(async (resolve) => {
      parseDateToMs(dateStr.split('_'), (itemMs) => {
        if (typeof itemMs === 'number' && itemMs < nowMs) {
          if ((nowMs - itemMs) > INTERVAL_MS) {
            scheduleData[boxID][dateStr].TID = boxID;
            dueItems.push(scheduleData[boxID][dateStr]);
          }
          delete scheduleData[boxID][dateStr];
          fs.writeFileSync(DATLICH_PATH, JSON.stringify(scheduleData, null, 4));
        }
        resolve();
      });
    });

    for (var boxID in scheduleData) {
      for (var e of Object.keys(scheduleData[boxID])) {
        await getItemMs(boxID, e);
      }
    }

    for (const el of dueItems) {
      try {
        var participants = (await Threads.getInfo(el.threadID)).participantIDs;
        participants.splice(participants.indexOf(api.getCurrentUserID()), 1);

        var tagStr    = el.REASON || global.config.BOTNAME;
        var mentions  = [];

        for (let i = 0; i < participants.length; i++) {
          if (i >= tagStr.length) tagStr += ' ‍ ';
          mentions.push({ tag: tagStr[i], id: participants[i], fromIndex: i });
        }

        var msgBody = { body: tagStr, mentions };

        if ('ATTACHMENT' in el) {
          msgBody.attachment = [];
          for (const att of el.ATTACHMENT) {
            let buf = (await axios.get(encodeURI(att.url), { responseType: 'arraybuffer' })).data;
            fs.writeFileSync(__dirname + '/../modules/commands/cache/' + att.fileName,
              Buffer.from(buf, 'utf-8'));
            msgBody.attachment.push(fs.createReadStream(
              __dirname + '/../modules/commands/cache/' + att.fileName
            ));
          }
        }

        api.sendMessage(msgBody, el.threadID, () =>
          'ATTACHMENT' in el
            ? el.ATTACHMENT.forEach(a =>
                fs.unlinkSync(__dirname + '/../modules/commands/cache/' + a.fileName))
            : ''
        );
      } catch (err) {
        console.log(err);
      }
    }
  };

  setInterval(runScheduledMessages, INTERVAL_MS);

  // ─── 3. Message listener — returned to main.js / onBot ─────────────────────

  return async (event) => {

    // ── Log group-notification echo ───────────────────────────────────────────
    if (event.type === 'message' && global.config.notiGroup) {
      var echoText = String(global.config.notiGroup);
      echoText += event.logMessageBody || '';
      if (event.author === api.getCurrentUserID())
        echoText = echoText.replace(api.getCurrentUserID(), global.config.BOTNAME);
      api.sendMessage(echoText, event.threadID);
    }

    switch (event.type) {

      // ── Standard messages & replies ───────────────────────────────────────
      case 'message':
      case 'message_reply':
      case 'sending_top':
        runEvent({ event });
        runReply({ event });
        runRefresh({ event });
        runCommand({ event });
        break;

      // ── Group membership changes & thread updates ─────────────────────────
      case 'event':
      case 'change_thread_image':
        runCommandEvent({ event });
        break;

      // ── Emoji reactions ───────────────────────────────────────────────────
      case 'message_reaction':
        var { iconUnsend } = global.config;
        if (
          iconUnsend?.status &&
          event.senderID !== api.getCurrentUserID() &&
          event.reaction === iconUnsend.icon
        ) {
          api.unsendMessage(event.messageID);
        }
        runReaction({ event });
        break;

      default:
        break;
    }
  };
};

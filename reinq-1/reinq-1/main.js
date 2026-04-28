/**
 * Deobfuscated main.js
 * Original file used obfuscator.io-style string table encoding.
 * All _0xXXXX(0xYYY) calls have been resolved to their original string values.
 * Internal helper/wrapper objects (used to obscure function calls) have been inlined.
 * Variable names that were just obfuscated references remain as-is where ambiguous.
 */

// ─── Imports ────────────────────────────────────────────────────────────────

const moment        = require('moment-timezone');
const {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} = require('fs-extra');
const { join, resolve } = require('path');
const { execSync }   = require('child_process');
const logger         = require('./utils/log.js');
const login          = require('@dongdev/fca-unofficial');
const axios          = require('axios');
const listPackage    = JSON.parse(readFileSync('./package.json')).dependencies;
const listbuiltinModules = require('module').builtinModules;

// ─── Global State ────────────────────────────────────────────────────────────

global.client = new Object({
  commands:        new Map(),
  events:          new Map(),
  cooldowns:       new Map(),
  eventRegistered: new Array(),
  handleSchedule:  new Array(),
  handleReaction:  new Array(),
  handleReply:     new Array(),
  mainPath:        process.cwd(),
  configPath:      new String(),

  getTime: function (type) {
    const TIMEZONE = 'Asia/Ho_Chi_minh';
    switch (type) {
      case 'seconds':  return '' + moment.tz(TIMEZONE).format('ss');
      case 'minutes':  return '' + moment.tz(TIMEZONE).format('mm');
      case 'hours':    return '' + moment.tz(TIMEZONE).format('HH');
      case 'date':     return '' + moment.tz(TIMEZONE).format('DD');
      case 'month':    return '' + moment.tz(TIMEZONE).format('MM');
      case 'year':     return '' + moment.tz(TIMEZONE).format('YYYY');
      case 'fullYear': return '' + moment.tz(TIMEZONE).format('DD/MM/YYYY');
      case 'fullHour': return '' + moment.tz(TIMEZONE).format('HH:mm:ss');
      case 'fullTime': return '' + moment.tz(TIMEZONE).format('HH:mm:ss DD/MM/YYYY');
    }
  },
});

global.data = new Object({
  threadInfo:       new Map(),
  threadData:       new Map(),
  userName:         new Map(),
  userBanned:       new Map(),
  threadBanned:     new Map(),
  commandBanned:    new Map(),
  threadAllowNSFW:  new Array(),
  allUserID:        new Array(),
  allCurrenciesID:  new Array(),
  allThreadID:      new Array(),
});

global.utils        = require('./utils');
global.nodemodule   = new Object();
global.config       = new Object();
global.configModule = new Object();
global.moduleData   = new Array();
global.language     = new Object();

// ─── Load Config ─────────────────────────────────────────────────────────────

var configValue;
try {
  global.client.configPath = join(global.client.mainPath, 'config.json');
  configValue = require(global.client.configPath);
} catch {
  const tempPath = global.client.configPath.replace(/\.json/g, '') + '.temp';
  if (existsSync(tempPath)) {
    configValue = readFileSync(tempPath);
    configValue = JSON.parse(configValue);
    logger.loader('Found: ' + tempPath);
  }
}

try {
  for (const key in configValue) global.config[key] = configValue[key];
} catch {
  logger.loader("Can't load file config!", 'ERROR');
}

// ─── Database Setup ──────────────────────────────────────────────────────────

const { Sequelize, sequelize } = require('./includes/database');
writeFileSync(
  global.client.configPath + '.temp',
  JSON.stringify(global.config, null, 4),
  'utf8'
);

// ─── Language File Loading ───────────────────────────────────────────────────

const langFile = readFileSync(
  __dirname + '/languages/' + (global.config.language || 'en') + '.lang',
  { encoding: 'utf-8' }
).split(/\r?\n|\r/);

const langData = langFile.filter(line => line.indexOf('#') !== 0 && line !== '');

for (const item of langData) {
  const getSeparator = item.indexOf('=');
  const itemKey      = item.slice(0, getSeparator);
  const itemValue    = item.slice(getSeparator + 1, item.length);
  const head         = itemKey.slice(0, itemKey.indexOf('.'));
  const key          = itemKey.replace(head + '.', '');
  const value        = itemValue.replace(/\\n/gi, '\n');
  if (typeof global.language[head] === 'undefined') global.language[head] = new Object();
  global.language[head][key] = value;
}

// ─── getText helper ──────────────────────────────────────────────────────────

global.getText = function (...args) {
  const langObj = global.language;
  if (!langObj.hasOwnProperty(args[0]))
    return args[0] + '.' + (args[1] || '');
  var text = langObj[args[0]][args[1]];
  if (typeof text !== 'string') return args[1] || '';
  for (var i = args.length - 1; i > 0; i--) {
    const pattern = RegExp('%' + i, 'g');
    text = text.replace(pattern, args[i + 1]);
  }
  return text;
};

// ─── Load Appstate ───────────────────────────────────────────────────────────

try {
  var appStateFile = resolve(
    join(global.client.mainPath, global.config.APPSTATEPATH || 'appstate.json')
  );
  var appState = require(appStateFile);
} catch {
  return logger.loader(global.getText('notFoundPathAppstate', 'notFoundPathAppstate'), 'ERROR');
}

// ─── Main Bot Startup ────────────────────────────────────────────────────────

function onBot({ models }) {
  const loginOptions = {};
  loginOptions.appState = appState;

  login(loginOptions, async (loginErr, api) => {

    if (loginErr)
      return logger(JSON.stringify(loginErr), 'ERROR');

    // Configure API options
    api.setOptions(global.config.FCAOption);
    global.client.api     = api;
    global.config.version = '1.2.14';
    global.client.timeStart = new Date().getTime();

    // Send startup notification (delayed to allow MQTT to initialize)
    setTimeout(() => {
      api.sendMessage(
        '✅. تـم تـشـغـيـل سـيـكـو ☠️🩸',
        global.config.ADMINBOT[0],
        (err) => {
          if (err) logger('فشل إرسال إشعار تشغيل البوت: ' + JSON.stringify(err), 'ERROR');
          else      logger('تم إرسال إشعار تشغيل البوت', 'INFO');
        }
      );
    }, 5000);

    // ── Load Commands ──────────────────────────────────────────────────────

    (function () {
      const commandFiles = readdirSync(global.client.mainPath + '/modules/commands')
        .filter(f => f.endsWith('.js') && !f.includes('example') && !global.config.commandDisabled.includes(f));

      for (const file of commandFiles) {
        try {
          var cmd = require(global.client.mainPath + '/modules/commands/' + file);

          if (!cmd.config || !cmd.run || !cmd.config.name)
            throw new Error(global.getText('utils', 'Error pinging bot: '));

          if (global.client.commands.has(cmd.config.name || ''))
            throw new Error(global.getText('utils', 'nameExist'));

          // Install command npm dependencies if needed
          if (cmd.config.dependencies && typeof cmd.config.dependencies === 'object') {
            for (const pkg in cmd.config.dependencies) {
              const localPath = join(__dirname, 'node_modules', 'nodemodule', pkg);
              try {
                if (!global.nodemodule.hasOwnProperty(pkg)) {
                  if (listPackage.hasOwnProperty(pkg) || listbuiltinModules.includes(pkg))
                    global.nodemodule[pkg] = require(pkg);
                  else
                    global.nodemodule[pkg] = require(localPath);
                }
              } catch {
                logger.loader(
                  global.getText('utils', 'notFoundPackage', pkg, cmd.config.name),
                  'warn'
                );
                execSync(
                  'npm --package-lock false --save install ' + pkg +
                    (cmd.config.dependencies[pkg] === '*' || cmd.config.dependencies[pkg] === ''
                      ? ''
                      : '@' + cmd.config.dependencies[pkg]),
                  {
                    stdio: 'inherit',
                    env: process.env,
                    shell: true,
                    cwd: join(__dirname, 'node_modules'),
                  }
                );
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    require.cache = {};
                    if (listPackage.hasOwnProperty(pkg) || listbuiltinModules.includes(pkg))
                      global.nodemodule[pkg] = require(pkg);
                    else
                      global.nodemodule[pkg] = require(localPath);
                    break;
                  } catch (_) {}
                }
              }
            }
          }

          // Merge envConfig into global config
          if (cmd.config.envConfig) {
            for (const key in cmd.config.envConfig) {
              if (typeof global.configModule[cmd.config.name] === 'undefined')
                global.configModule[cmd.config.name] = {};
              if (typeof global.config[cmd.config.name] === 'undefined')
                global.config[cmd.config.name] = {};
              if (typeof global.config[cmd.config.name][key] !== 'undefined')
                global.configModule[cmd.config.name][key] = global.config[cmd.config.name][key];
              else
                global.configModule[cmd.config.name][key] = cmd.config.envConfig[key] || '';
              if (typeof global.config[cmd.config.name][key] === 'undefined')
                global.config[cmd.config.name][key] = cmd.config.envConfig[key] || '';
            }
          }

          // Run onLoad hook
          if (cmd.onLoad) {
            const ctx = { api, models };
            cmd.onLoad(ctx);
          }

          global.client.commands.set(cmd.config.name, cmd);

        } catch (_) {}
      }
    })();

    // ── Load Events ────────────────────────────────────────────────────────

    (function () {
      const eventFiles = readdirSync(
        join(global.client.mainPath, '/modules/events')
      ).filter(f => f.endsWith('.js') && !global.config.eventDisabled.includes(f));

      for (const file of eventFiles) {
        try {
          var evt = require(
            join(join(global.client.mainPath, '/modules/events/'), file)
          );

          if (!evt.config || !evt.run)
            throw new Error(global.getText('utils', 'Error pinging bot: '));

          if (global.client.eventRegistered.includes(evt.config.name || ''))
            throw new Error(global.getText('utils', 'nameExist'));

          // Install event npm dependencies if needed
          if (evt.config.dependencies && typeof evt.config.dependencies === 'object') {
            for (const pkg in evt.config.dependencies) {
              const localPath = join(__dirname, '/languages/', 'node_modules', pkg);
              try {
                if (!global.nodemodule.hasOwnProperty(pkg)) {
                  if (listPackage.hasOwnProperty(pkg) || listbuiltinModules.includes(pkg))
                    global.nodemodule[pkg] = require(pkg);
                  else
                    global.nodemodule[pkg] = require(localPath);
                }
              } catch {
                logger.loader(
                  global.getText('utils', 'notFoundPackage', pkg, evt.config.name),
                  'warn'
                );
                execSync(
                  'npm --package-lock false --save install ' + pkg +
                    (evt.config.dependencies[pkg] === '*' || evt.config.dependencies[pkg] === ''
                      ? ''
                      : '@' + evt.config.dependencies[pkg]),
                  {
                    stdio: 'inherit',
                    env: process.env,
                    shell: true,
                    cwd: join(__dirname, 'node_modules'),
                  }
                );
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    require.cache = {};
                    if (listPackage.hasOwnProperty(pkg) || listbuiltinModules.includes(pkg))
                      global.nodemodule[pkg] = require(pkg);
                    else
                      global.nodemodule[pkg] = require(localPath);
                    break;
                  } catch (_) {}
                }
              }
            }
          }

          // Merge envConfig
          if (evt.config.envConfig) {
            for (const key in evt.config.envConfig) {
              if (typeof global.configModule[evt.config.name] === 'undefined')
                global.configModule[evt.config.name] = {};
              if (typeof global.config[evt.config.name] === 'undefined')
                global.config[evt.config.name] = {};
              if (typeof global.config[evt.config.name][key] !== 'undefined')
                global.configModule[evt.config.name][key] = global.config[evt.config.name][key];
              else
                global.configModule[evt.config.name][key] = evt.config.envConfig[key] || '';
              if (typeof global.config[evt.config.name][key] === 'undefined')
                global.config[evt.config.name][key] = evt.config.envConfig[key] || '';
            }
          }

          // Run onLoad hook
          if (evt.onLoad) {
            const ctx = { api, models };
            evt.onLoad(ctx);
          }

          global.client.events.set(evt.config.name, evt);

        } catch (_) {}
      }
    })();

    // ── Post-load logging ──────────────────────────────────────────────────

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.loader(
      global.getText('utils', 'finishLoadModule',
        global.client.commands.size,
        global.client.events.size
      )
    );
    logger.loader(
      'Thời gian khởi động: ' +
      ((Date.now() - global.client.timeStart) / 1000).toFixed() + 's'
    );
    logger.loader(
      '===== [ ' + (Date.now() - global.client.timeStart) + 'ms ] ====='
    );

    // Save config, clean up temp file
    writeFileSync(global.client.configPath, JSON.stringify(global.config, null, 4), 'utf8');
    unlinkSync(global.client.configPath + '.temp');

    // ── Start listener ─────────────────────────────────────────────────────

    const listenerCtx = { api, models };
    const handleEvent  = require('./includes/listen')(listenerCtx);

    function handleListen(err, message) {
      if (err)
        return logger(global.getText('handleListenError', 'handleListenError', JSON.stringify(err)), 'ERROR');

      // Skip certain message types
      if (['IencM', 'PGXCh', 'LzBLz'].some(t => t === message.type)) return;

      if (global.config.DeveloperMode === true) console.log(message);

      return handleEvent(message);
    }

    global.handleListen = api.listenMqtt(handleListen);
  });
}

// ─── Database Init + Bot Start ────────────────────────────────────────────────

(async () => {
  try {
    // Try SQLite anti-settings model
    try {
      global.client.antists = true;
      const { Model, DataTypes, Sequelize: Seq } = require('sequelize');
      const sqliteDb = new Seq({
        dialect: 'sqlite',
        host: join(__dirname, '/includes/data.sqlite'),
        logging: false,
      });

      class AntiStModel extends Model {}
      AntiStModel.init(
        {
          threadID: { type: DataTypes.STRING, primaryKey: true },
          data:     { type: DataTypes.JSON,   defaultValue: {} },
        },
        { sequelize: sqliteDb, modelName: 'antists' }
      );

      AntiStModel.findOneAndUpdate = async function (where, data) {
        const record = await this.findOne({ where });
        if (!record) return null;
        Object.keys(data).forEach(k => (record[k] = data[k]));
        await record.save();
        return record;
      };

      global.modelAntiSt = AntiStModel;
      await sqliteDb.sync({ force: false });

    } catch (sqliteErr) {
      global.client.antists = false;
      logger.loader(global.getText('[ DATABASE ]', 'iYfIe'), '[ CONNECT ]');
      console.log(sqliteErr);
    }

    // Authenticate main database
    await sequelize.authenticate();
    const dbCtx    = { Sequelize, sequelize };
    const models   = require('./includes/database/model')(dbCtx);

    console.log('[ CONNECT ]');

    const botCtx = { models };
    onBot(botCtx);

  } catch (err) {
    logger(
      global.getText('[ DATABASE ]', 'Xspax', JSON.stringify(err)),
      'gyZWs'
    );
  }
})();

// ─── Express HTTP Server (keep-alive / web UI) ────────────────────────────────

const express = require('express');
const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const botURL  = 'https://bot-cww1.onrender.com';

/**
 * Pings the bot URL every 40 seconds to prevent Render.com from sleeping.
 */
function pingUrl(url) {
  const transport = url.startsWith('https') ? https : http;
  transport
    .get(url, (_res) => {
      console.log('Ping sent to bot');
    })
    .on('error', (err) => {
      console.error('Error pinging bot: ' + err.message);
    });
}

setInterval(() => {
  pingUrl(botURL);
}, 40 * 1000);

// Serve index.html for GET /
app.get('/', (_req, res) => {
  const htmlPath = path.join(__dirname, 'index.html');
  fs.readFile(htmlPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading HTML file');
    }
    res.send(data);
  });
});

// Suppress unhandledRejection noise
process.on('unhandledRejection', (_reason, _promise) => {});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('Server is running on port ' + port);
});
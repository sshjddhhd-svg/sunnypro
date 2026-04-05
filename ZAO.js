// ============================================================
// ZAO.js — Deobfuscated
// ============================================================

const chalk = require('chalk');
const { readdirSync, readFileSync, writeFileSync } = require('fs-extra');
const axios = require('axios');
const { join, resolve } = require('path');
const { execSync } = require('child_process');
const logger = require('./utils/log.js');
const login = require('./includes/Emalogin');
const modernizeNkxApi = require('./includes/nkxfcaModernizer');
const listPackage = JSON.parse(readFileSync('./package.json'))['dependencies'];
const listbuiltinModules = require('module')['builtinModules'];

console.log(chalk.bold.hex('#1390f0')('──ZAOFAN-SETTINGS─●'));

const cv = chalk.bold.hex('#1390f0');

logger.log([
  { message: '[ SAIN ]: ', color: ['red', 'cyan'] },
  { message: 'ZAO Is working', color: 'white' }
]);
logger.log([
  { message: '[ SAIN ]: ', color: ['red', 'cyan'] },
  { message: 'This Bot Is SAIN - ♤', color: 'white' }
]);

// ─── Global client object ─────────────────────────────────────
global['client'] = new Object({
  commands:         new Map(),
  events:           new Map(),
  cooldowns:        new Map(),
  eventRegistered:  new Array(),
  handleSchedule:   new Array(),
  handleReaction:   new Array(),
  handleReply:      new Array(),
  mainPath:         process.cwd(),
  configPath:       new String()
});

global['rtg']        = true;
global['YukiBot']    = {};
global['loggeryuki'] = logger;
global['YukiBot']['logger'] = logger;

// ─── Global data store ────────────────────────────────────────
global['data'] = new Object({
  threadInfo:       new Map(),
  threadData:       new Map(),
  userName:         new Map(),
  userBanned:       new Map(),
  threadBanned:     new Map(),
  commandBanned:    new Map(),
  threadAllowNSFW:  new Array(),
  allUserID:        new Array(),
  allCurrenciesID:  new Array(),
  allThreadID:      new Array()
});

global['utils'] = require('./includes/Ema/lts.js');

// ─── createQueue helper ───────────────────────────────────────
global['utils']['createQueue'] = function createQueue(handler) {
  const queue = [];
  const api = {
    push: function(item) {
      queue.push(item);
      if (queue.length == 1) api.next();
    },
    running: null,
    length: function() {
      return queue.length;
    },
    next: function() {
      if (queue.length > 0) {
        const current = queue[0];
        api.running = current;
        handler(current, async function(err, result) {
          api.running = null;
          queue.shift();
          api.next();
        });
      }
    }
  };
  return api;
};

// ─── DBYUKI / db globals ──────────────────────────────────────
global['DBYUKI'] = {
  database: {
    creatingThreadData:    [],
    creatingUserData:      [],
    creatingDashBoardData: [],
    creatingGlobalData:    []
  }
};

global['db'] = {
  allThreadData:           [],
  allUserData:             [],
  allGlobalData:           [],
  threadModel:             null,
  userModel:               null,
  globalModel:             null,
  threadsData:             null,
  usersData:               null,
  globalData:              null,
  receivedTheFirstMessage: {}
};

global['nodemodule']   = new Object();
global['config']       = new Object();
global['funcs']        = require('./includes/Ema/lts.js');
global['configModule'] = new Object();
global['moduleData']   = new Array();
global['language']     = new Object();

// ─── Load config file ─────────────────────────────────────────
var configValue;
try {
  global['client']['configPath'] = join(global['client']['mainPath'], 'ZAO-SETTINGS.json');
  configValue = require(global['client']['configPath']);
} catch (e) {
  return logger.log([
    { message: '[ SAIN ]: ', color: ['red', 'cyan'] },
    { message: "Can't Load config", color: 'white' }
  ]);
}

const envApiOverrides = {
  'YOUTUBE_API': process.env.YOUTUBE_API_KEY || '',
  'WOLFRAM': process.env.WOLFRAM_API_KEY || '',
  'SAUCENAO_API': process.env.SAUCENAO_API_KEY || '',
  'OPEN_WEATHER': process.env.OPENWEATHER_API_KEY || '',
  'SOUNDCLOUD_API': process.env.SOUNDCLOUD_API_KEY || '',
  'APIKEY': process.env.SIMSIMI_API_KEY || ''
};
const missingSecrets = [];
for (const section in configValue) {
  if (typeof configValue[section] === 'object' && configValue[section] !== null && !Array.isArray(configValue[section])) {
    for (const key in envApiOverrides) {
      if (key in configValue[section]) {
        if (envApiOverrides[key] && !configValue[section][key]) {
          configValue[section][key] = envApiOverrides[key];
        } else if (!configValue[section][key] && !envApiOverrides[key]) {
          missingSecrets.push(`${section}.${key}`);
        }
      }
    }
  }
}
if (missingSecrets.length > 0) {
  logger.log([
    { message: '[ CONFIG ]: ', color: ['red', 'cyan'] },
    { message: 'Missing API keys (set via env secrets or config): ' + missingSecrets.join(', '), color: 'yellow' }
  ]);
}

// ─── Apply config values to global ───────────────────────────
try {
  for (const key in configValue) global['config'][key] = configValue[key];
  logger.log([
    { message: '[ SAIN ]: ', color: ['red', 'cyan'] },
    { message: 'Loaded config', color: 'white' }
  ]);
} catch {
  return logger.log([
    { message: '[ SAIN ]: ', color: ['red', 'cyan'] },
    { message: 'Not Found config', color: 'white' }
  ]);
}

// ─── توافق مع مكتبات GoatBot — alias بسيط ────────────────────
// بعض الوحدات (lts.js) تقرأ global.GoatBot.config لذا نُعرّفه هنا
global['GoatBot'] = {
  config: global['config'],
  language: global['language'],
  db:     global['db'],
};

// ─── Load Sequelize + language file ──────────────────────────
const { Sequelize, sequelize } = require('./includes/database');
const langFile = readFileSync(
  __dirname + '/languages/' + (global['config']['language'] || 'en') + '.lang',
  { encoding: 'utf-8' }
).split(/\r?\n|\r/);

const langData = langFile.filter(line => line.indexOf('#') != 0 && line != '');

for (const item of langData) {
  const getSeparator = item.indexOf('=');
  const itemKey      = item.slice(0, getSeparator);
  const itemValue    = item.slice(getSeparator + 1, item.length);
  const head         = itemKey.slice(0, itemKey.indexOf('.'));
  const key          = itemKey.replace(head + '.', '');
  const value        = itemValue.replace(/\\n/gi, '\n');

  if (typeof global['language'][head] === 'undefined')
    global['language'][head] = new Object();

  global['language'][head][key] = value;
}

// ─── getText helper ───────────────────────────────────────────
global['getText'] = function(...args) {
  const getLang = global['language'];
  const [moduleName, keyName, ...rest] = args;

  if (!getLang[moduleName]) return `${moduleName} - Not found key language: ${keyName}`;
  if (!getLang[moduleName][keyName]) return `${moduleName} - Not found key language: ${keyName}`;

  let text = getLang[moduleName][keyName];
  for (let i = 0; i < rest.length; i++) {
    text = text.replace(new RegExp(`%${i + 1}`, 'g'), rest[i]);
  }
  return text;
};

// ─── onBot: login + load commands/events ─────────────────────
async function onBot({ models }) {
  // ── GBAN check (remote ban list) — blocks before login ────
  try {
    const response = await axios.get('https://raw.githubusercontent.com/i1nam/EMA-GBAN/main/GBAN.json', { timeout: 10000 });
    const isBanned = response['data'];
    if (isBanned === true) {
      logger.log([
        { message: '[ GBAN ZAO ]: ', color: ['red', 'cyan'] },
        { message: 'bot stopped by SAIN', color: 'white' }
      ]);
      process.exit(0);
    }
  } catch (e) {
    logger.log([
      { message: '[ GBAN ZAO ]: ', color: ['red', 'cyan'] },
      { message: 'Could not reach ban list, continuing startup', color: 'yellow' }
    ]);
  }

  const _models = models;
  let _api, _threadsData, _usersData, _globalData;

  // ── Login ────────────────────────────────────────────────
  try {
    const loginResult = await login({
      FCAOption: global['config']['FCAOption'] || {}
    });

    if (!loginResult || !loginResult['getAppState']) {
      logger.log([
        { message: '[ Login ]: ', color: ['red', 'cyan'] },
        { message: 'Login failed — no valid session. Watchdog will retry.', color: 'white' }
      ]);
      process.exit(1);
    }

    logger.log([
      { message: '[ Login ]: ', color: ['red', 'cyan'] },
      { message: 'Found AppState', color: 'white' }
    ]);

    _api = loginResult;
    _api = modernizeNkxApi(_api);
  } catch (e) {
    logger.log([
      { message: '[ Login ]: ', color: ['red', 'cyan'] },
      { message: `Login threw error: ${e.message || e} — watchdog will retry.`, color: 'white' }
    ]);
    process.exit(1);
  }

  global.botUserID = _api.getCurrentUserID ? _api.getCurrentUserID() : '';

  // ── Set API options ───────────────────────────────────────
  _api.setOptions({
    listenEvents:  true,
    selfListen:    false,
    autoMarkRead:  false,
    updatePresence: false,
    listenTyping:  false,
    autoReconnect: true
  });

  // ── Load DB models ────────────────────────────────────────
  try {
    const dbController = await require('./DB/controller/index.js')({ models: _models });
    _threadsData = dbController['threadsData'];
    _usersData   = dbController['usersData'];
    _globalData  = dbController['globalData'];

    global['db']['threadsData'] = _threadsData;
    global['db']['usersData']   = _usersData;
    global['db']['globalData']  = _globalData;
    global['db']['threadModel'] = _models['threadModel'];
    global['db']['userModel']   = _models['userModel'];
    global['db']['globalModel'] = _models['globalModel'];
  } catch (e) {
    logger.log([
      { message: '[ SAIN ]: ', color: ['red', 'cyan'] },
      { message: "Can't Connect to DB: " + e.message, color: 'white' }
    ]);
    console.error(e);
    return;
  }

  // ── Load Commands ─────────────────────────────────────────
  (function () {
    const cmdFiles = readdirSync(global['client']['mainPath'] + '/SCRIPTS/ZAO-CMDS')
      .filter(f => f.endsWith('.js') && !global['config']['commandDisabled'].includes(f));

    for (const file of cmdFiles) {
      try {
        var cmd = require(global['client']['mainPath'] + '/SCRIPTS/ZAO-CMDS/' + file);

        if (!cmd['config'] || !cmd['run'])
          throw new Error(global['getText']('mirai', 'Error in cmd format'));

        if (global['client']['commands'].has(cmd['config']['name']) || '')
          throw new Error(global['getText']('mirai', 'Name Is Repeated'));

        // Install npm dependencies declared in cmd config
        if (cmd['config']['dependencies'] && typeof cmd['config']['dependencies'] == 'object') {
          for (const pkgName in cmd['config']['dependencies']) {
            const pkgPath = join(__dirname, 'nodemodules', 'node_modules', pkgName);
            try {
              if (!global['nodemodule'].hasOwnProperty(pkgName)) {
                if (listPackage.hasOwnProperty(pkgName) || listbuiltinModules.includes(pkgName))
                  global['nodemodule'][pkgName] = require(pkgName);
                else
                  global['nodemodule'][pkgName] = require(pkgPath);
              }
            } catch {
              let loaded = false, lastErr;
              const ver = cmd['config']['dependencies'][pkgName];
              execSync(
                'npm --package-lock false --save install ' + pkgName +
                  (ver == '*' || ver == '' ? '' : '@' + ver),
                { stdio: 'inherit', env: process.env, shell: true, cwd: join(__dirname, 'nodemodules') }
              );
              for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                  require['cache'] = {};
                  if (listPackage.hasOwnProperty(pkgName) || listbuiltinModules.includes(pkgName))
                    global['nodemodule'][pkgName] = require(pkgName);
                  else
                    global['nodemodule'][pkgName] = require(pkgPath);
                  loaded = true;
                  break;
                } catch (err) {
                  lastErr = err;
                }
                if (loaded || !lastErr) break;
              }
              if (!loaded || lastErr) throw console.log();
            }
          }
        }

        // Apply envConfig overrides
        if (cmd['config']['envConfig']) {
          try {
            for (const envKey in cmd['config']['envConfig']) {
              if (typeof global['configModule'][cmd['config']['name']] === 'undefined')
                global['configModule'][cmd['config']['name']] = {};
              if (typeof global['config'][cmd['config']['name']] === 'undefined')
                global['config'][cmd['config']['name']] = {};
              if (typeof global['config'][cmd['config']['name']][envKey] !== 'undefined')
                global['configModule'][cmd['config']['name']][envKey] = global['config'][cmd['config']['name']][envKey];
              else
                global['configModule'][cmd['config']['name']][envKey] = cmd['config']['envConfig'][envKey] || '';
              if (typeof global['config'][cmd['config']['name']][envKey] === 'undefined')
                global['config'][cmd['config']['name']][envKey] = cmd['config']['envConfig'][envKey] || '';
            }
          } catch (e) {
            throw new Error('Env Error');
          }
        }

        // Run onLoad hook if present
        if (cmd['onLoad']) {
          try {
            const onLoadArgs = {};
            onLoadArgs['api']    = _api;
            onLoadArgs['models'] = _models;
            cmd['onLoad'](onLoadArgs);
          } catch (e) {
            throw new Error("Can't onLoad : cmds : " + e);
          }
        }

        // Register for event handling if applicable
        if (cmd['handleEvent'])
          global['client']['eventRegistered'].push(cmd['config']['name']);

        global['client']['commands'].set(cmd['config']['name'], cmd);
      } catch (e) {
        logger.log([{ message: '[ SAIN ]: ', color: ['red', 'cyan'] }]);
      }
    }
  }());

  // ── Load Events ───────────────────────────────────────────
  (function () {
    const evtFiles = readdirSync(global['client']['mainPath'] + '/SCRIPTS/ZAO-EVTS')
      .filter(f => f.endsWith('.js') && !global['config']['eventDisabled'].includes(f));

    for (const file of evtFiles) {
      try {
        var evt = require(global['client']['mainPath'] + '/SCRIPTS/ZAO-EVTS/' + file);

        if (!evt['config'] || !evt['run'])
          throw new Error(global['getText']('mirai', 'Error in cmd format'));

        if (global['client']['events'].has(evt['config']['name']) || '')
          throw new Error(global['getText']('mirai', 'Name Is Repeated'));

        // Install npm dependencies
        if (evt['config']['dependencies'] && typeof evt['config']['dependencies'] == 'object') {
          for (const pkgName in evt['config']['dependencies']) {
            const pkgPath = join(__dirname, 'nodemodules', 'node_modules', pkgName);
            try {
              if (!global['nodemodule'].hasOwnProperty(pkgName)) {
                if (listPackage.hasOwnProperty(pkgName) || listbuiltinModules.includes(pkgName))
                  global['nodemodule'][pkgName] = require(pkgName);
                else
                  global['nodemodule'][pkgName] = require(pkgPath);
              }
            } catch {
              let loaded = false, lastErr;
              const ver = evt['config']['dependencies'][pkgName];
              execSync(
                'npm --package-lock false --save install ' + pkgName +
                  (ver == '*' || ver == '' ? '' : '@' + ver),
                { stdio: 'inherit', env: process.env, shell: true, cwd: join(__dirname, 'nodemodules') }
              );
              for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                  require['cache'] = {};
                  if (global['nodemodule'].hasOwnProperty(pkgName)) break;
                  if (listPackage.hasOwnProperty(pkgName) || listbuiltinModules.includes(pkgName))
                    global['nodemodule'][pkgName] = require(pkgName);
                  else
                    global['nodemodule'][pkgName] = require(pkgPath);
                  loaded = true;
                  break;
                } catch (err) {
                  lastErr = err;
                }
                if (loaded || !lastErr) break;
              }
            }
          }
        }

        // Apply envConfig overrides
        if (evt['config']['envConfig']) {
          try {
            for (const envKey in evt['config']['envConfig']) {
              if (typeof global['configModule'][evt['config']['name']] === 'undefined')
                global['configModule'][evt['config']['name']] = {};
              if (typeof global['config'][evt['config']['name']] === 'undefined')
                global['config'][evt['config']['name']] = {};
              if (typeof global['config'][evt['config']['name']][envKey] !== 'undefined')
                global['configModule'][evt['config']['name']][envKey] = global['config'][evt['config']['name']][envKey];
              else
                global['configModule'][evt['config']['name']][envKey] = evt['config']['envConfig'][envKey] || '';
              if (typeof global['config'][evt['config']['name']][envKey] === 'undefined')
                global['config'][evt['config']['name']][envKey] = evt['config']['envConfig'][envKey] || '';
            }
          } catch (e) {}
        }

        // Run onLoad hook
        if (evt['onLoad']) {
          try {
            const onLoadArgs = {};
            onLoadArgs['api']    = _api;
            onLoadArgs['models'] = _models;
            evt['onLoad'](onLoadArgs);
          } catch (e) {
            logger.log([{ message: '[ SAIN ]: ', color: ['red', 'cyan'] }]);
          }
        }

        global['client']['events'].set(evt['config']['name'], evt);
      } catch (e) {
        logger.log([
          { message: '[ SAIN ]: ', color: ['red', 'cyan'] },
          { message: 'ERROR on Event', color: 'white' }
        ]);
      }
    }
  }());

  // ── Summary log ───────────────────────────────────────────
  const gradientString = require('gradient-string');
  const gradient = gradientString('red', 'cyan');
  console.log(gradient('━'.repeat(50), { interpolation: 'hsv' }));
  console.log(cv('\n──LOADING LOADER─●'));
  logger.log([
    { message: '──ZAO DATA─●', color: ['red', 'cyan'] },
    {
      message: 'Loaded ' + global['client']['commands'].size +
               ' Command Aand ' + global['client']['events'].size + ' Events',
      color: 'white'
    }
  ]);

  // ── Restore any pending reply/reaction callbacks saved before last restart ──
  try { require('./includes/login/statePersist').restore(); } catch (_) {}

  // ── Build listen args and start listener ──────────────────
  const listenArgs = {};
  listenArgs['api']         = _api;
  listenArgs['models']      = _models;
  listenArgs['threadsData'] = _threadsData;
  listenArgs['usersData']   = _usersData;
  listenArgs['globalData']  = _globalData;

  let handleListen = require('./includes/listen')(listenArgs);

  // ── Auto-Relogin — standalone module (cooldown + max retries + admin notify) ──
  const autoRelogin = require('./includes/login/autoRelogin');
  global['_triggerAutoRelogin'] = function (reason) {
    try {
      autoRelogin(_api, reason);
    } catch (_) {}
  };

  // ── Listen error handler ──────────────────────────────────
  function handlerWhenListenHasError(err) {
    const errStr  = String(err && (err.message || err.error || err)).toLowerCase();
    const errObj  = (typeof err === 'object') ? err : {};

    // ── Explicit session-kill checks (from other bot's pattern) ──
    const isLoginBlocked = (
      err === 'login_blocked'
      || errObj.error === 'login_blocked'
      || errObj.type  === 'account_inactive'
      || (typeof errObj.reason === 'string' && errObj.reason === 'auth_error')
      || errStr.includes('login_blocked')
      || errStr.includes('account_inactive')
    );

    const sessionExpired = isLoginBlocked || [
      'session', 'expired', 'checkpoint',
      'unauthorized', 'invalid token', 'logout', '406', 'not-authorized'
    ].some(k => errStr.includes(k));

    if (sessionExpired) {
      const label = isLoginBlocked ? 'login_blocked / account_inactive' : 'session expired';
      logger.log([
        { message: '[ SESSION ]: ', color: ['red', 'cyan'] },
        { message: `${label}: ${errStr.slice(0, 120)}`, color: 'white' }
      ]);
      autoRelogin(_api);
    } else {
      logger.log([
        { message: '[ LISTEN-ERR ]: ', color: ['red', 'cyan'] },
        { message: `Connection error — restarting listener: ${errStr.slice(0, 120)}`, color: 'white' }
      ]);
      try {
        if (global['handleListen']) {
          try { global['handleListen'].stopListening(); } catch (_) {}
        }
        setTimeout(() => {
          try {
            global['handleListen']     = _api['listenMqtt'](messageHandler);
            global['lastMqttActivity'] = Date.now();
            logger.log([
              { message: '[ LISTEN-ERR ]: ', color: ['red', 'cyan'] },
              { message: 'Listener restarted successfully. Bot stays alive.', color: 'white' }
            ]);
          } catch (e2) {
            logger.log([
              { message: '[ LISTEN-ERR ]: ', color: ['red', 'cyan'] },
              { message: `Listener restart failed: ${e2.message}. MQTT health check will retry.`, color: 'white' }
            ]);
          }
        }, 1500);
      } catch (e) {
        logger.log([
          { message: '[ LISTEN-ERR ]: ', color: ['red', 'cyan'] },
          { message: `Restart setup failed: ${e.message}. MQTT health check will retry.`, color: 'white' }
        ]);
      }
    }
  }

  // ── تخزين مرجع API للأنظمة الأخرى ────────────────────────
  global['_botApi']       = _api;
  global['_botStartTime'] = Date.now();

  // ══════════════════════════════════════════════════════════
  //  Internal Panel API Server — port 3001 (localhost only)
  // ══════════════════════════════════════════════════════════
  (function startPanelApi() {
    const _panelHttp = require('http');
    const _panelPath = require('path');
    const _panelFs   = require('fs-extra');

    function _parseBody(req) {
      return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try { resolve(body ? JSON.parse(body) : {}); } catch (_) { resolve({}); }
        });
        req.on('error', () => resolve({}));
      });
    }

    function _json(res, data, status) {
      const body = JSON.stringify(data);
      res.writeHead(status || 200, { 'Content-Type': 'application/json' });
      res.end(body);
    }

    function _reloadCommands() {
      const cmdDir = _panelPath.join(__dirname, 'SCRIPTS', 'ZAO-CMDS');
      const files  = _panelFs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const fp = _panelPath.join(cmdDir, file);
        try { delete require.cache[require.resolve(fp)]; } catch (_) {}
      }
      global['client']['commands'].clear();
      global['client']['eventRegistered'] = [];
      global['client']['handleReply']     = [];
      global['client']['handleReaction']  = [];

      const loaded = [], errors = [];
      const disabled = global['config']['commandDisabled'] || [];

      for (const file of files) {
        if (disabled.includes(file)) continue;
        try {
          const cmd = require(_panelPath.join(cmdDir, file));
          if (!cmd || !cmd['config'] || !cmd['run']) { errors.push({ file, error: 'missing config/run' }); continue; }
          if (global['client']['commands'].has(cmd['config']['name'])) { errors.push({ file, error: 'duplicate name' }); continue; }
          if (cmd['onLoad']) { try { cmd['onLoad']({ api: _api, models: _models }); } catch (_) {} }
          if (cmd['handleEvent']) global['client']['eventRegistered'].push(cmd['config']['name']);
          global['client']['commands'].set(cmd['config']['name'], cmd);
          loaded.push({ name: cmd['config']['name'], file });
        } catch (e) { errors.push({ file, error: e.message }); }
      }
      return { loaded, errors, total: global['client']['commands'].size };
    }

    const _panelServer = _panelHttp.createServer(async (req, res) => {
      const remote = req.socket.remoteAddress;
      if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
        res.writeHead(403); return res.end('Forbidden');
      }
      const { method } = req;
      const pathname = req.url.split('?')[0];
      const body = (method === 'POST' || method === 'PUT') ? await _parseBody(req) : {};

      try {
        if (pathname === '/bot/status' && method === 'GET') {
          return _json(res, {
            connected:  !!_api,
            botID:      global['botUserID'] || '',
            commands:   global['client']['commands'].size,
            events:     global['client']['events'].size,
            uptime:     global['_botStartTime'] ? Math.floor((Date.now() - global['_botStartTime']) / 1000) : 0,
            mqttAlive:  global['lastMqttActivity'] ? (Date.now() - global['lastMqttActivity'] < 120000) : false
          });
        }

        if (pathname === '/bot/reload-commands' && method === 'POST') {
          const result = _reloadCommands();
          return _json(res, { ok: true, ...result });
        }

        if (pathname === '/bot/groups' && method === 'GET') {
          const groups = [];
          if (global['data'] && global['data']['threadInfo']) {
            for (const [threadID, info] of global['data']['threadInfo'].entries()) {
              if (!info) continue;
              groups.push({
                threadID: String(threadID),
                name:     info.threadName || info.name || String(threadID),
                members:  info.participantIDs ? info.participantIDs.length : 0
              });
            }
          }
          return _json(res, groups);
        }

        if (pathname === '/bot/group-status' && method === 'POST') {
          const { threadID } = body;
          if (!threadID) return _json(res, { error: 'Missing threadID' }, 400);
          const tid = String(threadID);
          return _json(res, {
            motor: global['motorData']  && global['motorData'][tid]  ? {
              status:  global['motorData'][tid].status,
              message: global['motorData'][tid].message,
              time:    global['motorData'][tid].time
            } : { status: false, message: null, time: null },
            motor2: global['motorData2'] && global['motorData2'][tid] ? {
              status:  global['motorData2'][tid].status,
              message: global['motorData2'][tid].message,
              time:    global['motorData2'][tid].time
            } : { status: false, message: null, time: null },
            nameLock: {
              locked: !!(global['nameLocks'] && global['nameLocks'].has(tid)),
              name:   global['nameLocks'] ? (global['nameLocks'].get(tid) || null) : null
            }
          });
        }

        if (pathname === '/bot/send-message' && method === 'POST') {
          const { threadID, message } = body;
          if (!threadID || !message) return _json(res, { error: 'Missing threadID or message' }, 400);
          if (!_api) return _json(res, { error: 'Bot not connected' }, 503);
          await new Promise((resolve, reject) =>
            _api.sendMessage(message, String(threadID), err => err ? reject(err) : resolve())
          );
          return _json(res, { ok: true });
        }

        if (pathname === '/bot/leave-group' && method === 'POST') {
          const { threadID } = body;
          if (!threadID) return _json(res, { error: 'Missing threadID' }, 400);
          if (!_api) return _json(res, { error: 'Bot not connected' }, 503);
          const myID = global['botUserID'] || (_api.getCurrentUserID ? _api.getCurrentUserID() : '');
          await new Promise((resolve) =>
            _api.removeUserFromGroup(myID, String(threadID), () => resolve())
          );
          return _json(res, { ok: true });
        }

        if (pathname === '/bot/motor' && method === 'POST') {
          const { threadID, action, message, time } = body;
          if (!threadID) return _json(res, { error: 'Missing threadID' }, 400);
          const tid = String(threadID);
          global['motorData'] = global['motorData'] || {};
          if (!global['motorData'][tid]) global['motorData'][tid] = { status: false, message: null, time: null, interval: null };
          const d = global['motorData'][tid];
          if (action === 'set-message') { d.message = message; return _json(res, { ok: true }); }
          if (action === 'set-time')    { d.time = parseInt(time); return _json(res, { ok: true }); }
          if (action === 'activate') {
            if (d.status) return _json(res, { error: 'Already active' }, 400);
            if (!d.message) return _json(res, { error: 'No message set' }, 400);
            if (!d.time || d.time < 5000) return _json(res, { error: 'Set time first (min 5s)' }, 400);
            d.status = true;
            d.interval = setInterval(() => { if (_api) _api.sendMessage(d.message, tid).catch(() => {}); }, d.time);
            return _json(res, { ok: true });
          }
          if (action === 'deactivate') {
            if (d.interval) clearInterval(d.interval);
            d.status = false; d.interval = null;
            return _json(res, { ok: true });
          }
          return _json(res, { status: d.status, message: d.message, time: d.time });
        }

        if (pathname === '/bot/motor2' && method === 'POST') {
          const { threadID, action, message, time } = body;
          if (!threadID) return _json(res, { error: 'Missing threadID' }, 400);
          const tid = String(threadID);
          global['motorData2'] = global['motorData2'] || {};
          global['lastActivity'] = global['lastActivity'] || {};
          if (!global['motorData2'][tid]) global['motorData2'][tid] = { status: false, message: null, time: null, interval: null };
          const d = global['motorData2'][tid];
          if (action === 'set-message') { d.message = message; return _json(res, { ok: true }); }
          if (action === 'set-time')    { d.time = parseInt(time); return _json(res, { ok: true }); }
          if (action === 'activate') {
            if (d.status) return _json(res, { error: 'Already active' }, 400);
            if (!d.message) return _json(res, { error: 'No message set' }, 400);
            if (!d.time || d.time < 5000) return _json(res, { error: 'Set time first (min 5s)' }, 400);
            d.status = true;
            d.interval = setInterval(() => {
              if (!_api) return;
              const lastActive = global['lastActivity'][tid];
              if (!lastActive) return;
              if (Date.now() - lastActive < d.time * 2) {
                _api.sendMessage(d.message, tid).catch(() => {});
              }
            }, d.time);
            return _json(res, { ok: true });
          }
          if (action === 'deactivate') {
            if (d.interval) clearInterval(d.interval);
            d.status = false; d.interval = null;
            return _json(res, { ok: true });
          }
          return _json(res, { status: d.status, message: d.message, time: d.time });
        }

        if (pathname === '/bot/lock-name' && method === 'POST') {
          const { threadID, action, name } = body;
          if (!threadID) return _json(res, { error: 'Missing threadID' }, 400);
          const tid = String(threadID);
          global['nameLocks'] = global['nameLocks'] || new Map();
          if (action === 'lock') {
            if (!name) return _json(res, { error: 'Missing name' }, 400);
            global['nameLocks'].set(tid, name);
            if (_api) { try { await _api.setTitle(name, tid); } catch (_) {} }
            return _json(res, { ok: true });
          }
          if (action === 'unlock') {
            global['nameLocks'].delete(tid);
            return _json(res, { ok: true });
          }
          return _json(res, { locked: global['nameLocks'].has(tid), name: global['nameLocks'].get(tid) || null });
        }

        if (pathname === '/bot/accept-request' && method === 'POST') {
          const { threadID } = body;
          if (!threadID) return _json(res, { error: 'Missing threadID' }, 400);
          if (!_api) return _json(res, { error: 'Bot not connected' }, 503);
          try {
            await new Promise((resolve) =>
              _api.handleMessageRequest(String(threadID), true, () => resolve())
            );
          } catch (_) {}
          return _json(res, { ok: true });
        }

        res.writeHead(404); res.end('Not found');
      } catch (e) {
        _json(res, { error: e.message }, 500);
      }
    });

    _panelServer.listen(3001, '127.0.0.1', () => {
      logger.log([
        { message: '[ PANEL ]: ', color: ['red', 'cyan'] },
        { message: 'Internal API ready on 127.0.0.1:3001', color: 'white' }
      ]);
    });
    _panelServer.on('error', e => {
      logger.log([
        { message: '[ PANEL ]: ', color: ['red', 'cyan'] },
        { message: 'Internal API error: ' + e.message, color: 'yellow' }
      ]);
    });
  })();

  // ── MQTT silence watchdog — tracks last message timestamp ────
  global['lastMqttActivity']      = Date.now();
  global['lastAltJsonSave']        = Date.now();

  // ── Message handler ───────────────────────────────────────
  function messageHandler(err, message) {
    if (err) return handlerWhenListenHasError(err);

    global['lastMqttActivity'] = Date.now();

    // Skip low-value event types
    if (['typ', 'read_receipt', 'presence'].some(t => t == message['type'])) return;

    if (global['config']['DeveloperMode'] === true) console.log(message);

    return handleListen(message);
  }

  // Start listening
  global['handleListen']  = _api['listenMqtt'](messageHandler);
  global['client']['api'] = _api;

  // ── دالة إعادة تشغيل المستمع للـ MQTT Health Check ────────
  global['_restartListener'] = function () {
    try {
      if (global['handleListen']) {
        try { global['handleListen'].stopListening(); } catch (_) {}
      }
      setTimeout(() => {
        try {
          global['handleListen']     = _api['listenMqtt'](messageHandler);
          global['lastMqttActivity'] = Date.now();
          logger.log([
            { message: '[ MQTT-HEALTH ]: ', color: ['red', 'cyan'] },
            { message: 'تمت إعادة تشغيل المستمع بنجاح. البوت يبقى يعمل.', color: 'white' }
          ]);
        } catch (e2) {
          logger.log([
            { message: '[ MQTT-HEALTH ]: ', color: ['red', 'cyan'] },
            { message: `فشل إعادة التشغيل: ${e2.message}. سيحاول مجددًا.`, color: 'white' }
          ]);
        }
      }, 1500);
    } catch (e) {
      logger.log([
        { message: '[ MQTT-HEALTH ]: ', color: ['red', 'cyan'] },
        { message: `فشل إعداد إعادة التشغيل: ${e.message}. البوت يبقى يعمل.`, color: 'white' }
      ]);
    }
  };

  // ── تشغيل MQTT Health Check ────────────────────────────────
  try {
    const mqttHealth = require('./includes/mqttHealthCheck');
    mqttHealth.startHealthCheck();
  } catch (e) {
    logger.log([
      { message: '[ MQTT-HEALTH ]: ', color: ['red', 'cyan'] },
      { message: `فشل تشغيل فحص صحة MQTT: ${e.message}`, color: 'white' }
    ]);
  }

  // ── تشغيل Keep-Alive (GoatBot system) ─────────────────────
  try {
    const { startKeepAlive } = require('./includes/keepAlive');
    startKeepAlive();
  } catch (e) {
    logger.log([
      { message: '[ KEEP-ALIVE ]: ', color: ['red', 'cyan'] },
      { message: `فشل تشغيل نظام إبقاء الجلسة: ${e.message}`, color: 'white' }
    ]);
  }

  // ─── Protection systems startup banner ────────────────────
  const gradStr2 = require('gradient-string');
  const grad2    = gradStr2('red', 'cyan');
  console.log(grad2('━'.repeat(50), { interpolation: 'hsv' }));
  console.log(require('chalk').bold.hex('#1390f0')('──PROTECTION SYSTEMS─●'));
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Fast-Ping        ✓  every 10 seconds (watchdog → /ping)', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Auto-Ping        ✓  random 8-18 min', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Cookie Save      ✓  every 10 min → ZAO-STATE.json & alt.json', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Auto-Relogin     ✓  3 attempts / 3-min cooldown (JSON/Token/String/Netscape → Email/Password fallback)', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Session-Check    ✓  proactive live-cookie validation every 35 min', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'MQTT-Silence     ✓  إعادة تشغيل المستمع إذا صمت > 10 دقائق', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'MQTT-HealthCheck ✓  فحص ذكي مع backoff تصاعدي (من GoatBot)', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Human-Typing     ✓  محاكاة الطباعة البشرية قبل كل رد', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Keep-Alive       ✓  Ping مباشر لفيسبوك كل 8-18 دقيقة + تجديد fb_dtsg كل 48 ساعة', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Memory-Guard     ✓  clean restart if heap > 512 MB', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Graceful-Exit    ✓  saves cookies on SIGTERM/SIGINT', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Listen-Error     ✓  instant listener restart + login_blocked/account_inactive/auth_error detection', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Settings-Watch   ✓  hot-reload ZAO-SETTINGS.json', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Crash-Restore    ✓  alt.json → ZAO-STATE.json on crash', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: 'Cache-Cleanup    ✓  prune userName/threadInfo/threadData maps every 2 h (max 5 000 entries)', color: 'white' }]);
  logger.log([{ message: '[ PROTECT ]: ', color: ['red', 'cyan'] }, { message: `Cookie-Refresh   ✓  forced credential re-login every ${global['config']['intervalGetNewCookieMinutes'] || 1440} min`, color: 'white' }]);
  console.log(grad2('━'.repeat(50), { interpolation: 'hsv' }));

  // ─── 1. Auto-Ping — keep process alive, random 8-18 min ───────
  (function scheduleAutoPing() {
    const minMs = 8  * 60 * 1000;
    const maxMs = 18 * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    setTimeout(async () => {
      try {
        const port = process.env.PORT || 3000;
        await axios.get(`http://localhost:${port}/`, { timeout: 10000 });
        logger.log([
          { message: '[ AUTO-PING ]: ', color: ['red', 'cyan'] },
          { message: `Pinged keep-alive server (next in ${Math.round(delay / 60000)} min)`, color: 'white' }
        ]);
      } catch (e) {
        logger.log([
          { message: '[ AUTO-PING ]: ', color: ['red', 'cyan'] },
          { message: `Ping failed: ${e.message}`, color: 'white' }
        ]);
      }
      scheduleAutoPing();
    }, delay);
  }());

  // ─── 2 & 3. Save cookies to ZAO-STATE.json + alt.json every 10 min ──
  setInterval(async () => {
    try {
      const appState     = _api.getAppState();
      const appStatePath = join(process.cwd(), global['config']['APPSTATEPATH'] || 'ZAO-STATE.json');
      const altPath      = join(process.cwd(), 'alt.json');
      writeFileSync(appStatePath, JSON.stringify(appState, null, 2), 'utf-8');
      writeFileSync(altPath,      JSON.stringify(appState, null, 2), 'utf-8');
      logger.log([
        { message: '[ COOKIES ]: ', color: ['red', 'cyan'] },
        { message: 'Cookies saved to ZAO-STATE.json & alt.json', color: 'white' }
      ]);
    } catch (e) {
      logger.log([
        { message: '[ COOKIES ]: ', color: ['red', 'cyan'] },
        { message: `Failed to save cookies: ${e.message}`, color: 'white' }
      ]);
    }
  }, 10 * 60 * 1000);

  // ─── 3b. إجباري: حفظ الكوكيز في alt.json كل 2 ساعة بشكل إلزامي ─
  // هذا الحفظ يعمل بغض النظر عن أي شيء آخر — ضمان وجود نسخة احتياطية
  setInterval(async () => {
    try {
      const appState = _api.getAppState();
      if (!appState || !Array.isArray(appState) || appState.length === 0) return;
      const altPath  = join(process.cwd(), 'alt.json');
      require('fs').writeFileSync(altPath, JSON.stringify(appState, null, 2), 'utf-8');
      global['lastAltJsonSave'] = Date.now();
      logger.log([
        { message: '[ ALT-SAVE ]: ', color: ['red', 'cyan'] },
        { message: `[إلزامي] تم حفظ ${appState.length} كوكيز في alt.json (كل ساعتين).`, color: 'white' }
      ]);
    } catch (e) {
      logger.log([
        { message: '[ ALT-SAVE ]: ', color: ['red', 'cyan'] },
        { message: `فشل الحفظ الإلزامي: ${e.message}`, color: 'white' }
      ]);
    }
  }, 2 * 60 * 60 * 1000);

  // ─── 4. Settings file watcher — hot-reload ZAO-SETTINGS.json ──
  (function watchSettings() {
    const settingsPath = join(process.cwd(), 'ZAO-SETTINGS.json');
    let debounceTimer  = null;
    try {
      require('fs').watch(settingsPath, (eventType) => {
        if (eventType !== 'change') return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          try {
            const fresh = JSON.parse(require('fs').readFileSync(settingsPath, 'utf-8'));
            for (const key in fresh) global['config'][key] = fresh[key];
            logger.log([
              { message: '[ SETTINGS ]: ', color: ['red', 'cyan'] },
              { message: 'ZAO-SETTINGS.json reloaded successfully.', color: 'white' }
            ]);
          } catch (e) {
            logger.log([
              { message: '[ SETTINGS ]: ', color: ['red', 'cyan'] },
              { message: `Reload failed: ${e.message}`, color: 'white' }
            ]);
          }
        }, 500);
      });
      logger.log([
        { message: '[ SETTINGS ]: ', color: ['red', 'cyan'] },
        { message: 'Watching ZAO-SETTINGS.json for changes.', color: 'white' }
      ]);
    } catch (e) {
      logger.log([
        { message: '[ SETTINGS ]: ', color: ['red', 'cyan'] },
        { message: `File watcher error: ${e.message}`, color: 'white' }
      ]);
    }
  }());

  // ─── 5. Notifications tab — random 30-120 min ─────────────────
  (function scheduleNotifVisit() {
    const minMs = 30  * 60 * 1000;
    const maxMs = 120 * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    setTimeout(async () => {
      try {
        const appState  = _api.getAppState();
        const cookieStr = appState.map(c => `${c.key}=${c.value}`).join('; ');
        await axios.get('https://www.facebook.com/?sk=notifications', {
          headers: {
            'Cookie':          cookieStr,
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer':         'https://www.facebook.com/'
          },
          timeout: 15000,
          maxRedirects: 5
        });
        logger.log([
          { message: '[ NOTIF ]: ', color: ['red', 'cyan'] },
          { message: `Visited notifications tab (next in ${Math.round(delay / 60000)} min)`, color: 'white' }
        ]);
      } catch (e) {
        logger.log([
          { message: '[ NOTIF ]: ', color: ['red', 'cyan'] },
          { message: `Request failed: ${e.message}`, color: 'white' }
        ]);
      }
      scheduleNotifVisit();
    }, delay);
  }());

  // ─── 6. Proactive session health check — every 35 min ──────────
  // Validates the cookie against mbasic.facebook.com BEFORE the
  // MQTT connection fails, so recovery happens proactively.
  (function scheduleSessionCheck() {
    const CHECK_INTERVAL = 35 * 60 * 1000;
    setTimeout(async () => {
      try {
        const checkLiveCookie = require('./includes/login/checkLiveCookie');
        const appState        = _api.getAppState();
        const cookieStr       = appState.map(c => `${c.key}=${c.value}`).join('; ');
        const userAgent       = global['config']['FCAOption']?.userAgent;
        const isLive          = await checkLiveCookie(cookieStr, userAgent);

        if (!isLive) {
          logger.log([
            { message: '[ SESSION-CHECK ]: ', color: ['red', 'cyan'] },
            { message: 'Proactive check: session is DEAD — triggering auto re-login now.', color: 'white' }
          ]);
          autoRelogin(_api);
        } else {
          logger.log([
            { message: '[ SESSION-CHECK ]: ', color: ['red', 'cyan'] },
            { message: 'Proactive check: session is alive ✓', color: 'white' }
          ]);
        }
      } catch (e) {
        logger.log([
          { message: '[ SESSION-CHECK ]: ', color: ['red', 'cyan'] },
          { message: `Check error: ${e.message}`, color: 'white' }
        ]);
      }
      scheduleSessionCheck();
    }, CHECK_INTERVAL);
  }());

  // ─── 7. MQTT silence watchdog — restart listener after 20 min idle ─
  // Catches silent MQTT drops where no error event fires.
  // استخدام global['lastMqttActivity'] وليس متغير محلي لتجنب ReferenceError
  let _mqttRestartAttempts = 0;
  const _MQTT_MAX_RESTARTS  = 5;

  setInterval(() => {
    const SILENCE_LIMIT = 20 * 60 * 1000;
    const silentFor     = Date.now() - (global['lastMqttActivity'] || Date.now());
    if (silentFor > SILENCE_LIMIT) {
      if (_mqttRestartAttempts >= _MQTT_MAX_RESTARTS) {
        logger.log([
          { message: '[ MQTT-SILENCE ]: ', color: ['red', 'cyan'] },
          { message: `Reached max MQTT restart attempts (${_MQTT_MAX_RESTARTS}). Bot stays alive — watchdog will recover if needed.`, color: 'white' }
        ]);
        global['lastMqttActivity'] = Date.now();
        _mqttRestartAttempts = 0;
        return;
      }
      _mqttRestartAttempts++;
      logger.log([
        { message: '[ MQTT-SILENCE ]: ', color: ['red', 'cyan'] },
        { message: `No MQTT activity for ${Math.round(silentFor / 60000)} min — restarting listener (attempt ${_mqttRestartAttempts}/${_MQTT_MAX_RESTARTS}).`, color: 'white' }
      ]);
      try {
        if (global['handleListen']) {
          try { global['handleListen'].stopListening(); } catch (_) {}
        }
        setTimeout(() => {
          try {
            global['handleListen']     = _api['listenMqtt'](messageHandler);
            global['lastMqttActivity'] = Date.now();
            _mqttRestartAttempts       = 0;
            logger.log([
              { message: '[ MQTT-SILENCE ]: ', color: ['red', 'cyan'] },
              { message: 'Listener restarted successfully. Bot stays alive.', color: 'white' }
            ]);
          } catch (e2) {
            logger.log([
              { message: '[ MQTT-SILENCE ]: ', color: ['red', 'cyan'] },
              { message: `Listener restart failed: ${e2.message}. Will retry on next check.`, color: 'white' }
            ]);
          }
        }, 1500);
      } catch (e) {
        logger.log([
          { message: '[ MQTT-SILENCE ]: ', color: ['red', 'cyan'] },
          { message: `Restart setup failed: ${e.message}. Will retry on next check.`, color: 'white' }
        ]);
      }
    } else {
      if (_mqttRestartAttempts > 0) _mqttRestartAttempts = 0;
    }
  }, 5 * 60 * 1000);

  // ─── 8. Memory guard — clean exit if heap exceeds 512 MB ──────
  // Saves cookies first so the watchdog restarts with fresh state.
  setInterval(() => {
    const heapMB = process.memoryUsage().heapUsed / 1024 / 1024;
    if (heapMB > 512) {
      logger.log([
        { message: '[ MEMORY ]: ', color: ['red', 'cyan'] },
        { message: `Heap usage ${Math.round(heapMB)} MB exceeds 512 MB limit — saving state and restarting.`, color: 'white' }
      ]);
      try {
        const appState     = _api.getAppState();
        const appStatePath = join(process.cwd(), global['config']['APPSTATEPATH'] || 'ZAO-STATE.json');
        writeFileSync(appStatePath, JSON.stringify(appState, null, 2), 'utf-8');
        writeFileSync(join(process.cwd(), 'alt.json'), JSON.stringify(appState, null, 2), 'utf-8');
        logger.log([
          { message: '[ MEMORY ]: ', color: ['red', 'cyan'] },
          { message: 'State saved — exiting for watchdog restart.', color: 'white' }
        ]);
      } catch (_) {}
      try { require('./includes/login/statePersist').save(); } catch (_) {}
      setTimeout(() => process.exit(0), 500);
    }
  }, 15 * 60 * 1000);

  // ─── 9. Graceful shutdown — save cookies on SIGTERM / SIGINT ──
  // Ensures the watchdog always has fresh cookies to restore from.
  function gracefulShutdown(signal) {
    logger.log([
      { message: '[ SHUTDOWN ]: ', color: ['red', 'cyan'] },
      { message: `${signal} received — saving cookies before exit.`, color: 'white' }
    ]);
    try {
      const appState     = _api.getAppState();
      const appStatePath = join(process.cwd(), global['config']['APPSTATEPATH'] || 'ZAO-STATE.json');
      writeFileSync(appStatePath, JSON.stringify(appState, null, 2), 'utf-8');
      writeFileSync(join(process.cwd(), 'alt.json'), JSON.stringify(appState, null, 2), 'utf-8');
      logger.log([
        { message: '[ SHUTDOWN ]: ', color: ['red', 'cyan'] },
        { message: 'Cookies saved successfully. Goodbye.', color: 'white' }
      ]);
    } catch (e) {
      logger.log([
        { message: '[ SHUTDOWN ]: ', color: ['red', 'cyan'] },
        { message: `Could not save cookies: ${e.message}`, color: 'white' }
      ]);
    }
    try { require('./includes/login/statePersist').save(); } catch (_) {}
    process.exit(0);
  }

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT',  () => gracefulShutdown('SIGINT'));

  // ─── 10. Global data cache cleanup — trims Maps every 2 h ──────
  // Prevents unbounded memory growth in global.data.userName /
  // threadInfo / threadData as the bot sees more users over time.
  setInterval(() => {
    try {
      const MAX_ENTRIES = 5000;
      let pruned = 0;
      for (const key of ['userName', 'threadInfo', 'threadData']) {
        const map = global['data'][key];
        if (map && map.size > MAX_ENTRIES) {
          const entries = [...map.keys()];
          const toRemove = entries.slice(0, entries.length - MAX_ENTRIES);
          for (const k of toRemove) { map.delete(k); pruned++; }
        }
      }
      if (pruned > 0) {
        logger.log([
          { message: '[ CACHE ]: ', color: ['red', 'cyan'] },
          { message: `Pruned ${pruned} stale entries from data maps (userName/threadInfo/threadData).`, color: 'white' }
        ]);
      }
    } catch (e) {
      logger.log([
        { message: '[ CACHE ]: ', color: ['red', 'cyan'] },
        { message: `Cache cleanup error: ${e.message}`, color: 'white' }
      ]);
    }
  }, 2 * 60 * 60 * 1000);

  // ─── 11. Periodic forced credential re-login (fresh tokens) ────
  // Every N minutes (default 1440 = 24 h), forces a full credential
  // re-login to obtain a brand-new session token and saves it.
  // Only runs if EMAIL + PASSWORD are configured.
  (function scheduleForcedCookieRefresh() {
    const intervalMin = (global['config']['intervalGetNewCookieMinutes'] || 1440);
    const intervalMs  = intervalMin * 60 * 1000;
    setTimeout(async () => {
      const email    = process.env.FB_EMAIL    || global['config']['EMAIL']    || '';
      const password = process.env.FB_PASSWORD || global['config']['PASSWORD'] || '';
      if (!email || !password) {
        logger.log([
          { message: '[ REFRESH ]: ', color: ['red', 'cyan'] },
          { message: 'Skipping scheduled cookie refresh — no EMAIL/PASSWORD configured.', color: 'white' }
        ]);
      } else {
        logger.log([
          { message: '[ REFRESH ]: ', color: ['red', 'cyan'] },
          { message: `Scheduled ${intervalMin}-min cookie refresh — re-logging in to get fresh tokens...`, color: 'white' }
        ]);
        try {
          const getFbstate = require('./includes/login/getFbstate');
          const appState   = await getFbstate(email, password);
          if (appState && Array.isArray(appState) && appState.length) {
            const appStatePath = join(process.cwd(), global['config']['APPSTATEPATH'] || 'ZAO-STATE.json');
            writeFileSync(appStatePath, JSON.stringify(appState, null, 2), 'utf-8');
            writeFileSync(join(process.cwd(), 'alt.json'), JSON.stringify(appState, null, 2), 'utf-8');
            logger.log([
              { message: '[ REFRESH ]: ', color: ['red', 'cyan'] },
              { message: 'Fresh cookies obtained and saved ✓', color: 'white' }
            ]);
          }
        } catch (e) {
          logger.log([
            { message: '[ REFRESH ]: ', color: ['red', 'cyan'] },
            { message: `Scheduled refresh failed: ${e.message}`, color: 'white' }
          ]);
        }
      }
      scheduleForcedCookieRefresh();
    }, intervalMs);
  }());
}

// ─── Connect to DB then launch ────────────────────────────────
console.log(cv('\n──ZAO DATA─●'));

(async () => {
  try {
    await sequelize.authenticate();

    const dbArgs = {};
    dbArgs['Sequelize'] = Sequelize;
    dbArgs['sequelize'] = sequelize;

    const models = require('./includes/database/model')(dbArgs);

    logger.log([
      { message: '[ SAIN ]: ', color: ['red', 'cyan'] },
      { message: 'Connected to DB ', color: 'white' }
    ]);

    console.log(cv('\n──LOADING FACEBOOK─●'));

    const botArgs = {};
    botArgs['models'] = models;
    onBot(botArgs);
  } catch (e) {
    logger.log([
      { message: '[ SAIN ]: ', color: ['red', 'cyan'] },
      { message: "Can't Connect to DB ", color: 'white' }
    ]);
  }
})();

// ─── Global unhandled rejection handler ──────────────────────
// Catches promise rejections that escape .catch() — most commonly
// from FCA-UNO's internal MQTT promise chains. These are logged
// for debugging but do NOT crash the process (non-fatal).
process.on('unhandledRejection', (reason, promise) => {
  const ts  = new Date().toISOString();
  const log = global.loggeryuki;

  let msg   = 'unknown';
  let stack = '';

  if (reason instanceof Error) {
    msg   = reason.message || String(reason);
    stack = reason.stack   || '';
  } else if (reason && typeof reason === 'object') {
    msg   = reason.message || reason.error || reason.description || JSON.stringify(reason);
    stack = reason.stack   || '';
  } else {
    msg = String(reason ?? 'unknown');
  }

  // Trim stack to first 3 frames to keep logs readable
  const stackHint = stack
    ? '\n  ' + stack.split('\n').slice(1, 4).map(l => l.trim()).join('\n  ')
    : '';

  const fullMsg = `[${ts}] Unhandled promise rejection (non-fatal): ${msg}${stackHint}`;

  if (log) {
    log.log([
      { message: '[ UNHANDLED-REJECTION ]: ', color: ['red', 'cyan'] },
      { message: fullMsg, color: 'white' }
    ]);
  } else {
    console.error('[UNHANDLED-REJECTION]', fullMsg);
  }
});

// ─── Global uncaught exception handler ───────────────────────
// Catches synchronous throws that escape all try/catch blocks.
// Logs the error and lets the watchdog decide whether to restart
// rather than crashing silently or abruptly.
process.on('uncaughtException', (err, origin) => {
  const ts  = new Date().toISOString();
  const log = global.loggeryuki;

  const msg   = (err && err.message) ? err.message : String(err ?? 'unknown');
  const stack = (err && err.stack)   ? err.stack   : '';

  const stackHint = stack
    ? '\n  ' + stack.split('\n').slice(1, 4).map(l => l.trim()).join('\n  ')
    : '';

  const fullMsg = `[${ts}] Uncaught exception (origin: ${origin || 'uncaughtException'}): ${msg}${stackHint}`;

  if (log) {
    log.log([
      { message: '[ UNCAUGHT-EXCEPTION ]: ', color: ['red', 'cyan'] },
      { message: fullMsg, color: 'white' }
    ]);
  } else {
    console.error('[UNCAUGHT-EXCEPTION]', fullMsg);
  }
  // Do NOT call process.exit() — let the watchdog handle restarts
});

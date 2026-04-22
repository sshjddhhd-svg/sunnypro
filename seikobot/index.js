/**
 * Deobfuscated index.js
 * This is the launcher / process-manager entry point for the SAIKO bot.
 * It starts main.js as a child process, handles restarts, and serves a
 * simple Express status page.
 */

// ─── Imports ──────────────────────────────────────────────────────────────────

const { spawn }       = require('child_process');
const { readFileSync } = require('fs-extra');
const http             = require('http');
const axios            = require('axios');
const semver           = require('semver');
const logger           = require('./utils/log');
const express          = require('express');
const path             = require('path');
const chalk            = require('chalkercli');   // animated chalk (rainbow effects)
const chalk1           = require('chalk');
const CFonts           = require('cfonts');
const app              = express();
const port             = process.env.PORT || 2006;
const moment           = require('moment-timezone');

// ─── Localised day name (Arabic) ─────────────────────────────────────────────

var gio = moment.tz('Asia/Ho_Chi_Minh').format('HH:mm:ss || D/MM/YYYY');
var thu = moment.tz('Asia/Ho_Chi_Minh').format('dddd');

if (thu === 'Sunday')    thu = '🌞 الأحد';
if (thu === 'Monday')    thu = '🌙 الإثنين';
if (thu === 'Tuesday')   thu = '🔥 الثلاثاء';
if (thu === 'Wednesday') thu = '💧 الأربعاء';
if (thu === 'Thursday')  thu = '🌈 الخميس';
if (thu === 'Friday')    thu = '🎉 الجمعة';
if (thu === 'Saturday')  thu = '⭐ السبت';

// ─── Express: serve index.html ────────────────────────────────────────────────

app.get('/', function (_req, res) {
  res.sendFile(path.join(__dirname, '/index.html'));
});

app.listen(port);

// ─── Animated banner (chalkercli rainbow) ────────────────────────────────────

const rainbow = chalk.rainbow('\nㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤㅤ《=== ✨ SAIKO BOT LAUNCH 🌟 ===》\n\n');
rainbow.stop();
const frame = rainbow.frame();
console.log(frame);

logger(
  chalk1.cyanBright('🎉 Your version is sparkling fresh!') + chalk1.yellow(' ✨'),
  'UPDATE'
);

// ─── startBot: spawn main.js and handle restarts ──────────────────────────────

function startBot(message) {
  // Log reason for start/restart if provided
  if (message) {
    logger(
      chalk1.redBright(message) + chalk1.yellow(' 💖'),
      'error'
    );
  }

  // Spawn main.js with helpful V8 flags
  const child = spawn('node', ['--trace-warnings', '--async-stack-traces', 'main.js'], {
    cwd:   __dirname,
    stdio: 'inherit',
    shell: true,
  });

  child.on('close', async (exitCode) => {
    // exitCode 1 → immediate restart (crash)
    if (exitCode === 1) {
      return startBot(
        chalk1.redBright('🌈 SAIKO is back online! Hang tight!') + chalk1.green(' ⚡')
      );
    }

    // exitCode whose last 2 digits are non-zero → delayed restart
    // The delay in seconds is encoded in the first digits of the exit code
    var codeStr = String(exitCode).replace(String(exitCode), exitCode);
    if (codeStr.slice(0, 2) === '0') {
      // Wait for the number of seconds encoded in the exit code (strip last 2 digits)
      await new Promise(r => setTimeout(r, parseInt(codeStr.slice(0, 2, '')) * 1000));
      startBot(
        chalk1.cyan('🔄 SAIKO IS REBOOTING!!!') + chalk1.magenta(' QMFqk')
      );
    } else {
      return; // no restart
    }
  });

  child.on('error', function (err) {
    logger(
      chalk1.red('⚠️ Oops! Something broke: ') + JSON.stringify(err) + chalk1.yellow(' 😿'),
      'error'
    );
  });
}

// ─── Startup sequence ─────────────────────────────────────────────────────────

// Fire a version-check request (result is silently ignored)
axios.get('https://raw.githubusercontent.com/tandung1/Bot12/main/package.json').then(() => {});

// Short delay before printing the full banner and launching
setTimeout(async function () {

  // Big ASCII title banner
  CFonts.say('SAIKO', {
    font:          'block',
    align:         'center',
    gradient:      ['cyan', 'purple'],
    letterSpacing: 3,
    space:         false,
  });

  CFonts.say('Bot Messenger Powered By SAIKO 🚀', {
    font:               'console',
    align:              'center',
    gradient:           ['pink', 'IVAIZ'],
    transitionGradient: true,
  });

  CFonts.say('Crafted with 🌟 LOVE 🌟 & 🎨 COLORS', {
    font:          'simple',
    align:         'center',
    gradient:      ['red', 'yRjaI'],
    letterSpacing: 2,
  });

  console.log(
    chalk1.bgMagentaBright.bold.blueBright(
      '\n 🎉 SAIKO BOT READY AT ' + gio + ' 🎉 \n'
    )
  );

  // Replay the rainbow banner
  rainbow.stop();
  const frame2 = rainbow.frame();
  console.log(frame2);

  logger(
    chalk1.greenBright('🌌 Loading SAIKO magic code') + chalk1.blueBright(' ✨'),
    'LOAD'
  );

  // Launch the bot
  startBot(
    chalk1.cyanBright('🚀 Launching SAIKO now!') + chalk1.yellow(' 🌟')
  );

}, 70); // 0x46 ms
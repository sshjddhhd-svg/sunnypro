const logger = require("./utils/log");
const chalk = require("chalk");
const cv = chalk.bold.hex("#1390f0");
const gradient = require("gradient-string")
const logo = `


▒█▀▀▀█ ░█▀▀█ ▒█▀▀▀█ 
░▄▄▄▀▀ ▒█▄▄█ ▒█░░▒█ 
▒█▄▄▄█ ▒█░▒█ ▒█▄▄▄█


Hi I'M BOT ZAO  DEVELOPED  BY SAIM`;

const c = ["cyan", "#7D053F"];
const redToGreen = gradient("red", "cyan");
console.log(redToGreen("━".repeat(50), { interpolation: "hsv" }));
const text = gradient(c).multiline(logo);
console.log(text);
console.log(redToGreen("━".repeat(50), { interpolation: "hsv" }));

console.log(cv(`\n` + `──ZAOFAN STARTER─●`));


logger.log([
  {
  message: "[ SAIM ]: ",
   color: ["red", "cyan"],
  },
  {
  message: `test`,
  color: "white",
  },
]);

const { spawn } = require('child_process');
const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fs = require('fs');
const path = require('path');
const http = require('http');

class Zao {
  constructor() {
    this.app          = Fastify();
    this.PORT         = process.env.PORT || 3000;
    this.countRestart = 0;
    this.child        = null;
    this.botStartTime = null;
    this.init();
  }

  init() {
    this.startApp();
    this.startBot();
  }

  startApp() {
    this.app.get("/", (req, reply) => {
      reply.send({ status: "success", bot: "ZAO", time: Date.now() });
    });

    this.app.get("/ping", (req, reply) => {
      reply.send({ status: "success", time: Date.now() });
    });

    const listenOptions = {
      port: this.PORT,
      host: '0.0.0.0',
    };

    this.app.listen(listenOptions, (err, address) => {
      if (err) {
        logger.log([
          {
          message: "[ SAIM ]: ",
           color: ["red", "red"],
          },
          {
          message: `Error starting server: ${err}`,
          color: "white",
          },
        ]);
        process.exit(1);
      }
      logger.log([
        {
        message: "[ SAIM ]",
         color: ["red", "cyan"],
        },
        {
        message: `App deployed on port ${this.PORT}`,
        color: "white",
        },
      ]);
      this.startPingLoop();
    });
  }
  startPingLoop() {
    let pingCount = 0;
    setInterval(() => {
      const req = http.get(`http://localhost:${this.PORT}/ping`, { timeout: 8000 }, (res) => {
        pingCount += 1;
        if (pingCount % 6 === 0) {
          logger.log([
            { message: "[ PING ]: ", color: ["yellow", "cyan"] },
            { message: `Server alive — ${pingCount} pings (${Math.round(pingCount * 10 / 60)} min uptime)`, color: "white" },
          ]);
        }
      });
      req.on('error', (e) => {
        logger.log([
          { message: "[ PING ]: ", color: ["red", "cyan"] },
          { message: `10s ping FAILED: ${e.message}`, color: "white" },
        ]);
      });
      req.end();
    }, 10 * 1000);
    logger.log([
      { message: "[ PING ]: ", color: ["yellow", "cyan"] },
      { message: "10-second ping loop started on /ping endpoint.", color: "white" },
    ]);
  }

  startBot() {
    const MAX_RESTARTS        = 25;
    const STABLE_UPTIME_MS    = 10 * 60 * 1000;
    const BASE_BACKOFF_MS     = 3000;
    const MAX_BACKOFF_MS      = 60 * 1000;

    const options = {
      cwd: __dirname,
      stdio: "inherit",
      shell: true,
    };

    this.child        = spawn("node", ["--trace-deprecation", "--trace-warnings", "--async-stack-traces", "ZAO.js"], options);
    this.botStartTime = Date.now();

    logger.log([
      { message: "[ WATCHDOG ]: ", color: ["yellow", "cyan"] },
      { message: `Armed — monitoring ZAO.js (attempt ${this.countRestart === 0 ? 'initial' : this.countRestart + '/' + MAX_RESTARTS})`, color: "white" },
    ]);

    this.child.on("close", (codeExit) => {
      // Clean exit (exit 0 from autoRelogin success) — restart immediately, reset counter
      if (codeExit === 0) {
        logger.log([
          { message: "[ WATCHDOG ]: ", color: ["yellow", "cyan"] },
          { message: "Clean exit detected (session refresh) — restarting immediately.", color: "white" },
        ]);
        this.countRestart = 0;
        this._restoreCookies();
        setTimeout(() => this.startBot(), 1000);
        return;
      }

      // Crash exit — apply exponential backoff, reset counter if it was running stably
      if (codeExit !== 0 && this.countRestart < MAX_RESTARTS) {
        const uptimeMs = Date.now() - (this.botStartTime || 0);
        if (uptimeMs >= STABLE_UPTIME_MS) {
          logger.log([
            { message: "[ WATCHDOG ]: ", color: ["yellow", "cyan"] },
            { message: `Bot ran for ${Math.round(uptimeMs / 60000)} min before crashing — resetting restart counter.`, color: "white" },
          ]);
          this.countRestart = 0;
        }

        this.countRestart += 1;

        // Exponential backoff: 3s, 6s, 12s, 24s, 48s … capped at 60s
        const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, this.countRestart - 1), MAX_BACKOFF_MS);

        this._restoreCookies();

        logger.log([
          { message: "[ WATCHDOG ]: ", color: ["yellow", "cyan"] },
          { message: `Bot crashed (exit ${codeExit}). Restart ${this.countRestart}/${MAX_RESTARTS} in ${Math.round(backoffMs / 1000)}s.`, color: "white" },
        ]);

        setTimeout(() => this.startBot(), backoffMs);

      } else if (codeExit !== 0) {
        logger.log([
          { message: "[ WATCHDOG ]: ", color: ["red", "cyan"] },
          { message: `Bot failed after ${MAX_RESTARTS} restarts. HTTP server still alive on port ${this.PORT}. Manual intervention required.`, color: "white" },
        ]);
      }
    });

    this.child.on("error", (error) => {
      logger.log([
        { message: "[ BOT ERROR ]: ", color: ["red", "cyan"] },
        { message: `${JSON.stringify(error)}`, color: "white" },
      ]);
    });
  }

  _restoreCookies() {
    const altPath   = path.join(__dirname, 'alt.json');
    const statePath = path.join(__dirname, 'ZAO-STATE.json');
    try {
      if (fs.existsSync(altPath)) {
        const altData = fs.readFileSync(altPath, 'utf-8');
        const parsed  = JSON.parse(altData);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error("alt.json is empty or not a valid array");
        }
        fs.writeFileSync(statePath, altData, 'utf-8');
        logger.log([
          { message: "[ PROTECT ]: ", color: ["yellow", "cyan"] },
          { message: `Restored ${parsed.length} cookies from alt.json → ZAO-STATE.json`, color: "white" },
        ]);
      } else {
        logger.log([
          { message: "[ PROTECT ]: ", color: ["yellow", "cyan"] },
          { message: "alt.json not found — skipping cookie restore.", color: "white" },
        ]);
      }
    } catch (e) {
      logger.log([
        { message: "[ PROTECT ]: ", color: ["red", "cyan"] },
        { message: `Cookie restore failed: ${e.message}`, color: "white" },
      ]);
    }
  }
}

const ZAO  = new Zao();
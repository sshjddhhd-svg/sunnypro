const login = require("@dongdev/fca-unofficial");
const fs = require("fs-extra");
const path = require("path");

const COOLDOWN_MS    = 3 * 60 * 1000;
const MAX_RETRIES    = 3;
const RESTART_DELAY  = 3000;

let lastAttempt  = 0;
let retryCount   = 0;
let isAttempting = false;

function log(level, msg) {
  try {
    const logger = global.loggeryuki;
    if (logger) {
      logger.log([
        { message: "[ RELOGIN ]: ", color: ["red", "cyan"] },
        { message: msg, color: "white" }
      ]);
      return;
    }
  } catch (e) {}
  console[level === "error" ? "error" : "log"]("[RELOGIN]", msg);
}

function notifyAdmins(api, message) {
  try {
    const admins = global.config?.ADMINBOT || [];
    for (const adminID of admins) {
      const id = String(adminID).trim();
      if (!id) continue;
      api.sendMessage(message, id).catch(() => {});
    }
  } catch (e) {}
}

/**
 * Attempts to re-authenticate with Facebook and restart the bot.
 * Features:
 *   - Cooldown: will not attempt more than once per 3 minutes
 *   - Max retries: stops after 3 failed attempts and notifies admins
 *   - On success: saves new AppState to ZAO-STATE.json & alt.json, then restarts
 *
 * @param {object} api - Current FCA API instance (used to notify admins)
 * @returns {Promise<boolean>} true if re-login succeeded, false otherwise
 */
module.exports = async function autoRelogin(api) {
  const now = Date.now();

  if (isAttempting) {
    log("warn", "Already attempting re-login — skipping duplicate call.");
    return false;
  }

  if (now - lastAttempt < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (now - lastAttempt)) / 1000);
    log("warn", `Cooldown active. Next attempt allowed in ${waitSec}s.`);
    return false;
  }

  if (retryCount >= MAX_RETRIES) {
    log("error", `Max retries (${MAX_RETRIES}) reached. Manual intervention required.`);
    notifyAdmins(
      api,
      `⛔ AUTO RELOGIN FAILED\n\n` +
      `Tried ${MAX_RETRIES} times — all failed.\n` +
      `Please update ZAO-STATE.json manually with fresh cookies.`
    );
    return false;
  }

  const email    = global.config?.EMAIL;
  const password = global.config?.PASSWORD;

  if (!email || !password) {
    log("error", "No EMAIL/PASSWORD in ZAO-SETTINGS.json. Cannot auto re-login.");
    notifyAdmins(
      api,
      `⚠️ SESSION EXPIRED — AUTO RELOGIN SKIPPED\n\n` +
      `No email/password saved in ZAO-SETTINGS.json.\n` +
      `Please add EMAIL and PASSWORD fields to re-enable auto re-login.`
    );
    return false;
  }

  isAttempting = true;
  lastAttempt  = now;
  retryCount++;

  log("info", `Attempting re-login (attempt ${retryCount}/${MAX_RETRIES}) for: ${email}`);
  notifyAdmins(
    api,
    `🔄 SESSION EXPIRED — Attempting auto re-login...\nAttempt ${retryCount}/${MAX_RETRIES}`
  );

  return new Promise(resolve => {
    login({ email, password }, {}, async (err, newApi) => {
      isAttempting = false;

      if (err) {
        const errMsg = err?.error || err?.message || String(err);
        log("error", `Re-login failed: ${errMsg}`);
        notifyAdmins(
          api,
          `❌ AUTO RELOGIN FAILED (attempt ${retryCount}/${MAX_RETRIES})\nReason: ${errMsg}`
        );
        resolve(false);
        return;
      }

      try {
        const newAppState = newApi.getAppState();
        const statePath   = path.join(process.cwd(), global.config?.APPSTATEPATH || "ZAO-STATE.json");
        const altPath     = path.join(process.cwd(), "alt.json");

        fs.writeFileSync(statePath, JSON.stringify(newAppState, null, 2), "utf-8");
        fs.writeFileSync(altPath,   JSON.stringify(newAppState, null, 2), "utf-8");

        retryCount = 0;

        log("info", `New AppState saved to ${path.basename(statePath)} & alt.json. Restarting in ${RESTART_DELAY / 1000}s...`);
        notifyAdmins(
          api,
          `✅ AUTO RELOGIN SUCCESS\n\nNew session saved. Bot is restarting now...`
        );

        resolve(true);
        setTimeout(() => process.exit(0), RESTART_DELAY);

      } catch (saveErr) {
        log("error", `Re-login succeeded but failed to save new AppState: ${saveErr.message}`);
        notifyAdmins(api, `❌ Re-login succeeded but failed to save: ${saveErr.message}`);
        resolve(false);
      }
    });
  });
};

"use strict";

/**
 * ZAO Auto Re-Login
 * ==================
 * When the session expires this module tries to re-establish it.
 * It is multi-account-aware: it tries the same tier that is currently
 * active first (refreshing cookies), then advances to the next tier
 * if the current one is permanently dead.
 *
 * Tier order: 1 → 2 → 3
 *   Tier 1: ZAO-STATE.json / alt.json      (+ email/password fallback)
 *   Tier 2: ZAO-STATEX.json / altx.json
 *   Tier 3: ZAO-STATEV.json / altv.json
 */

const { loginAsync } = require("../fcaClient");
const fs             = require("fs-extra");
const path           = require("path");
const parseAppState  = require("./parseAppState");
const { patchCookieApi } = require("../zaoCookiePatcher");
// [FIX Djamel] — atomic writes for tier-state files. A torn write here
// would lose the active-tier marker AND corrupt the cookie file, forcing
// the bot back to Tier 1 on every restart.
const { atomicWriteFileSync } = (() => {
  try { return require("../../utils/atomicWrite"); }
  catch (_) { return { atomicWriteFileSync: fs.writeFileSync.bind(fs) }; }
})();

// ── Tier persistence (mirrors logic in Emalogin/index.js) ────────────────────
const TIER_PERSIST_FILE = path.join(process.cwd(), "data", "active-tier.json");
function writePersistedTier(tier) {
  try {
    fs.ensureDirSync(path.dirname(TIER_PERSIST_FILE));
    atomicWriteFileSync(TIER_PERSIST_FILE, JSON.stringify({ tier, ts: new Date().toISOString() }, null, 2), "utf-8");
  } catch (_) {}
}

const COOLDOWN_MS   = 3  * 60 * 1000;  // 3 minutes between attempts
const MAX_RETRIES   = 4;               // per tier
const RESTART_DELAY = 3000;

const TIERS = [
  { tier: 1, stateFile: "ZAO-STATE.json",  altFile: "alt.json",  credsFile: "ZAO-STATEC.json"  },
  { tier: 2, stateFile: "ZAO-STATEX.json", altFile: "altx.json", credsFile: "ZAO-STATEXC.json" },
  { tier: 3, stateFile: "ZAO-STATEV.json", altFile: "altv.json", credsFile: "ZAO-STATEVC.json" },
];

let lastAttempt   = 0;
let retryCount    = 0;
let isAttempting  = false;
let currentTierIdx = 0;  // index into TIERS[]

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
  } catch (_) {}
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
  } catch (_) {}
}

function buildLoginOptions() {
  return Object.assign({
    autoReconnect: true,
    listenEvents: true,
    autoMarkRead: true,
    simulateTyping: true,
    randomUserAgent: false,
    persona: "desktop",
    maxConcurrentRequests: 5,
    maxRequestsPerMinute: 50,
    requestCooldownMs: 60000,
    errorCacheTtlMs: 300000,
  }, global.config?.FCAOption || {});
}

function saveState(stateFile, altFile, appState) {
  try {
    const data = JSON.stringify(appState, null, 2);
    // [FIX Djamel] — atomic writes prevent half-written cookie files
    // when the bot is killed mid-save (very common during the
    // RESTART_DELAY window after a successful relogin).
    atomicWriteFileSync(stateFile, data, "utf-8");
    if (altFile && fs.existsSync(path.dirname(altFile))) {
      atomicWriteFileSync(altFile, data, "utf-8");
    }
  } catch (_) {}
}

function readCredsFile(credsFullPath) {
  try {
    if (!fs.existsSync(credsFullPath)) return null;
    const data = JSON.parse(fs.readFileSync(credsFullPath, "utf-8").trim());
    if (data && data.email && data.password) return { email: data.email, password: data.password };
    return null;
  } catch (_) {
    return null;
  }
}

async function tryTierLogin(tierInfo, api) {
  const cwd  = process.cwd();
  const opts = buildLoginOptions();
  const ua   = opts.userAgent || global.config?.FCAOption?.userAgent;

  const stateFullPath = path.join(cwd, tierInfo.stateFile);
  const altFullPath   = path.join(cwd, tierInfo.altFile);
  const credsFullPath = path.join(cwd, tierInfo.credsFile);

  // ── 1. Try main state file ──────────────────────────────────────
  let parsed = await parseAppState(stateFullPath, ua);
  if (parsed && Array.isArray(parsed.appState) && parsed.appState.length > 0) {
    try {
      const newApi = await loginAsync({ appState: parsed.appState }, opts);
      const uid    = newApi && newApi.getCurrentUserID ? newApi.getCurrentUserID() : null;
      if (uid && uid !== "0") return { newApi, stateFullPath, altFullPath };
    } catch (_) {}
  }

  // ── 2. Try alt file ─────────────────────────────────────────────
  if (fs.existsSync(altFullPath)) {
    parsed = await parseAppState(altFullPath, ua);
    if (parsed && Array.isArray(parsed.appState) && parsed.appState.length > 0) {
      try {
        const newApi = await loginAsync({ appState: parsed.appState }, opts);
        const uid    = newApi && newApi.getCurrentUserID ? newApi.getCurrentUserID() : null;
        if (uid && uid !== "0") return { newApi, stateFullPath, altFullPath };
      } catch (_) {}
    }
  }

  // ── 3. Try creds file for this tier ─────────────────────────────
  const fileCreds = readCredsFile(credsFullPath);
  if (fileCreds) {
    try {
      const newApi = await loginAsync({ email: fileCreds.email, password: fileCreds.password }, opts);
      const uid    = newApi && newApi.getCurrentUserID ? newApi.getCurrentUserID() : null;
      if (uid && uid !== "0") return { newApi, stateFullPath, altFullPath };
    } catch (_) {}
  }

  // ── 4. Config/env credentials (Tier 1 only, always tried as last resort) ─
  // This runs whether or not a creds file was present — the file might have
  // existed but contained wrong credentials, so we must still fall through to
  // the global config/env credentials before giving up on Tier 1.
  if (tierInfo.tier === 1) {
    const email    = process.env.FB_EMAIL    || global.config?.EMAIL;
    const password = process.env.FB_PASSWORD || global.config?.PASSWORD;
    if (email && password) {
      try {
        const newApi = await loginAsync({ email, password }, opts);
        const uid    = newApi && newApi.getCurrentUserID ? newApi.getCurrentUserID() : null;
        if (uid && uid !== "0") return { newApi, stateFullPath, altFullPath };
      } catch (_) {}
    }
  }

  return null;
}

/**
 * Immediately skip the current tier and attempt the next one.
 * Called by the AccountHealthMonitor when send failures are confirmed.
 * Bypasses the normal cooldown/retry-count gate.
 *
 * @param {object} api    - Current (possibly dead) FCA API instance
 * @param {string} reason - Why the forced switch was requested
 */
async function forceTierSwitch(api, reason) {
  if (isAttempting) {
    log("warn", "forceTierSwitch: re-login already in progress — skipping.");
    return false;
  }

  // Resolve which tier we're on right now
  const activeTier = global.activeAccountTier || 1;
  let idx = TIERS.findIndex(t => t.tier === activeTier);
  if (idx === -1) idx = 0;

  isAttempting = true;

  // [FIX Djamel] — previous version tried ONLY the next tier and bailed.
  // If Tier 2 was dead and we were on Tier 1, the bot would keep failing
  // at Tier 2 forever and never reach Tier 3. Now we walk forward through
  // every remaining tier in the same call so a single forceTierSwitch
  // truly exhausts the account pool.
  // [FIX Djamel #2] — added a small per-tier cooldown between attempts so
  // back-to-back tier walks don't generate three near-simultaneous logins
  // from the same IP (Facebook's login throttle treats that as a brute-force
  // burst and locks every account in the pool).
  const PER_TIER_DELAY_MS = 12 * 1000;
  let loginResult = null;
  let tierInfo    = null;
  let firstAttemptInWalk = true;
  for (let nextIdx = idx + 1; nextIdx < TIERS.length; nextIdx++) {
    tierInfo = TIERS[nextIdx];
    if (!firstAttemptInWalk) {
      const wait = PER_TIER_DELAY_MS + Math.floor(Math.random() * 4000);
      log("info", `forceTierSwitch: spacing tier attempts — waiting ${Math.round(wait/1000)}s before Tier ${tierInfo.tier}.`);
      await new Promise(r => setTimeout(r, wait));
    }
    firstAttemptInWalk = false;

    log("warn", `forceTierSwitch → Tier ${tierInfo.tier} (${tierInfo.stateFile}) | reason: ${reason || "send failures"}`);
    notifyAdmins(api,
      `🔄 ACCOUNT HEALTH MONITOR\n\n` +
      `Switching to Tier ${tierInfo.tier} due to send failures.\n` +
      `Reason: ${reason || "consecutive message send failures"}`
    );

    try {
      loginResult = await tryTierLogin(tierInfo, api);
    } catch (e) {
      log("error", `forceTierSwitch: Tier ${tierInfo.tier} login threw: ${e.message}`);
      loginResult = null;
    }

    if (loginResult) {
      currentTierIdx = nextIdx;
      retryCount     = 0;
      lastAttempt    = 0;
      break;
    }

    log("error", `forceTierSwitch: Tier ${tierInfo.tier} failed — trying next tier...`);
    notifyAdmins(api, `❌ HEALTH MONITOR: Tier ${tierInfo.tier} also failed.`);
  }

  if (!loginResult) {
    isAttempting = false;
    log("error", `forceTierSwitch: all tiers after Tier ${activeTier} have been tried — none succeeded.`);
    notifyAdmins(api,
      `⛔ HEALTH MONITOR: all account tiers have been tried.\n` +
      `Please upload fresh cookie files via the panel.\n` +
      `Reason: ${reason || "send failures"}`
    );
    // Force the relogin module to start the cycle from scratch on next call
    retryCount = MAX_RETRIES;
    return false;
  }

  const { newApi, stateFullPath, altFullPath } = loginResult;
  try {
    const freshState = newApi.getAppState ? newApi.getAppState() : [];
    saveState(stateFullPath, altFullPath, freshState);
    retryCount               = 0;
    global.activeAccountTier = tierInfo.tier;
    global.activeStateFile   = stateFullPath;
    global.activeAltFile     = altFullPath;
    global.loginMethod       = "appstate";
    patchCookieApi(newApi, {
      tier:        tierInfo.tier,
      stateFile:   stateFullPath,
      altFile:     altFullPath,
      loginMethod: "appstate"
    });
    writePersistedTier(tierInfo.tier);
    try { require("./statePersist").save(); } catch (_) {}
    log("info", `forceTierSwitch: success — Tier ${tierInfo.tier}. Restarting in ${RESTART_DELAY / 1000}s...`);
    notifyAdmins(api,
      `✅ HEALTH MONITOR: switched to Tier ${tierInfo.tier} successfully.\nBot restarting...`
    );
    // Lock the flag so no new relogin attempt can start during the exit window
    isAttempting = true;
    setTimeout(() => process.exit(0), RESTART_DELAY);
    return true;
  } catch (saveErr) {
    // [FIX Djamel] — without resetting isAttempting here a save failure
    // would jam the relogin module forever ("already in progress").
    isAttempting = false;
    log("error", `forceTierSwitch: login ok but could not save cookies: ${saveErr.message}`);
    return false;
  }
};

/**
 * Main re-login entry point.
 * @param {object} api    - Current (possibly dead) FCA API instance
 * @param {string} reason - Why re-login was triggered
 */
async function autoRelogin(api, reason) {
  const now = Date.now();

  if (isAttempting) {
    log("warn", "Already attempting re-login — skipping duplicate call.");
    return false;
  }

  if (now - lastAttempt < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (now - lastAttempt)) / 1000);
    log("warn", `Cooldown active. Next attempt in ${waitSec}s.`);
    return false;
  }

  // Sync current tier index from global state
  const activeTier = global.activeAccountTier || 1;
  currentTierIdx   = TIERS.findIndex(t => t.tier === activeTier);
  if (currentTierIdx === -1) currentTierIdx = 0;

  if (retryCount >= MAX_RETRIES) {
    // This tier is exhausted — advance to the next one
    if (currentTierIdx + 1 < TIERS.length) {
      currentTierIdx++;
      retryCount = 0;
      log("warn", `Tier ${activeTier} exhausted. Advancing to Tier ${TIERS[currentTierIdx].tier}...`);
    } else {
      log("error", `All ${TIERS.length} account tiers exhausted. Manual intervention required.`);
      notifyAdmins(
        api,
        `⛔ ALL ACCOUNT TIERS FAILED\n\n` +
        `Tried all ${TIERS.length} tiers — none could login.\n` +
        `Please update cookie files via the panel.`
      );
      return false;
    }
  }

  isAttempting = true;
  lastAttempt  = now;
  retryCount++;

  const tierInfo   = TIERS[currentTierIdx];
  const reasonMsg  = reason
    ? ` | reason=${String(reason && (reason.message || reason.error || reason)).slice(0, 180)}`
    : "";

  log("info", `Re-login attempt ${retryCount}/${MAX_RETRIES} — Tier ${tierInfo.tier} (${tierInfo.stateFile})${reasonMsg}`);
  notifyAdmins(
    api,
    `🔄 SESSION EXPIRED — Attempting auto re-login...\n` +
    `Tier ${tierInfo.tier} | Attempt ${retryCount}/${MAX_RETRIES}` +
    (reasonMsg ? `\n${reasonMsg}` : "")
  );

  let loginResult = null;
  try {
    loginResult = await tryTierLogin(tierInfo, api);
  } catch (e) {
    log("error", `Re-login threw error: ${e.message}`);
  }

  isAttempting = false;

  if (!loginResult) {
    log("error", `Re-login failed for Tier ${tierInfo.tier}.`);
    notifyAdmins(
      api,
      `❌ AUTO RELOGIN FAILED (Tier ${tierInfo.tier} attempt ${retryCount}/${MAX_RETRIES})`
    );
    return false;
  }

  const { newApi, stateFullPath, altFullPath } = loginResult;

  try {
    const freshState = newApi.getAppState ? newApi.getAppState() : [];
    saveState(stateFullPath, altFullPath, freshState);

    retryCount                = 0;
    global.activeAccountTier  = tierInfo.tier;
    global.activeStateFile    = stateFullPath;
    global.activeAltFile      = altFullPath;
    global.loginMethod        = "appstate";

    patchCookieApi(newApi, {
      tier:        tierInfo.tier,
      stateFile:   stateFullPath,
      altFile:     altFullPath,
      loginMethod: "appstate"
    });

    writePersistedTier(tierInfo.tier);
    // Persist any pending callbacks before restart
    try { require("./statePersist").save(); } catch (_) {}

    log("info", `Re-login success — Tier ${tierInfo.tier}. Restarting in ${RESTART_DELAY / 1000}s...`);
    notifyAdmins(
      api,
      `✅ AUTO RELOGIN SUCCESS\n\nTier ${tierInfo.tier} session restored. Bot is restarting...`
    );

    // Lock the flag so no new relogin attempt can start during the exit window
    isAttempting = true;
    setTimeout(() => process.exit(0), RESTART_DELAY);
    return true;

  } catch (saveErr) {
    log("error", `Re-login succeeded but could not save cookies: ${saveErr.message}`);
    notifyAdmins(api, `❌ Re-login succeeded but failed to save: ${saveErr.message}`);
    return false;
  }
}

module.exports                   = autoRelogin;
module.exports.forceTierSwitch   = forceTierSwitch;

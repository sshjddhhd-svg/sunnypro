"use strict";

const { writeFileSync, existsSync } = require("fs");
const { join }  = require("path");
const { loginAsync } = require("../fcaClient");
const parseAppState  = require("../login/parseAppState");
const { patchCookieApi } = require("../zaoCookiePatcher");

// ── Tier persistence helpers ─────────────────────────────────────────────────
// Store the last-active tier to disk so restarts resume from the right account
// instead of always falling back to Tier 1.
const TIER_PERSIST_FILE = join(process.cwd(), "data", "active-tier.json");

function readPersistedTier() {
  try {
    if (!existsSync(TIER_PERSIST_FILE)) return 1;
    const raw  = require("fs").readFileSync(TIER_PERSIST_FILE, "utf-8").trim();
    const data = JSON.parse(raw);
    const t    = parseInt(data && data.tier, 10);
    if (t >= 1 && t <= 3) return t;
  } catch (_) {}
  return 1;
}

function writePersistedTier(tier) {
  try {
    require("fs-extra").ensureDirSync(require("path").dirname(TIER_PERSIST_FILE));
    writeFileSync(TIER_PERSIST_FILE, JSON.stringify({ tier, ts: new Date().toISOString() }, null, 2), "utf-8");
  } catch (_) {}
}

/**
 * ZAO Multi-Account Login Module
 * ================================
 * Tries three account tiers in order, falling back on failure:
 *
 *   Tier 1 — ZAO-STATE.json  + alt.json      (primary account)
 *   Tier 2 — ZAO-STATEX.json + altx.json     (secondary account)
 *   Tier 3 — ZAO-STATEV.json + altv.json     (tertiary account)
 *
 * Within each tier the flow is:
 *   1. Try the main state file
 *   2. If that fails, try the alt (backup) file for the same tier
 *   3. If both cookie files fail AND tier 1 has email/password → try credentials
 *
 * On success the fresh AppState is written back to BOTH files of that tier
 * so the next boot reuses the live session.
 *
 * The active tier is stored in global.activeAccountTier (1 / 2 / 3) so
 * the autoRelogin module knows which files to update.
 */

const TIERS = [
  { tier: 1, stateFile: "ZAO-STATE.json",  altFile: "alt.json",  credsFile: "ZAO-STATEC.json"  },
  { tier: 2, stateFile: "ZAO-STATEX.json", altFile: "altx.json", credsFile: "ZAO-STATEXC.json" },
  { tier: 3, stateFile: "ZAO-STATEV.json", altFile: "altv.json", credsFile: "ZAO-STATEVC.json" },
];

function buildLoginOptions(extra = {}) {
  const nkxDefaults = {
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
  };
  return Object.assign({}, nkxDefaults, global.config?.FCAOption || {}, extra);
}

function saveState(stateFile, altFile, appState) {
  try {
    const data = JSON.stringify(appState, null, 2);
    writeFileSync(stateFile, data, "utf-8");
    if (altFile) writeFileSync(altFile, data, "utf-8");
  } catch (e) {
    console.warn(`[ Login ]: Warning — could not save cookies: ${e.message}`);
  }
}

async function tryLoginWithFile(filePath, loginOptions, label) {
  const userAgent = loginOptions.userAgent || global.config?.FCAOption?.userAgent;
  const parsed    = await parseAppState(filePath, userAgent);

  if (!parsed || !Array.isArray(parsed.appState) || parsed.appState.length === 0) {
    console.log(`[ Login ]: ${label} — no usable AppState in ${filePath}`);
    return null;
  }

  const { appState, confident } = parsed;
  if (!confident) {
    console.log(`[ Login ]: ${label} — cookies in ${filePath} could not be pre-validated, trying anyway...`);
  } else {
    console.log(`[ Login ]: ${label} — session confirmed alive, logging in via AppState...`);
  }

  try {
    const api = await loginAsync({ appState }, loginOptions);
    const uid  = api && api.getCurrentUserID ? api.getCurrentUserID() : null;
    if (!uid || uid === "0") {
      throw new Error("FCA returned userID=0 — session rejected by Facebook.");
    }
    console.log(`[ Login ]: ${label} — AppState login successful ✓  (uid=${uid})`);
    return { api, appState: api.getAppState ? api.getAppState() : appState };
  } catch (e) {
    console.error(`[ Login ]: ${label} — AppState login rejected: ${e.message}`);
    return null;
  }
}

async function tryLoginWithCredentials(email, password, loginOptions, label) {
  if (!email || !password) {
    console.log(`[ Login ]: ${label} — no email/password configured, skipping credential login.`);
    return null;
  }
  console.log(`[ Login ]: ${label} — attempting credential login for ${email}...`);
  try {
    const api = await loginAsync({ email, password }, loginOptions);
    const uid  = api && api.getCurrentUserID ? api.getCurrentUserID() : null;
    if (!uid || uid === "0") {
      throw new Error("Credentials login returned userID=0 — Facebook may have blocked the login.");
    }
    console.log(`[ Login ]: ${label} — credential login successful ✓  (uid=${uid})`);
    return { api, appState: api.getAppState ? api.getAppState() : [] };
  } catch (e) {
    console.error(`[ Login ]: ${label} — credential login failed: ${e.message}`);
    return null;
  }
}

/**
 * Reads email + password from a creds JSON file.
 * Expected format: { "email": "...", "password": "..." }
 * Returns null if the file doesn't exist or is malformed.
 */
function readCredsFile(credsFullPath) {
  try {
    if (!existsSync(credsFullPath)) return null;
    const raw  = require("fs").readFileSync(credsFullPath, "utf-8").trim();
    const data = JSON.parse(raw);
    if (data && data.email && data.password) return { email: data.email, password: data.password };
    return null;
  } catch (_) {
    return null;
  }
}

module.exports = async function multiAccountLogin({ FCAOption = {}, email, password } = {}) {
  const loginOptions = buildLoginOptions(FCAOption);
  const cwd          = process.cwd();

  // Global config credentials are used as a last-resort for Tier 1 only
  const configEmail    = email    || process.env.FB_EMAIL    || global.config?.EMAIL;
  const configPassword = password || process.env.FB_PASSWORD || global.config?.PASSWORD;

  // ── Tier persistence: resume from the last-active tier if known ──────────
  // On crash+restart the watchdog restores Tier 1 cookies, but if the active
  // tier at crash time was 2 or 3 we start there to avoid re-triggering with
  // a known-restricted Tier 1 account.
  const persistedTier = readPersistedTier();
  if (persistedTier > 1) {
    console.log(`[ Login ]: Persisted tier = ${persistedTier} — starting login loop from Tier ${persistedTier}.`);
  }

  // Build an ordered list: [persistedTier, persistedTier+1, ..., 3, 1, 2, ..., persistedTier-1]
  // This ensures we always try the last-known-good tier first, then advance, then wrap around.
  const tiersOrdered = [];
  for (let i = 0; i < TIERS.length; i++) {
    tiersOrdered.push(TIERS[(persistedTier - 1 + i) % TIERS.length]);
  }

  for (const tierInfo of tiersOrdered) {
    const { tier, stateFile, altFile, credsFile } = tierInfo;
    const stateFullPath = join(cwd, stateFile);
    const altFullPath   = join(cwd, altFile);
    const credsFullPath = join(cwd, credsFile);
    const label         = `Tier ${tier}`;

    console.log(`[ Login ]: ── Trying ${label} (${stateFile}) ──`);

    // helper: record success for this tier
    function _recordSuccess(api, method) {
      saveState(stateFullPath, altFullPath, api.getAppState ? api.getAppState() : []);
      global.loginMethod       = method;
      global.activeAccountTier = tier;
      global.activeStateFile   = stateFullPath;
      global.activeAltFile     = altFullPath;
      writePersistedTier(tier);
      return patchCookieApi(api, { tier, stateFile: stateFullPath, altFile: altFullPath, loginMethod: method });
    }

    // ── 1. Try main state file ──────────────────────────────────────
    let result = await tryLoginWithFile(stateFullPath, loginOptions, `${label}/${stateFile}`);

    if (result) {
      const api = _recordSuccess(result.api, "appstate");
      console.log(`[ Login ]: Active account — ${label} via ${stateFile} ✓`);
      return api;
    }

    // ── 2. Try alt file for same tier ──────────────────────────────
    if (existsSync(altFullPath)) {
      console.log(`[ Login ]: ${label} — main file failed, trying alt (${altFile})...`);
      result = await tryLoginWithFile(altFullPath, loginOptions, `${label}/${altFile}`);

      if (result) {
        const api = _recordSuccess(result.api, "appstate-alt");
        console.log(`[ Login ]: Active account — ${label} via ${altFile} (alt) ✓`);
        return api;
      }
    }

    // ── 3. Try creds file for this tier ────────────────────────────
    const fileCreds = readCredsFile(credsFullPath);
    if (fileCreds) {
      console.log(`[ Login ]: ${label} — cookie files failed, trying ${credsFile}...`);
      result = await tryLoginWithCredentials(fileCreds.email, fileCreds.password, loginOptions, `${label}/${credsFile}`);

      if (result) {
        const api = _recordSuccess(result.api, "credentials");
        console.log(`[ Login ]: Active account — ${label} via ${credsFile} ✓`);
        return api;
      }
    }

    // ── 4. Config/env credentials fallback (Tier 1 only) ───────────
    if (tier === 1 && !fileCreds && (configEmail || configPassword)) {
      console.log(`[ Login ]: ${label} — trying ZAO-SETTINGS.json credentials...`);
      result = await tryLoginWithCredentials(configEmail, configPassword, loginOptions, `${label}/config`);

      if (result) {
        const api = _recordSuccess(result.api, "credentials");
        console.log(`[ Login ]: Active account — Tier 1 via ZAO-SETTINGS.json credentials ✓`);
        return api;
      }
    }

    console.log(`[ Login ]: ${label} — all methods failed, moving to next tier...`);
  }

  // All tiers exhausted — clear the persisted tier so next restart tries Tier 1 fresh
  writePersistedTier(1);

  // All tiers exhausted
  console.error(
    "[ Login ]: All account tiers failed.\n" +
    "  → Tier 1: ZAO-STATE.json / alt.json / ZAO-STATEC.json / ZAO-SETTINGS credentials\n" +
    "  → Tier 2: ZAO-STATEX.json / altx.json / ZAO-STATEXC.json\n" +
    "  → Tier 3: ZAO-STATEV.json / altv.json / ZAO-STATEVC.json\n" +
    "  Add valid cookies or a creds file to one of these paths via the panel."
  );
  return null;
};

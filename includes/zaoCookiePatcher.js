"use strict";

/**
 * ZAO Cookie Patcher
 * ===================
 * Patches the FCA API instance after login to:
 *   1. Ensure ALL API features work with cookie-based sessions (not only credentials)
 *   2. Fix overly-aggressive anti-suspension signals that cause false circuit-breaker trips
 *   3. Improve token/cookie refresh for cookie sessions
 *   4. Register awareness of the active account slot for multi-account failover
 *
 * Linked from nkxfcaModernizer.js — called right after the FCA API object is created.
 */

const fs   = require("fs-extra");
const path = require("path");

/**
 * Suspension signal strings that are TOO BROAD and cause false trips.
 * These map normal Facebook API responses / transient network errors to
 * suspension events, which makes the circuit-breaker trip unnecessarily
 * and halts the bot for 45 minutes for no real reason.
 */
const FALSE_POSITIVE_SIGNALS = new Set([
  "something went wrong",
  "please try again later",
  "feature temporarily unavailable",
  "feature temporarily blocked",
  "this content isn't available",
]);

/**
 * After every successful login (cookie or credential), call this to:
 *   - Patch the FCA's internal anti-suspension module
 *   - Ensure getBotInfo / getBotInitialData work with cookie sessions
 *   - Set up proper cookie-persistence callbacks
 *
 * @param {object} api           - The raw FCA API object from nkxfca
 * @param {object} accountInfo   - { tier, stateFile, altFile, email, password }
 * @returns {object}             - The patched api (same reference)
 */
function patchCookieApi(api, accountInfo = {}) {
  if (!api || api.__zaoCookiePatched) return api;

  const log = (msg) => {
    try {
      if (global.loggeryuki) {
        global.loggeryuki.log([
          { message: "[ CookiePatch ]: ", color: ["red", "cyan"] },
          { message: msg, color: "white" }
        ]);
        return;
      }
    } catch (_) {}
    console.log("[CookiePatch]", msg);
  };

  // ── 1. Anti-suspension module patch ───────────────────────────────────────
  // shadowx-fca does not expose an internal antiSuspension singleton, so
  // this step is intentionally skipped. Rate limiting is handled by the
  // modernizer layer (fcaModernizer / nkxfcaModernizer).
  log("Anti-suspension patch skipped (not needed for shadowx-fca) ✓");

  // ── 2. Cookie persistence — save fresh cookies after any successful action ─
  // The FCA refreshes tokens internally. We hook the getAppState method so
  // every time it's called (e.g. by token refresh) we persist to disk too.
  // _persistPending prevents concurrent setImmediate writes from racing each
  // other and corrupting the JSON file when multiple token refreshes fire in
  // the same event-loop tick.
  if (typeof api.getAppState === "function") {
    const originalGetAppState = api.getAppState.bind(api);
    let _persistPending = false;
    api.getAppState = function patchedGetAppState() {
      const state = originalGetAppState();
      if (Array.isArray(state) && state.length > 0 && accountInfo.stateFile && !_persistPending) {
        _persistPending = true;
        setImmediate(() => {
          _persistPending = false;
          try {
            const data = JSON.stringify(state, null, 2);
            fs.writeFileSync(accountInfo.stateFile, data, "utf-8");
            if (accountInfo.altFile) {
              fs.writeFileSync(accountInfo.altFile, data, "utf-8");
            }
          } catch (_) {}
        });
      }
      return state;
    };
  }

  // ── 3. Ensure getBotInfo works with cookie sessions ────────────────────────
  // Some commands call api.getBotInfo(). If the FCA module loaded correctly
  // this should already work, but we add a safe wrapper in case it didn't.
  if (typeof api.getBotInfo !== "function") {
    api.getBotInfo = async function cookieBotInfo() {
      const uid = api.getCurrentUserID ? api.getCurrentUserID() : null;
      if (!uid) return { uid: null };
      try {
        const info = await new Promise((res, rej) => {
          if (typeof api.getUserInfo === "function") {
            api.getUserInfo(uid, (err, data) => {
              if (err) return rej(err);
              res(data && data[uid] ? data[uid] : data);
            });
          } else {
            res({ uid });
          }
        });
        return info || { uid };
      } catch (_) {
        return { uid };
      }
    };
    log("getBotInfo shim installed for cookie session ✓");
  }

  // ── 4. Expose active account tier on the API ───────────────────────────────
  api.__zaoAccountTier     = accountInfo.tier    || 1;
  api.__zaoStateFile       = accountInfo.stateFile;
  api.__zaoAltFile         = accountInfo.altFile;
  api.__zaoLoginMethod     = accountInfo.loginMethod || global.loginMethod || "unknown";

  // ── 5. Fix: ensure setOptions doesn't accidentally disable features ─────────
  // Some calls to setOptions override listenEvents etc. We wrap it to preserve
  // the minimum requirements for cookie-based sessions.
  if (typeof api.setOptions === "function") {
    const originalSetOptions = api.setOptions.bind(api);
    api.setOptions = function patchedSetOptions(opts) {
      const safe = Object.assign({
        listenEvents: true,
        autoReconnect: true,
      }, opts);
      return originalSetOptions(safe);
    };
  }

  api.__zaoCookiePatched = true;
  log(`Cookie patcher active — tier=${api.__zaoAccountTier} method=${api.__zaoLoginMethod} ✓`);
  return api;
}

module.exports = { patchCookieApi, FALSE_POSITIVE_SIGNALS };

"use strict";
const { writeFileSync } = require("fs");
const { join } = require("path");
const login = require("@dongdev/fca-unofficial");
const parseAppState = require("../login/parseAppState");

/**
 * ZAO Login Module
 *
 * Login priority:
 *   1. AppState from ZAO-STATE.json  (JSON array / Token / cookie string / Netscape)
 *      - Validation result is advisory only — FCA always gets to try the cookies
 *   2. Email + Password fallback (if AppState is missing, empty, or rejected by FCA)
 *
 * On a successful credential login, fresh cookies are saved back to
 * ZAO-STATE.json and alt.json for future boots.
 */
module.exports = async function ({ FCAOption = {}, email, password } = {}) {
  const appStatePath = join(
    process.cwd(),
    global.config && global.config.APPSTATEPATH
      ? global.config.APPSTATEPATH
      : "ZAO-STATE.json"
  );

  const userAgent = FCAOption.userAgent || global.config?.FCAOption?.userAgent;

  // ── Step 1: Parse AppState (advisory validation — never blocks FCA) ──
  const parsed = await parseAppState(appStatePath, userAgent);

  if (parsed && Array.isArray(parsed.appState) && parsed.appState.length > 0) {
    const { appState, confident } = parsed;

    if (!confident) {
      console.log("[ Login ]: Cookies could not be pre-validated — trying with FCA anyway...");
    } else {
      console.log("[ Login ]: Session confirmed alive by web check — logging in via AppState...");
    }

    try {
      const api = await login({ appState }, FCAOption);

      // Verify FCA actually returned a working userID
      const uid = api && api.getCurrentUserID ? api.getCurrentUserID() : null;
      if (!uid || uid === "0") {
        throw new Error("FCA returned userID=0 — session is rejected by Facebook.");
      }

      console.log(`[ Login ]: AppState login successful ✓  (uid=${uid})`);
      global.loginMethod = "appstate";

      // Save fresh appState back in case FCA refreshed any tokens
      try {
        const freshState = JSON.stringify(api.getAppState(), null, 2);
        writeFileSync(appStatePath, freshState, "utf-8");
        writeFileSync(join(process.cwd(), "alt.json"), freshState, "utf-8");
      } catch (_) {}

      return api;

    } catch (e) {
      console.error(`[ Login ]: AppState login rejected by FCA: ${e.message || e}`);
      console.log("[ Login ]: Falling back to credentials...");
    }
  } else {
    console.log("[ Login ]: No valid AppState found — falling back to credentials...");
  }

  // ── Step 2: Fallback — email + password ────────────────────────────
  const _email    = email    || global.config?.EMAIL;
  const _password = password || global.config?.PASSWORD;

  if (!_email || !_password) {
    console.error(
      "[ Login ]: No EMAIL/PASSWORD configured in ZAO-SETTINGS.json.\n" +
      "           → Set them using the .setaccount command or edit ZAO-SETTINGS.json directly."
    );
    return null;
  }

  console.log(`[ Login ]: Attempting credentials login for ${_email}...`);

  try {
    const api = await login({ email: _email, password: _password }, FCAOption);

    const uid = api && api.getCurrentUserID ? api.getCurrentUserID() : null;
    if (!uid || uid === "0") {
      throw new Error("Credentials login returned userID=0 — Facebook may have blocked the login.");
    }

    // Save fresh cookies so next boot uses AppState
    try {
      const freshState = JSON.stringify(api.getAppState(), null, 2);
      writeFileSync(appStatePath, freshState, "utf-8");
      writeFileSync(join(process.cwd(), "alt.json"), freshState, "utf-8");
      console.log("[ Login ]: Credentials login successful — new cookies saved to ZAO-STATE.json & alt.json ✓");
    } catch (saveErr) {
      console.error(`[ Login ]: Warning: Could not save new cookies: ${saveErr.message}`);
    }

    global.loginMethod = "credentials";
    return api;

  } catch (e) {
    console.error(`[ Login ]: Credentials login also failed: ${e.message || e}`);
    return null;
  }
};

const { readFileSync, existsSync } = require("fs-extra");
const checkLiveCookie = require("./checkLiveCookie");
const getFbstate = require("./getFbstate");

/**
 * Filters an AppState array down to the essential Facebook session cookies.
 */
function filterKeysAppState(appState) {
  const ESSENTIAL = ["c_user", "xs", "datr", "fr", "sb", "i_user"];
  const filtered = appState.filter(c => ESSENTIAL.includes(c.key));
  // If filtering removes everything (unusual format), return the full array
  return filtered.length > 0 ? filtered : appState;
}

function isNetscapeCookie(str) {
  if (typeof str !== "string") return false;
  return /(.+)\t(1|TRUE|true)\t([\w\/.-]*)\t(1|TRUE|true)\t\d+\t([\w-]+)\t(.+)/i.test(str);
}

function netscapeToAppState(raw) {
  const result = [];
  for (const line of raw.split("\n")) {
    if (line.trim().startsWith("#") || !line.trim()) continue;
    const parts = line.split("\t").map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length < 7) continue;
    result.push({
      key: parts[5],
      value: parts[6],
      domain: parts[0],
      path: parts[2],
      hostOnly: parts[1] === "TRUE",
      creation: new Date(parseInt(parts[4]) * 1000).toISOString(),
      lastAccessed: new Date().toISOString()
    });
  }
  return result;
}

function normaliseAppStateArray(arr) {
  if (arr.some(c => c.name)) {
    arr = arr.map(c => { c.key = c.name; delete c.name; return c; });
  }
  return arr
    .map(c => ({
      ...c,
      domain: c.domain || "facebook.com",
      path: c.path || "/",
      hostOnly: c.hostOnly ?? false,
      creation: c.creation || new Date().toISOString(),
      lastAccessed: new Date().toISOString()
    }))
    .filter(c => c.key && c.value && c.key !== "x-referer");
}

/**
 * Reads and parses the AppState from ZAO-STATE.json (or a custom path).
 *
 * Validation is ADVISORY — if the live-cookie check returns false the
 * parsed array is still returned so the FCA library can make its own
 * determination.  Only null is returned when the file cannot be read or
 * parsed at all.
 *
 * @param {string} appStatePath
 * @param {string} [userAgent]
 * @returns {Promise<{appState: Array, confident: boolean}|null>}
 *   null  = file missing / unreadable / empty / parse error
 *   object with appState array and confident=true/false
 */
module.exports = async function parseAppState(appStatePath, userAgent) {
  if (!existsSync(appStatePath)) {
    console.log("[ Login ]: AppState file not found — skipping cookie login.");
    return null;
  }

  let raw;
  try {
    raw = readFileSync(appStatePath, "utf-8").trim();
  } catch (e) {
    console.error(`[ Login ]: Could not read AppState file: ${e.message}`);
    return null;
  }

  if (!raw) {
    console.log("[ Login ]: AppState file is empty.");
    return null;
  }

  let appState = [];

  try {
    // ── Format 1: Access Token (EAAAA...) ──────────────────────────
    if (raw.startsWith("EAAAA")) {
      console.log("[ Login ]: Detected Access Token format — converting to cookies...");
      try {
        appState = await getFbstate(raw);
        console.log("[ Login ]: Access Token converted successfully.");
      } catch (e) {
        console.error(`[ Login ]: Access Token conversion failed: ${e.message}`);
        return null;
      }
    }

    // ── Format 2: Cookie string (key=value; key2=value2) ───────────
    else if (/^[\w-]+=/.test(raw) && raw.includes("=") && !raw.startsWith("[") && !raw.startsWith("{")) {
      console.log("[ Login ]: Detected cookie string format.");
      appState = raw
        .split(";")
        .map(part => {
          const eqIdx = part.indexOf("=");
          if (eqIdx === -1) return null;
          return {
            key:   part.slice(0, eqIdx).trim(),
            value: part.slice(eqIdx + 1).trim(),
            domain: "facebook.com",
            path: "/",
            hostOnly: true,
            creation: new Date().toISOString(),
            lastAccessed: new Date().toISOString()
          };
        })
        .filter(c => c && c.key && c.value && c.key !== "x-referer");
    }

    // ── Format 3: Netscape / EditThisCookie tab-separated ──────────
    else if (isNetscapeCookie(raw)) {
      console.log("[ Login ]: Detected Netscape cookie format.");
      appState = netscapeToAppState(raw);
    }

    // ── Format 4: JSON array ────────────────────────────────────────
    else {
      console.log("[ Login ]: Detected JSON array format.");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        console.error(`[ Login ]: AppState JSON is malformed: ${e.message}`);
        return null;
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.error("[ Login ]: AppState JSON is not a valid array or is empty.");
        return null;
      }
      appState = normaliseAppStateArray(parsed);
    }

    if (!appState || appState.length === 0) {
      console.error("[ Login ]: Parsed AppState is empty — cannot login.");
      return null;
    }

    // ── Advisory validation — does NOT block the login attempt ──────
    console.log("[ Login ]: Validating cookie against Facebook...");
    const cookieStr = appState.map(c => `${c.key}=${c.value}`).join("; ");
    const validationResult = await checkLiveCookie(cookieStr, userAgent);

    if (validationResult === true) {
      console.log("[ Login ]: Cookie validation PASSED — session confirmed alive ✓");
      return { appState: filterKeysAppState(appState), confident: true };
    } else if (validationResult === false) {
      console.warn("[ Login ]: Cookie validation FAILED — session appears dead. Passing to FCA for final check...");
      return { appState: filterKeysAppState(appState), confident: false };
    } else {
      // null = uncertain (network error, 404, etc.) — don't reject the cookie
      console.warn("[ Login ]: Cookie validation UNCERTAIN (network issue) — passing to FCA for final check...");
      return { appState: filterKeysAppState(appState), confident: false };
    }

  } catch (e) {
    console.error(`[ Login ]: Unexpected error while parsing AppState: ${e.message}`);
    return null;
  }
};

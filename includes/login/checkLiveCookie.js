const axios = require("axios");

/**
 * Validates a Facebook session by attempting to load a user-specific page.
 *
 * Strategy:
 *   1. Hit mbasic.facebook.com root — if redirected to /login, session is dead.
 *   2. Fallback: hit www.facebook.com/home.php — same logic.
 *   3. If both network requests fail for non-auth reasons (e.g. 404, timeout),
 *      return null ("uncertain") so the caller can still try the cookie with FCA.
 *
 * @param {string} cookie     Cookie string "c_user=123; xs=456; ..."
 * @param {string} [userAgent]
 * @returns {Promise<boolean|null>}
 *   true  = session is confirmed alive
 *   false = session is confirmed dead (got a login redirect)
 *   null  = uncertain — network error, let FCA decide
 */
module.exports = async function checkLiveCookie(cookie, userAgent) {
  const UA = userAgent ||
    "Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Mobile Safari/537.36";

  const DEAD_SIGNALS = [
    'id="login_form"',
    'id="loginbutton"',
    'action="/login/device-based/regular/login/',
    "/login/?next=",
    "/login/identify",
    "You must log in to continue"
  ];

  const ALIVE_SIGNALS = [
    "/messages/",
    "/notifications/",
    'href="/profile.php',
    'content="fb://',
    "mbasic_logout_button",
    "/logout.php",
    "userLink"
  ];

  async function tryUrl(url) {
    try {
      const resp = await axios({
        url,
        method: "GET",
        maxRedirects: 5,
        timeout: 12000,
        headers: {
          cookie,
          "user-agent": UA,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "upgrade-insecure-requests": "1"
        },
        validateStatus: () => true
      });

      const html = String(resp.data || "");
      const finalUrl = String(resp.request?.res?.responseUrl || resp.config?.url || url);

      // If the final URL after redirects contains /login → dead
      if (/\/login[/?]/.test(finalUrl)) return false;

      // Check body for dead signals
      if (DEAD_SIGNALS.some(s => html.includes(s))) return false;

      // Check body for alive signals
      if (ALIVE_SIGNALS.some(s => html.includes(s))) return true;

      // Got a 200 with no recognisable signals — treat as alive if status is 200
      if (resp.status === 200) return true;

      // Status 4xx/5xx with no dead signals — uncertain
      return null;
    } catch (e) {
      // Network error (ECONNREFUSED, ETIMEDOUT, etc.) — uncertain
      return null;
    }
  }

  // Try mbasic root first (most lightweight)
  const r1 = await tryUrl("https://mbasic.facebook.com/");
  if (r1 === true)  return true;
  if (r1 === false) return false;

  // Fallback: home.php
  const r2 = await tryUrl("https://www.facebook.com/home.php");
  if (r2 === true)  return true;
  if (r2 === false) return false;

  // Both returned uncertain — cannot determine
  return null;
};

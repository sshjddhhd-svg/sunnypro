let started = false;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function log(msg) {
  const now = new Date().toLocaleTimeString("en-GB", { hour12: false });
  console.log(`\x1b[36m[ KEEPALIVE ]\x1b[0m ${now} → ${msg}`);
}

module.exports = function startKeepalive(api) {
  if (started) return;
  started = true;

  function schedulePing() {
    const delayMs = randomInt(8, 18) * 60 * 1000;
    setTimeout(async () => {
      try {
        await new Promise((resolve, reject) => {
          api.httpGet("https://www.facebook.com/", (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        log("Ping OK");
      } catch (e) {
        log("Ping failed: " + (e && e.message ? e.message : e));
      }
      schedulePing();
    }, delayMs);
  }

  function scheduleNotificationVisit() {
    const delayMs = randomInt(30, 120) * 60 * 1000;
    setTimeout(async () => {
      try {
        const botID = api.getCurrentUserID();
        const form = {
          av: botID,
          fb_api_req_friendly_name: "CometNotificationsDropdownQuery",
          fb_api_caller_class: "RelayModern",
          doc_id: "5025284284225032",
          variables: JSON.stringify({
            count: 5,
            environment: "MAIN_SURFACE",
            menuUseEntryPoint: true,
            scale: 1
          })
        };
        await new Promise((resolve, reject) => {
          api.httpPost("https://www.facebook.com/api/graphql/", form, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        log("Notification tab visited OK");
      } catch (e) {
        log("Notification visit failed: " + (e && e.message ? e.message : e));
      }
      scheduleNotificationVisit();
    }, delayMs);
  }

  schedulePing();
  scheduleNotificationVisit();
  log("Started — ping every 8-18 min, notifications every 30-120 min");
};

module.exports.config = {
 name: "antiout",
 eventType: ["log:unsubscribe"],
 version: "0.0.1",
 credits: "DungUwU",
 description: "Listen events"
};

/**
 * [FIX Djamel] — This handler is superseded by ADMINATEK.js (name: "0antiout_0"),
 * which is the upgraded version with per-user cooldown, duplicate-add protection,
 * and Map-size pruning.
 *
 * BOTH handlers subscribed to "log:unsubscribe" and both checked data.antiout,
 * causing TWO simultaneous api.addUserToGroup calls for every leave event.
 * The second call would hit Facebook's rate limits and risk temp-banning the bot.
 * This handler is disabled here; all antiout logic lives in ADMINATEK.js.
 */
module.exports.run = async({ event, api, Threads, Users }) => {
 return;
};

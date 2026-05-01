/**
 * commandErrorBudget.js
 *
 * Tracks unhandled errors per command name in a 10-minute rolling window.
 * If a single command throws more than `THRESHOLD` times within `WINDOW_MS`
 * it is auto-tripped: the dispatcher will silently skip it for one hour and
 * notify the bot admins so the operator can investigate or fix the command.
 *
 * Tripping is in-memory only — a process restart clears all state, which
 * matches the intent (a restart is the natural "I fixed it" signal).
 */

const WINDOW_MS         = 10 * 60 * 1000;
const THRESHOLD         = 5;
const TRIP_DURATION_MS  = 60 * 60 * 1000;

const errorTimes = new Map(); // commandName -> number[] (timestamps)
const tripped    = new Map(); // commandName -> untripAt (ms epoch)
const notifiedAt = new Map(); // commandName -> last notify ms (rate-limit notifications)

function _logger() { try { return require('../utils/log.js'); } catch (_) { return null; } }

function _api() {
  try {
    if (global.api) return global.api;
    if (global.client && global.client.api) return global.client.api;
  } catch (_) {}
  return null;
}

function _notifyAdmins(name, count, untilAt) {
  try {
    const api = _api();
    const admins = (global.config && global.config.ADMINBOT) || [];
    if (!api || !admins.length) return;
    // Don't spam admins more than once per hour for the same command
    const last = notifiedAt.get(name) || 0;
    if (Date.now() - last < TRIP_DURATION_MS) return;
    notifiedAt.set(name, Date.now());
    const until = new Date(untilAt).toLocaleTimeString();
    const msg =
      `⚠️ ميزانية أخطاء الأمر\n\n` +
      `الأمر: ${name}\n` +
      `الأخطاء: ${count} خطأ خلال 10 دقائق\n` +
      `تم تعطيله مؤقتاً حتى: ${until}\n\n` +
      `راجع سجلات [ CMD-PROMISE ] أو [ SANDBOX ] لمعرفة السبب.`;
    for (const adminID of admins) {
      const id = String(adminID).trim();
      if (!id) continue;
      try { api.sendMessage(msg, id, () => {}); } catch (_) {}
    }
  } catch (_) {}
}

function record(name, err) {
  if (!name) return;
  const now = Date.now();
  let arr = errorTimes.get(name) || [];
  arr = arr.filter(t => now - t < WINDOW_MS);
  arr.push(now);
  errorTimes.set(name, arr);

  if (arr.length >= THRESHOLD && !tripped.has(name)) {
    const untilAt = now + TRIP_DURATION_MS;
    tripped.set(name, untilAt);
    const log = _logger();
    if (log) {
      log.log([
        { message: '[ ERR-BUDGET ]: ', color: ['red', 'cyan'] },
        { message:
          `Command "${name}" tripped — ${arr.length} errors in ` +
          `${Math.round(WINDOW_MS / 60000)} min. Disabled until ` +
          `${new Date(untilAt).toLocaleTimeString()}.` +
          (err && err.message ? ` Last error: ${String(err.message).slice(0, 200)}` : ''),
          color: 'white' }
      ]);
    }
    _notifyAdmins(name, arr.length, untilAt);
  }
}

function isTripped(name) {
  if (!name) return false;
  const t = tripped.get(name);
  if (!t) return false;
  if (Date.now() >= t) {
    tripped.delete(name);
    errorTimes.delete(name);
    notifiedAt.delete(name);
    const log = _logger();
    if (log) {
      log.log([
        { message: '[ ERR-BUDGET ]: ', color: ['red', 'cyan'] },
        { message: `Command "${name}" cooldown over — re-enabled.`, color: 'white' }
      ]);
    }
    return false;
  }
  return true;
}

function reset(name) {
  if (name) {
    errorTimes.delete(name);
    tripped.delete(name);
    notifiedAt.delete(name);
  } else {
    errorTimes.clear();
    tripped.clear();
    notifiedAt.clear();
  }
}

function getStatus() {
  const out = {};
  const now = Date.now();
  const seen = new Set([...errorTimes.keys(), ...tripped.keys()]);
  for (const n of seen) {
    const arr = (errorTimes.get(n) || []).filter(t => now - t < WINDOW_MS);
    out[n] = {
      errorsInWindow: arr.length,
      tripped: tripped.has(n),
      untilAt: tripped.get(n) || null
    };
  }
  return out;
}

module.exports = {
  record, isTripped, reset, getStatus,
  WINDOW_MS, THRESHOLD, TRIP_DURATION_MS
};

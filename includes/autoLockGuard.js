/**
 * autoLockGuard.js
 *
 * Anti-raid / anti-spam auto-locker.
 *
 * Watches non-admin command attempts in a rolling time window. If the count
 * crosses the configured threshold, flips `global.lockBot = true` so the
 * existing lockBot check in handleCommand.js silently drops every non-admin
 * command (admins are unaffected because handleCommand exempts ADMINBOT IDs).
 *
 * The lock auto-clears after `unlockAfterMinutes` (set 0 to require manual
 * unlock via the panel `/bot/lock` endpoint or a process restart).
 *
 * Config block in ZAO-SETTINGS.json (autoLock):
 *   enable             — master switch (default true)
 *   maxCommands        — threshold inside the window (default 15)
 *   windowSeconds      — sliding window length (default 30)
 *   unlockAfterMinutes — auto-unlock delay; 0 = stay locked (default 10)
 *   notifyAdmins       — push a Telegram/Discord alert via notiWhenListenError
 *
 * The module never throws upward — every callsite is `try { record(); } catch {}`
 * safe by construction.
 */

const _attempts = [];          // array of { ts, sender }
let   _lockedAt   = 0;         // timestamp the bot was auto-locked at (0 = not locked by us)
let   _unlockTimer = null;

function _cfg() {
  const c = (global.config && global.config.autoLock) || {};
  return {
    enable:             c.enable !== false,
    maxCommands:        Number.isFinite(c.maxCommands)        ? c.maxCommands        : 15,
    windowSeconds:      Number.isFinite(c.windowSeconds)      ? c.windowSeconds      : 30,
    unlockAfterMinutes: Number.isFinite(c.unlockAfterMinutes) ? c.unlockAfterMinutes : 10,
    notifyAdmins:       c.notifyAdmins !== false
  };
}

function _log(msg, color) {
  try {
    if (global.loggeryuki && typeof global.loggeryuki.log === 'function') {
      global.loggeryuki.log([
        { message: '[ AUTO-LOCK ]: ', color: ['red', 'cyan'] },
        { message: String(msg), color: color || 'white' }
      ]);
    } else {
      console.log(`[AUTO-LOCK] ${msg}`);
    }
  } catch (_) {}
}

function _prune(now, windowMs) {
  // Drop entries older than the window. Array stays small (≤ a few hundred).
  while (_attempts.length && (now - _attempts[0].ts) > windowMs) {
    _attempts.shift();
  }
}

function _scheduleUnlock(unlockMinutes) {
  if (_unlockTimer) { try { clearTimeout(_unlockTimer); } catch (_) {} _unlockTimer = null; }
  if (unlockMinutes <= 0) return;          // 0 = manual unlock only
  _unlockTimer = setTimeout(() => {
    if (global.lockBot === true && _lockedAt > 0) {
      global.lockBot = false;
      _lockedAt = 0;
      _attempts.length = 0;
      _log(`Auto-unlocked after ${unlockMinutes} min — bot is open again.`, 'green');
    }
    _unlockTimer = null;
  }, unlockMinutes * 60 * 1000);
  // Don't keep the event loop alive just for this timer.
  if (typeof _unlockTimer.unref === 'function') _unlockTimer.unref();
}

function _trigger(cfg, count) {
  // Already locked by something else (e.g. manual via panel) — don't override.
  if (global.lockBot === true && _lockedAt === 0) {
    _log(`Threshold reached (${count}) but bot was already locked manually — leaving as-is.`);
    _attempts.length = 0;
    return;
  }
  if (global.lockBot === true) return;     // already auto-locked, nothing to do

  global.lockBot = true;
  _lockedAt = Date.now();
  _attempts.length = 0;

  const tail = cfg.unlockAfterMinutes > 0
    ? `auto-unlock in ${cfg.unlockAfterMinutes} min`
    : 'manual unlock required (panel POST /bot/lock {value:false})';
  _log(`LOCKED — ${count} non-admin commands in ${cfg.windowSeconds}s — ${tail}`, 'red');

  if (cfg.notifyAdmins) {
    try {
      const noti = require('./notiWhenListenError');
      if (noti && typeof noti.notify === 'function') {
        const fakeErr = new Error(`Auto-lock triggered: ${count} non-admin commands in ${cfg.windowSeconds}s`);
        noti.notify(fakeErr, 'auto-lock raid guard');
      }
    } catch (_) {}
  }

  _scheduleUnlock(cfg.unlockAfterMinutes);
}

/**
 * Record a single non-admin command attempt.
 * Call from handleCommand AFTER the prefix + command-name parse but
 * BEFORE the heavy work (perm check, cooldown, command.run).
 *
 * @param {string} senderID  the user's Facebook ID (already known to be non-admin)
 */
function record(senderID) {
  const cfg = _cfg();
  if (!cfg.enable) return;
  if (cfg.maxCommands <= 0 || cfg.windowSeconds <= 0) return;

  const now = Date.now();
  const windowMs = cfg.windowSeconds * 1000;

  _prune(now, windowMs);
  _attempts.push({ ts: now, sender: String(senderID || '?') });

  if (_attempts.length >= cfg.maxCommands) {
    _trigger(cfg, _attempts.length);
  }
}

/**
 * Manual control. Flips `global.lockBot` and clears any pending auto-unlock
 * timer. Used by the panel endpoint and could be called from anywhere.
 *
 * @param {boolean} value  true = lock, false = unlock
 * @param {string=} reason optional human-readable reason for the log
 */
function setLock(value, reason) {
  const v = value === true;
  global.lockBot = v;
  // [FIX] Always cancel any pending auto-unlock when the lock state is
  // changed manually. Even though the timer's own guard (`_lockedAt > 0`)
  // currently prevents an erroneous unlock, leaving a stale handle alive
  // wastes a slot and races with future _scheduleUnlock() calls.
  if (_unlockTimer) { try { clearTimeout(_unlockTimer); } catch (_) {} _unlockTimer = null; }
  if (!v) {
    _attempts.length = 0;
    _lockedAt = 0;
    _log(`Manual UNLOCK${reason ? ` (${reason})` : ''} — bot is open again.`, 'green');
  } else {
    _lockedAt = 0;          // 0 because this is a manual lock, not ours
    _log(`Manual LOCK${reason ? ` (${reason})` : ''}.`, 'yellow');
  }
}

/** Panel/diagnostics helper. */
function status() {
  const cfg = _cfg();
  const now = Date.now();
  _prune(now, cfg.windowSeconds * 1000);
  return {
    enabled:           cfg.enable,
    locked:            global.lockBot === true,
    autoLocked:        _lockedAt > 0,
    lockedAt:          _lockedAt || null,
    recentAttempts:    _attempts.length,
    maxCommands:       cfg.maxCommands,
    windowSeconds:     cfg.windowSeconds,
    unlockAfterMinutes: cfg.unlockAfterMinutes
  };
}

module.exports = { record, setLock, status };

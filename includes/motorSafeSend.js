"use strict";

let globalActiveSends = 0;
const sendQueue = [];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function pickJitter(baseMs) {
  const jitterPct = 0.18;
  const delta = baseMs * jitterPct;
  return Math.max(1000, Math.floor(baseMs + (Math.random() * 2 - 1) * delta));
}

function shouldDisableOnThreadError(errStr) {
  const s = String(errStr || "").toLowerCase();
  return (
    s.includes("no message_thread") ||
    s.includes("thread may not exist") ||
    s.includes("access may be restricted") ||
    s.includes("not a participant") ||
    // "not found" alone is far too broad — Facebook returns it for missing
    // stickers, users, and temporary server errors that are totally transient.
    // Only treat it as fatal when it clearly refers to the thread itself.
    (s.includes("not found") && (s.includes("thread") || s.includes("conversation") || s.includes("inbox")))
  );
}

function isRateLimited(errStr) {
  const s = String(errStr || "").toLowerCase();
  return (
    s.includes("too many requests") ||
    (s.includes("rate") && s.includes("limit")) ||
    s.includes("temporarily blocked") ||
    s.includes("spam")
  );
}

async function acquireSendSlot() {
  const max = global.config?.nkxModern?.maxSendConcurrency || 2;
  if (globalActiveSends < max) {
    globalActiveSends++;
    return;
  }
  await new Promise(resolve => sendQueue.push(resolve));
  globalActiveSends++;
}

function releaseSendSlot() {
  globalActiveSends = Math.max(0, globalActiveSends - 1);
  const next = sendQueue.shift();
  if (next) next();
}

async function preSendEvasion(threadID) {
  try {
    const anti = require("./antiSuspension");
    if (anti && typeof anti.fullEvasionSequence === "function") {
      await anti.fullEvasionSequence(threadID, "");
    }
  } catch (_) {}

  try {
    const stealth = require("./stealthEngine");
    if (stealth?.globalStealthEngine?.isBurstCooldown?.(threadID)) {
      await sleep(2500 + Math.floor(Math.random() * 3500));
    }
  } catch (_) {}
}

// Track active loops per thread so we can guarantee a single live loop
// even after restarts/restored state (prevents duplicate-send → ban).
// Each entry: { stop, lastSentAt, nextSendAt }
const _activeLoops = new Map();

function scheduleMotorLoop({ api, threadID, getData, onDisable }) {
  // Hard guarantee: only ONE live loop per threadID at any time.
  const prev = _activeLoops.get(threadID);
  if (prev && typeof prev.stop === "function") {
    try { prev.stop(); } catch (_) {}
    _activeLoops.delete(threadID);
  }

  let stopped = false;
  let backoffMs = 0;
  let pendingTimer = null;
  let consecutiveErrors = 0;
  let lastSentAt = null;
  let nextSendAt = null;

  function clearPending() {
    if (pendingTimer) {
      try { clearTimeout(pendingTimer); } catch (_) {}
      pendingTimer = null;
    }
    try {
      const d = getData();
      if (d && d.interval) {
        try { clearTimeout(d.interval); } catch (_) {}
        try { clearInterval(d.interval); } catch (_) {}
        d.interval = null;
      }
    } catch (_) {}
  }

  function isStopped() {
    if (stopped) return true;
    const d = getData();
    if (!d || d.status !== true || !d.message || !d.time) return true;
    return false;
  }

  function _cleanupHandle() {
    if (_activeLoops.get(threadID) === handle) _activeLoops.delete(threadID);
  }

  async function tick() {
    if (isStopped()) { _cleanupHandle(); return; }

    const data = getData();
    const shouldSend = typeof data.shouldSend === "function" ? data.shouldSend : null;

    let delay;
    if (backoffMs > 0) {
      delay = backoffMs;
    } else if (data.randomTime && data.randomRange &&
               Number.isFinite(data.randomRange.min) && Number.isFinite(data.randomRange.max) &&
               data.randomRange.max >= data.randomRange.min) {
      const lo = Math.max(1000, data.randomRange.min);
      const hi = Math.max(lo, data.randomRange.max);
      delay = lo + Math.floor(Math.random() * (hi - lo + 1));
    } else {
      const base = Math.max(5000, Number(data.time) || 0);
      delay = pickJitter(base);
    }

    // Record when the next send is expected so callers can display it.
    nextSendAt = Date.now() + delay;
    if (handle) handle.nextSendAt = nextSendAt;

    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      nextSendAt = null;
      if (handle) handle.nextSendAt = null;
      if (isStopped()) { _cleanupHandle(); return; }

      try {
        // Always prefer the freshest API reference so reconnects are transparent.
        const botApi = global._botApi || api;
        if (!botApi) return;

        if (shouldSend && shouldSend() === false) {
          backoffMs = 0;
          return;
        }

        await preSendEvasion(threadID);

        if (isStopped()) return;

        await acquireSendSlot();
        try {
          if (isStopped()) return;
          const p = botApi.sendMessage(data.message, threadID);
          if (p && typeof p.then === "function") await p;
        } finally {
          releaseSendSlot();
        }

        // Successful send — record timing and reset error tracking.
        lastSentAt = Date.now();
        if (handle) handle.lastSentAt = lastSentAt;
        backoffMs = 0;
        consecutiveErrors = 0;
      } catch (e) {
        const errStr = String(e && (e.message || e));
        consecutiveErrors++;

        if (shouldDisableOnThreadError(errStr)) {
          stopped = true;
          clearPending();
          data.status = false;
          _activeLoops.delete(threadID);
          if (typeof onDisable === "function") onDisable(errStr);
          return;
        }

        if (isRateLimited(errStr)) {
          // Cap at 5 minutes so the motor never appears dead for too long.
          const next = backoffMs > 0 ? Math.min(backoffMs * 2, 5 * 60 * 1000) : 2 * 60 * 1000;
          backoffMs = next;
        } else {
          // Generic error — cap at 3 minutes. If errors keep coming,
          // reset backoff after 10 consecutive failures so the loop
          // keeps retrying instead of silently waiting forever.
          if (consecutiveErrors >= 10) {
            backoffMs = 30 * 1000;
            consecutiveErrors = 0;
          } else {
            const next = backoffMs > 0 ? Math.min(backoffMs * 1.5, 3 * 60 * 1000) : 30 * 1000;
            backoffMs = Math.floor(next + Math.random() * 5000);
          }
        }
      } finally {
        if (!isStopped()) tick();
        else _cleanupHandle();
      }
    }, delay);

    // Mirror the timer handle on data so legacy stop paths still work.
    try { const d = getData(); if (d) d.interval = pendingTimer; } catch (_) {}
  }

  const handle = {
    stop: () => {
      stopped = true;
      clearPending();
      _activeLoops.delete(threadID);
    },
    lastSentAt: null,
    nextSendAt: null
  };
  _activeLoops.set(threadID, handle);

  tick();

  return handle;
}

function stopMotorLoop(threadID) {
  const h = _activeLoops.get(threadID);
  if (h && typeof h.stop === "function") {
    try { h.stop(); } catch (_) {}
  }
  _activeLoops.delete(threadID);
}

function stopAllMotorLoops() {
  for (const [tid, h] of _activeLoops.entries()) {
    try { h.stop(); } catch (_) {}
    _activeLoops.delete(tid);
  }
}

// Returns true if a live loop is registered for the given threadID.
// Used by the watchdog in engine.js / motor2.js.
function isActiveLoop(threadID) {
  return _activeLoops.has(String(threadID));
}

// Returns timing stats for a thread's loop, or null if no loop is active.
// { lastSentAt: number|null, nextSendAt: number|null }
function getLoopStats(threadID) {
  const h = _activeLoops.get(String(threadID));
  if (!h) return null;
  return { lastSentAt: h.lastSentAt || null, nextSendAt: h.nextSendAt || null };
}

module.exports = { scheduleMotorLoop, stopMotorLoop, stopAllMotorLoops, isActiveLoop, getLoopStats };

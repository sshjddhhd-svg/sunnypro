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
    s.includes("not found")
  );
}

function isRateLimited(errStr) {
  const s = String(errStr || "").toLowerCase();
  return (
    s.includes("too many requests") ||
    s.includes("rate") && s.includes("limit") ||
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
const _activeLoops = new Map(); // threadID -> { stop }

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
    // Honor user-driven stop via state flags
    const d = getData();
    if (!d || d.status !== true || !d.message || !d.time) return true;
    return false;
  }

  async function tick() {
    if (isStopped()) return;

    const data = getData();
    const shouldSend = typeof data.shouldSend === "function" ? data.shouldSend : null;

    const base = Math.max(5000, Number(data.time) || 0);
    const delay = backoffMs > 0 ? backoffMs : pickJitter(base);

    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      if (isStopped()) return;

      try {
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

        backoffMs = 0;
      } catch (e) {
        const errStr = String(e && (e.message || e));

        if (shouldDisableOnThreadError(errStr)) {
          stopped = true;
          clearPending();
          data.status = false;
          _activeLoops.delete(threadID);
          if (typeof onDisable === "function") onDisable(errStr);
          return;
        }

        if (isRateLimited(errStr)) {
          const next = backoffMs > 0 ? Math.min(backoffMs * 2, 30 * 60 * 1000) : 2 * 60 * 1000;
          backoffMs = next;
        } else {
          const next = backoffMs > 0 ? Math.min(backoffMs * 1.5, 10 * 60 * 1000) : 30 * 1000;
          backoffMs = Math.floor(next + Math.random() * 5000);
        }
      } finally {
        if (!isStopped()) tick();
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
    }
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

module.exports = { scheduleMotorLoop, stopMotorLoop, stopAllMotorLoops };

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

function scheduleMotorLoop({ api, threadID, getData, onDisable }) {
  let stopped = false;
  let backoffMs = 0;

  async function tick() {
    if (stopped) return;

    const data = getData();
    if (!data || !data.status || !data.message || !data.time) {
      return;
    }

    const shouldSend = typeof data.shouldSend === "function" ? data.shouldSend : null;

    const base = Math.max(5000, Number(data.time) || 0);
    const delay = backoffMs > 0 ? backoffMs : pickJitter(base);

    data.interval = setTimeout(async () => {
      if (stopped) return;

      try {
        const botApi = global._botApi || api;
        if (!botApi) return;

        if (shouldSend && shouldSend() === false) {
          backoffMs = 0;
          return;
        }

        await preSendEvasion(threadID);

        await acquireSendSlot();
        try {
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
          try { if (data.interval) clearTimeout(data.interval); } catch (_) {}
          data.interval = null;
          data.status = false;
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
        tick();
      }
    }, delay);
  }

  tick();

  return {
    stop: () => {
      stopped = true;
      try {
        const d = getData();
        if (d?.interval) clearTimeout(d.interval);
      } catch (_) {}
    }
  };
}

module.exports = { scheduleMotorLoop };

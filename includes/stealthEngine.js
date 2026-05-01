"use strict";

/**
 * stealthEngine.js — Custom stealth layer for ZAO
 * 
 * Features:
 *  - Burst protection: throttles responses when many messages arrive rapidly
 *  - Night-mode awareness: quieter behavior during configured night hours
 *  - Read-receipt randomization: delays/randomizes autoMarkRead timing
 *  - Per-thread response jitter: each thread gets unique response timing
 *  - Session fingerprint lock: keeps headers consistent per session
 */

const MODERN_USER_AGENTS = [
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    platform: '"Windows"'
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="125", "Google Chrome";v="125", "Not-A.Brand";v="99"',
    platform: '"Windows"'
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    platform: '"macOS"'
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    secChUa: '',
    platform: '"Windows"'
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
    secChUa: '',
    platform: '"macOS"'
  }
];

function getCfg() {
  return global.config?.stealthMode || {};
}

function isNightMode() {
  const cfg = getCfg();
  if (!cfg.enabled || !cfg.nightModeSlowdown) return false;
  const hour  = new Date().getHours();
  const start = cfg.nightModeStart ?? 1;
  const end   = cfg.nightModeEnd   ?? 6;
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

// Stale-entry eviction: any thread that had no burst activity within this
// window (15 min) is safe to remove from the counter and jitter Maps.
const _MAP_PRUNE_INTERVAL_MS = 5 * 60 * 1000;   // run prune every 5 min
const _MAP_STALE_AGE_MS      = 15 * 60 * 1000;  // entries older than 15 min

class StealthEngine {
  constructor() {
    this._burstCounters   = new Map();
    this._burstCooldowns  = new Map();
    this._threadJitter    = new Map();
    this._fingerprint     = null;
    this._lockFingerprint();
    this._startPruner();
  }

  _startPruner() {
    // [FIX M1] — store the handle on the instance so stop() can cancel it.
    // Previously the timer was stored in a local `timer` variable that went
    // out of scope immediately, making the interval impossible to cancel and
    // causing it to outlive any engine instance that was replaced or disabled.
    this._prunerTimer = setInterval(() => {
      try {
        const now    = Date.now();
        const cutoff = now - _MAP_STALE_AGE_MS;
        // Remove threads whose last burst stamp is older than the stale window
        for (const [key, entry] of this._burstCounters.entries()) {
          const lastStamp = Array.isArray(entry.stamps) && entry.stamps.length
            ? entry.stamps[entry.stamps.length - 1]
            : (entry.windowStart || 0);
          if (lastStamp < cutoff) {
            this._burstCounters.delete(key);
            this._threadJitter.delete(key);
          }
        }
        // Also evict expired cooldown entries that were never queried
        for (const [key, until] of this._burstCooldowns.entries()) {
          if (now >= until) this._burstCooldowns.delete(key);
        }
        // Evict jitter entries for threads not seen in burstCounters at all
        for (const key of this._threadJitter.keys()) {
          if (!this._burstCounters.has(key)) this._threadJitter.delete(key);
        }
      } catch (_) {}
    }, _MAP_PRUNE_INTERVAL_MS);
    // Don't hold the event loop open for this housekeeping timer
    if (typeof this._prunerTimer.unref === 'function') this._prunerTimer.unref();
  }

  /** Stop all background timers — call this before discarding the engine instance. */
  stop() {
    if (this._prunerTimer) {
      clearInterval(this._prunerTimer);
      this._prunerTimer = null;
    }
  }

  _lockFingerprint() {
    if (this._fingerprint) return this._fingerprint;
    const pick = MODERN_USER_AGENTS[Math.floor(Math.random() * MODERN_USER_AGENTS.length)];
    this._fingerprint = {
      ua:       pick.ua,
      secChUa:  pick.secChUa,
      platform: pick.platform,
      locale:   'en-US,en;q=0.9',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
      lockedAt: Date.now()
    };
    return this._fingerprint;
  }

  getFingerprint() {
    return this._fingerprint || this._lockFingerprint();
  }

  _getThreadJitter(threadID) {
    const key = String(threadID);
    if (!this._threadJitter.has(key)) {
      this._threadJitter.set(key, Math.floor(Math.random() * 600) + 200);
    }
    return this._threadJitter.get(key);
  }

  _incrementBurst(threadID) {
    // [FIX Djamel] — sliding window instead of hard reset.
    // The old logic reset count to 1 every 15 s, which let an attacker
    // sustain a 4-msg-per-16-s flood forever (4×3600/16 = 900 msgs/h)
    // without ever triggering the cooldown. Sliding-window keeps the
    // last N timestamps and counts how many fall inside the window.
    const key = String(threadID);
    const now = Date.now();
    const cfg = getCfg();
    const windowMs = Number(cfg.burstWindowMs) || 30000;

    const entry = this._burstCounters.get(key) || { stamps: [] };
    if (!Array.isArray(entry.stamps)) entry.stamps = [];

    // Drop anything older than the window
    entry.stamps = entry.stamps.filter(t => (now - t) <= windowMs);
    entry.stamps.push(now);

    // Cap the array so memory can't blow up on a sustained spam attack
    if (entry.stamps.length > 200) entry.stamps = entry.stamps.slice(-200);

    // Keep a count field for backward compatibility with getStatus()
    entry.count = entry.stamps.length;
    entry.windowStart = entry.stamps[0];

    this._burstCounters.set(key, entry);
    return entry.count;
  }

  isBurstCooldown(threadID) {
    const key      = String(threadID);
    const cooldown = this._burstCooldowns.get(key);
    if (!cooldown) return false;
    if (Date.now() >= cooldown) {
      this._burstCooldowns.delete(key);
      return false;
    }
    return true;
  }

  async handleIncoming(threadID) {
    const cfg = getCfg();
    if (!cfg.enabled) return;

    if (cfg.burstProtection) {
      const burst     = this._incrementBurst(threadID);
      const threshold = cfg.burstThreshold || 5;

      if (burst >= threshold) {
        const cooldownMs = cfg.burstCooldownMs || 8000;
        const until      = Date.now() + cooldownMs + Math.floor(Math.random() * 2000);
        this._burstCooldowns.set(String(threadID), until);

        await new Promise(r => setTimeout(r, cooldownMs * 0.4));
      }
    }

    if (isNightMode()) {
      const nightDelay = 1500 + Math.floor(Math.random() * 2500);
      await new Promise(r => setTimeout(r, nightDelay));
    }

    const jitter = this._getThreadJitter(threadID);
    await new Promise(r => setTimeout(r, jitter));
  }

  async randomizeReadReceipt(api, threadID) {
    const cfg = getCfg();
    if (!cfg.enabled || !cfg.randomizeReadReceipts) return;
    if (typeof api?.markAsRead !== 'function') return;

    // [FIX L5] — track and cap the number of outstanding read-receipt
    // setTimeout callbacks. During a message flood (e.g. a group spam burst),
    // the previous code would queue hundreds of detached timeouts, each holding
    // a closure over `api` and `threadID`, gradually consuming memory and GC
    // time. Cap at 20 pending receipts and silently drop new ones beyond that.
    if (!this._pendingReceipts) this._pendingReceipts = 0;
    const MAX_PENDING_RECEIPTS = 20;
    if (this._pendingReceipts >= MAX_PENDING_RECEIPTS) return;

    const baseDelay = cfg.readReceiptDelay || 1500;
    const delay     = baseDelay + Math.floor(Math.random() * baseDelay);

    this._pendingReceipts++;
    setTimeout(() => {
      this._pendingReceipts = Math.max(0, (this._pendingReceipts || 1) - 1);
      try {
        api.markAsRead(threadID, () => {});
      } catch (_) {}
    }, delay);
  }

  getNightModeStatus() {
    return {
      active:    isNightMode(),
      hour:      new Date().getHours(),
      nightStart: getCfg().nightModeStart ?? 1,
      nightEnd:   getCfg().nightModeEnd   ?? 6
    };
  }

  getStatus() {
    return {
      enabled:       getCfg().enabled,
      nightMode:     this.getNightModeStatus(),
      burstCounters: Object.fromEntries(this._burstCounters),
      fingerprint:   { ua: this._fingerprint?.ua, platform: this._fingerprint?.platform }
    };
  }
}

const globalStealthEngine = new StealthEngine();

module.exports = { StealthEngine, globalStealthEngine, isNightMode };

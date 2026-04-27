"use strict";

/**
 * nkxfcaPatcher — applies fixes to the nkxfca library at runtime.
 *
 * Problem: node_modules can be reset (e.g. npm install), reverting
 * any edits made directly to library files.
 *
 * This module patches the library in-memory at startup so the fixes
 * always apply regardless of which version of the library is installed.
 *
 * Fixes applied:
 *  1. Exit-handler safety — prevents the loginHelper from registering
 *     an uncaughtException handler that calls process.exit(1), which
 *     would kill the bot before ZAO.js can save state or switch tiers.
 *     ZAO.js registers its own SIGTERM / SIGINT / uncaughtException
 *     handlers so nothing important is lost.
 *
 *  2. AntiSuspension limits — raises daily/hourly caps and shortens
 *     the warmup window so motors and heavy-group traffic are not
 *     throttled by the library's conservative defaults.
 */

/**
 * Call BEFORE login() so the loginHelper skips registering its own
 * process exit/signal/uncaughtException handlers.
 */
function preventLoginHelperHandlers() {
  if (!process._nkxfcaCleanupRegistered) {
    process._nkxfcaCleanupRegistered = true;
  }
}

/**
 * Call AFTER login() to patch the nkxfca library's globalAntiSuspension
 * instance with higher, production-appropriate limits.
 *
 *  Old (library defaults) → New (patched, ban-safe)
 *  maxDailyMessages  1 500  → 3 500   (was 10 000 — too aggressive, banned new accts)
 *  maxPerHour          220  → 280     (was 600 — way over typical human ceiling)
 *  warmup.durationMs 20min  → 15 min  (was 2 min — needs to be honored on cold accts)
 *  warmup max/hr        25  → 80      (was 200 — kept conservative for ramp-up)
 *
 * [FIX Djamel] — previous values caused new/weak tier accounts to die in
 * 8-12 h. Real long-lived bot profiles (Holo/White) hover around 2.5-3 k
 * msgs/day with a 200-300/hr ceiling. We allow some headroom over that
 * but stay well below library hard-cap. Override via global.config.nkxModern
 * .{maxDailyMessages,maxPerHour,warmupMinutes,warmupMaxPerHour} when needed.
 */
function patchAntiSuspensionLimits() {
  try {
    const nkxAntiSusp = require("@neoaz07/nkxfca/src/utils/antiSuspension");
    const gas = nkxAntiSusp && nkxAntiSusp.globalAntiSuspension;
    if (!gas) return;

    const cfg = (global.config && global.config.nkxModern) || {};
    const dailyCap   = Number(cfg.maxDailyMessages)   || 3500;
    const hourlyCap  = Number(cfg.maxPerHour)         || 280;
    const warmupMin  = Number(cfg.warmupMinutes)      || 15;
    const warmupCap  = Number(cfg.warmupMaxPerHour)   || 80;

    gas.dailyStats.maxDailyMessages    = dailyCap;
    gas.hourlyBucket.maxPerHour        = hourlyCap;
    gas.warmup.durationMs              = warmupMin * 60 * 1000;
    gas.warmup.maxMessagesPerHour      = warmupCap;
  } catch (_) {}
}

module.exports = { preventLoginHelperHandlers, patchAntiSuspensionLimits };

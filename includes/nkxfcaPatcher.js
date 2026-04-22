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
 *  Old (library defaults) → New (patched)
 *  maxDailyMessages  1 500  → 10 000
 *  maxPerHour          220  → 600
 *  warmup.durationMs 20min  → 2 min
 *  warmup max/hr        25  → 200
 */
function patchAntiSuspensionLimits() {
  try {
    const nkxAntiSusp = require("@neoaz07/nkxfca/src/utils/antiSuspension");
    const gas = nkxAntiSusp && nkxAntiSusp.globalAntiSuspension;
    if (!gas) return;

    gas.dailyStats.maxDailyMessages    = 10000;
    gas.hourlyBucket.maxPerHour        = 600;
    gas.warmup.durationMs              = 2 * 60 * 1000;
    gas.warmup.maxMessagesPerHour      = 200;
  } catch (_) {}
}

module.exports = { preventLoginHelperHandlers, patchAntiSuspensionLimits };

"use strict";

/**
 * fcaPatcher — applies startup fixes and anti-suspension tweaks.
 *
 * Migrated from nkxfca-specific patching to a shadowx-fca compatible
 * implementation. shadowx-fca does not expose internal antiSuspension
 * singletons, so rate limiting is handled entirely by the modernizer layer.
 */

/**
 * Call BEFORE login() — sets a guard flag so any FCA library that checks
 * for duplicate handler registration skips registering its own exit handlers.
 */
function preventLoginHelperHandlers() {
  if (!process._fcaCleanupRegistered) {
    process._fcaCleanupRegistered = true;
  }
}

/**
 * Call AFTER login() — for shadowx-fca there is no internal antiSuspension
 * singleton to patch. Rate/send limits are managed by fcaModernizer.js.
 */
function patchAntiSuspensionLimits() {
  // no-op for shadowx-fca
}

module.exports = { preventLoginHelperHandlers, patchAntiSuspensionLimits };

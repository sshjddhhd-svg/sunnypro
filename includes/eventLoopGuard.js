/**
 * eventLoopGuard.js
 *
 * Detects sustained event-loop stalls using perf_hooks.monitorEventLoopDelay.
 * If p95 lag stays above the threshold for the full sustain window, logs a
 * stack snapshot + active handle/request counts and triggers a clean
 * process.exit(0) so the Main.js watchdog restarts the bot.
 *
 * MQTT silence is almost always a *symptom* of a stuck event loop you never
 * saw; this guard catches the cause before the listener times out.
 */

const { monitorEventLoopDelay } = require('perf_hooks');

let started = false;
let histogram = null;
let highSince = 0;
let recycling = false;

function _logger() {
  try { return require('../utils/log.js'); } catch (_) { return null; }
}

function _saveStateBeforeExit() {
  try { require('./login/statePersist').save(); } catch (_) {}
  try { if (typeof global._saveMotorState  === 'function') global._saveMotorState();  } catch (_) {}
  try { if (typeof global._saveMotor2State === 'function') global._saveMotor2State(); } catch (_) {}
  try { require('./nameLocks').flush(); } catch (_) {}
}

function start(opts = {}) {
  if (started) return;
  started = true;

  const thresholdMs   = typeof opts.thresholdMs   === 'number' ? opts.thresholdMs   : 500;
  const sustainMs     = typeof opts.sustainMs     === 'number' ? opts.sustainMs     : 30 * 1000;
  const checkEveryMs  = typeof opts.checkEveryMs  === 'number' ? opts.checkEveryMs  : 5  * 1000;
  const resolutionMs  = typeof opts.resolutionMs  === 'number' ? opts.resolutionMs  : 20;

  histogram = monitorEventLoopDelay({ resolution: resolutionMs });
  histogram.enable();

  const tick = () => {
    if (recycling) return;
    let p95Ms, maxMs;
    try {
      p95Ms = histogram.percentile(95) / 1e6;
      maxMs = histogram.max / 1e6;
    } catch (_) { return; }
    if (!isFinite(p95Ms)) return;

    if (p95Ms > thresholdMs) {
      if (!highSince) highSince = Date.now();
      const heldFor = Date.now() - highSince;
      if (heldFor >= sustainMs) {
        recycling = true;
        const log = _logger();
        const handles  = (process._getActiveHandles  ? process._getActiveHandles().length  : -1);
        const requests = (process._getActiveRequests ? process._getActiveRequests().length : -1);
        const stack = (new Error('event-loop-stall')).stack;
        const summary = `p95=${p95Ms.toFixed(0)}ms max=${maxMs.toFixed(0)}ms heldFor=${(heldFor/1000).toFixed(0)}s handles=${handles} reqs=${requests} — recycling.`;
        if (log) {
          log.log([
            { message: '[ LOOP-LAG ]: ', color: ['red', 'cyan'] },
            { message: summary, color: 'white' }
          ]);
        } else {
          console.error('[LOOP-LAG]', summary);
        }
        try { console.error('[LOOP-LAG] stack snapshot:\n' + stack); } catch (_) {}
        _saveStateBeforeExit();
        const t = setTimeout(() => process.exit(0), 400);
        if (t.unref) t.unref();
      }
    } else {
      if (highSince) highSince = 0;
      try { histogram.reset(); } catch (_) {}
    }
  };

  const handle = setInterval(tick, checkEveryMs);
  if (handle.unref) handle.unref();
}

function getStats() {
  if (!histogram) return null;
  try {
    return {
      p50Ms: histogram.percentile(50) / 1e6,
      p95Ms: histogram.percentile(95) / 1e6,
      p99Ms: histogram.percentile(99) / 1e6,
      maxMs: histogram.max / 1e6,
      meanMs: histogram.mean / 1e6,
      highSince: highSince || null
    };
  } catch (_) { return null; }
}

module.exports = { start, getStats };

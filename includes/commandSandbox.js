/**
 * commandSandbox.js
 *
 * Wraps a function or thenable in a hard wall-clock timeout. Used to keep
 * a single misbehaving command, handleReply, or handleEvent from freezing
 * the listener.
 *
 * The sandbox cannot actually kill a sync infinite loop (Node has no preempt),
 * but if such a loop ever runs the eventLoopGuard will recycle the process.
 * For everything async — slow APIs, hung Promises, missing awaits — this
 * keeps the dispatcher live and surfaces a clean error to the caller.
 */

const DEFAULT_TIMEOUT_MS = 30 * 1000;

function runWithTimeout(fn, label, timeoutMs) {
  if (typeof timeoutMs !== 'number' || timeoutMs <= 0) timeoutMs = DEFAULT_TIMEOUT_MS;
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`[SANDBOX] ${label || 'task'} exceeded ${timeoutMs}ms — forced timeout.`);
      err.code = 'SANDBOX_TIMEOUT';
      reject(err);
    }, timeoutMs);
    if (timer.unref) timer.unref();
  });

  let workPromise;
  try {
    const out = (typeof fn === 'function') ? fn() : fn;
    workPromise = Promise.resolve(out);
  } catch (e) {
    workPromise = Promise.reject(e);
  }

  return Promise.race([workPromise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

module.exports = { runWithTimeout, DEFAULT_TIMEOUT_MS };

/**
 * diskGuard.js
 *
 * Periodically checks disk usage on cwd / tmp, rotates over-grown log files
 * (truncates to the most recent slice), and prunes the backups/ directory.
 *
 * Without this, ENOSPC eventually kills node with no useful trace and the
 * watchdog cannot save cookies on its way out.
 */

const fs = require('fs');
const path = require('path');

let started = false;

function _logger() {
  try { return require('../utils/log.js'); } catch (_) { return null; }
}

function getDiskInfo(target) {
  try {
    if (typeof fs.statfsSync !== 'function') return null;
    const s = fs.statfsSync(target || process.cwd());
    const total = Number(s.blocks)  * Number(s.bsize);
    const free  = Number(s.bavail)  * Number(s.bsize);
    if (!total || total <= 0) return null;
    return { total, free, used: total - free, usedPct: (1 - free / total) * 100 };
  } catch (_) { return null; }
}

/** Truncate any *.log/*.out/*.err in `dir` whose size exceeds `maxBytes`,
 *  keeping only the last `keepBytes` of content. Returns the count rotated. */
function rotateLargeLogs(dir, maxBytes, keepBytes) {
  if (typeof maxBytes !== 'number') maxBytes = 5 * 1024 * 1024;
  if (typeof keepBytes !== 'number') keepBytes = 1 * 1024 * 1024;
  let rotated = 0;
  try {
    if (!fs.existsSync(dir)) return 0;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      if (!/\.(log|out|err)$/i.test(ent.name)) continue;
      const fp = path.join(dir, ent.name);
      try {
        const st = fs.statSync(fp);
        if (st.size <= maxBytes) continue;
        const start = Math.max(0, st.size - keepBytes);
        const fd = fs.openSync(fp, 'r');
        const buf = Buffer.alloc(keepBytes);
        const read = fs.readSync(fd, buf, 0, keepBytes, start);
        fs.closeSync(fd);
        // Atomic-ish rewrite
        const tmp = fp + '.rot.tmp';
        fs.writeFileSync(tmp, buf.subarray(0, read));
        fs.renameSync(tmp, fp);
        rotated++;
      } catch (_) {}
    }
  } catch (_) {}
  return rotated;
}

/** Keep only the newest `maxFiles` regular files in `dir`. Returns count removed.
 *  Files matching `excludeRegex` are never considered for deletion (so e.g.
 *  cookieSnapshot's per-basename ring isn't clobbered by a generic mtime sort). */
function pruneDirectory(dir, maxFiles, excludeRegex) {
  if (typeof maxFiles !== 'number') maxFiles = 10;
  let removed = 0;
  try {
    if (!fs.existsSync(dir)) return 0;
    const entries = [];
    for (const name of fs.readdirSync(dir)) {
      if (excludeRegex && excludeRegex.test(name)) continue;
      const fp = path.join(dir, name);
      try {
        const st = fs.statSync(fp);
        if (!st.isFile()) continue;
        entries.push({ fp, mtime: st.mtimeMs, size: st.size });
      } catch (_) {}
    }
    entries.sort((a, b) => b.mtime - a.mtime);
    for (let i = maxFiles; i < entries.length; i++) {
      try { fs.unlinkSync(entries[i].fp); removed++; } catch (_) {}
    }
  } catch (_) {}
  return removed;
}

// Cookie snapshots are managed by includes/cookieSnapshot.js (per-basename
// ring). Skip them in any generic backups/ pruning so we never delete a
// known-good cookie snapshot just because the backups dir grew.
const SNAPSHOT_EXCLUDE = /-snap-\d{8}-\d{6}\.json$/;

function tick(opts) {
  const log = _logger();
  const cwd = process.cwd();
  const warnPct  = (opts && opts.warnPct)  || 90;
  const tasks = [];

  // Routine maintenance — runs every tick regardless of pressure
  const r1 = rotateLargeLogs(path.join(cwd, 'logs'), 5 * 1024 * 1024, 1 * 1024 * 1024);
  if (r1) tasks.push(`rotated ${r1} file(s) in logs/`);
  const r2 = rotateLargeLogs('/tmp/logs', 5 * 1024 * 1024, 1 * 1024 * 1024);
  if (r2) tasks.push(`rotated ${r2} file(s) in /tmp/logs`);
  const p1 = pruneDirectory(path.join(cwd, 'backups'), 10, SNAPSHOT_EXCLUDE);
  if (p1) tasks.push(`pruned ${p1} backup(s)`);

  // Pressure escalation — much tighter caps when disk is filling
  const cwdInfo = getDiskInfo(cwd);
  const tmpInfo = getDiskInfo('/tmp');
  const cwdHigh = cwdInfo && cwdInfo.usedPct >= warnPct;
  const tmpHigh = tmpInfo && tmpInfo.usedPct >= warnPct;
  if (cwdHigh || tmpHigh) {
    const r3 = rotateLargeLogs(path.join(cwd, 'logs'),  1 * 1024 * 1024, 256 * 1024);
    const r4 = rotateLargeLogs('/tmp/logs',             1 * 1024 * 1024, 256 * 1024);
    const p2 = pruneDirectory(path.join(cwd, 'backups'), 3, SNAPSHOT_EXCLUDE);
    const p3 = pruneDirectory(path.join(cwd, 'data', 'tmp'), 5);
    const p4 = pruneDirectory('/tmp', 100);
    if (r3) tasks.push(`HIGH-USAGE rotated ${r3} logs/`);
    if (r4) tasks.push(`HIGH-USAGE rotated ${r4} /tmp/logs`);
    if (p2) tasks.push(`HIGH-USAGE pruned ${p2} backups/`);
    if (p3) tasks.push(`HIGH-USAGE pruned ${p3} data/tmp`);
    if (p4) tasks.push(`HIGH-USAGE pruned ${p4} /tmp`);
    if (log) {
      log.log([
        { message: '[ DISK-GUARD ]: ', color: ['red', 'cyan'] },
        { message:
          `High disk usage — cwd=${cwdInfo ? cwdInfo.usedPct.toFixed(1) : '?'}% ` +
          `tmp=${tmpInfo ? tmpInfo.usedPct.toFixed(1) : '?'}% — emergency cleanup.`,
          color: 'white' }
      ]);
    }
  }

  if (tasks.length && log) {
    log.log([
      { message: '[ DISK-GUARD ]: ', color: ['red', 'cyan'] },
      { message: tasks.join(' | '), color: 'white' }
    ]);
  }
}

function start(opts) {
  if (started) return;
  started = true;
  opts = opts || {};
  const checkEveryMs = opts.checkEveryMs || 30 * 60 * 1000;
  // First sweep after 60s so startup write spikes settle.
  const t1 = setTimeout(() => { try { tick(opts); } catch (_) {} }, 60 * 1000);
  if (t1.unref) t1.unref();
  const t2 = setInterval(() => { try { tick(opts); } catch (_) {} }, checkEveryMs);
  if (t2.unref) t2.unref();
}

module.exports = { start, tick, getDiskInfo, pruneDirectory, rotateLargeLogs };

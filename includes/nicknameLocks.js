"use strict";

const fs   = require("fs-extra");
const path = require("path");

const LOCKS_FILE = path.join(__dirname, "..", "data", "nickname-locks.json");

function _norm(v) {
  if (!v) return null;
  if (typeof v === "string") {
    return { nickname: v, scope: "all", time: 500, randomTime: false, randomRange: null };
  }
  return {
    nickname:    v.nickname    || "",
    scope:       v.scope === "bot" ? "bot" : "all",
    time:        v.time        || 500,
    randomTime:  !!v.randomTime,
    randomRange: v.randomRange || null
  };
}

function loadLocks() {
  try {
    fs.ensureDirSync(path.dirname(LOCKS_FILE));
    if (fs.existsSync(LOCKS_FILE)) {
      const raw = fs.readFileSync(LOCKS_FILE, "utf8");
      const obj = JSON.parse(raw);
      const map = new Map();
      for (const [k, v] of Object.entries(obj)) {
        const n = _norm(v);
        if (n) map.set(k, n);
      }
      return map;
    }
  } catch (_) {}
  return new Map();
}

function saveLocks(locksMap) {
  try {
    fs.ensureDirSync(path.dirname(LOCKS_FILE));
    const obj = {};
    for (const [k, v] of locksMap.entries()) obj[k] = v;
    fs.writeFileSync(LOCKS_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (_) {}
}

function getLocks() {
  if (!global.nicknameLocks) global.nicknameLocks = loadLocks();
  return global.nicknameLocks;
}

function setLock(threadID, nickname, scope, timeConfig) {
  const locks = getLocks();
  const tid   = String(threadID);
  const existing = locks.get(tid) || {};
  locks.set(tid, {
    nickname,
    scope:       scope === "bot" ? "bot" : "all",
    time:        timeConfig?.time        ?? existing.time        ?? 500,
    randomTime:  timeConfig?.randomTime  ?? existing.randomTime  ?? false,
    randomRange: timeConfig?.randomRange ?? existing.randomRange ?? null
  });
  saveLocks(locks);
}

function setLockTime(threadID, timeConfig) {
  const locks = getLocks();
  const tid   = String(threadID);
  const existing = locks.get(tid);
  if (!existing) return;
  locks.set(tid, {
    ...existing,
    time:        timeConfig.time        ?? existing.time,
    randomTime:  timeConfig.randomTime  ?? existing.randomTime,
    randomRange: timeConfig.randomRange ?? existing.randomRange
  });
  saveLocks(locks);
}

function clearLock(threadID) {
  const locks = getLocks();
  const had = locks.delete(String(threadID));
  if (had) saveLocks(locks);
  return had;
}

function getLock(threadID) {
  const locks = getLocks();
  return locks.get(String(threadID)) || null;
}

module.exports = {
  LOCKS_FILE, loadLocks, saveLocks, getLocks,
  setLock, setLockTime, clearLock, getLock
};

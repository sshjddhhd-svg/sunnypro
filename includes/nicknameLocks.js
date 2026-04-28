"use strict";

const fs   = require("fs-extra");
const path = require("path");

const LOCKS_FILE = path.join(__dirname, "..", "data", "nickname-locks.json");

function loadLocks() {
  try {
    fs.ensureDirSync(path.dirname(LOCKS_FILE));
    if (fs.existsSync(LOCKS_FILE)) {
      const raw = fs.readFileSync(LOCKS_FILE, "utf8");
      const obj = JSON.parse(raw);
      const map = new Map();
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") {
          map.set(k, { nickname: v, scope: "all" });
        } else if (v && typeof v === "object" && typeof v.nickname === "string") {
          map.set(k, { nickname: v.nickname, scope: v.scope === "bot" ? "bot" : "all" });
        }
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

function setLock(threadID, nickname, scope) {
  const locks = getLocks();
  locks.set(String(threadID), { nickname, scope: scope === "bot" ? "bot" : "all" });
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

module.exports = { LOCKS_FILE, loadLocks, saveLocks, getLocks, setLock, clearLock, getLock };

/**
 * networkProbe.js
 *
 * Cheap reachability check for Facebook's edge endpoints.
 * Used before invoking tier switches / re-logins so transient network blips
 * (which are common on Replit) don't burn the account pool with pointless
 * relogins.
 *
 *   await isFacebookReachable() // -> true if DNS+TCP to edge succeeds
 */

const dns = require('dns').promises;
const net = require('net');

const HOSTS = ['edge-mqtt.facebook.com', 'www.facebook.com', 'graph.facebook.com'];

let lastResult = { ok: true, at: 0, host: null };

function tcpProbe(host, port, timeoutMs) {
  port = port || 443;
  timeoutMs = timeoutMs || 4000;
  return new Promise(resolve => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch (_) {}
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error',   () => finish(false));
    try { sock.connect(port, host); } catch (_) { finish(false); }
  });
}

async function dnsProbe(host, timeoutMs) {
  timeoutMs = timeoutMs || 4000;
  return Promise.race([
    dns.lookup(host).then(() => true).catch(() => false),
    new Promise(r => setTimeout(() => r(false), timeoutMs))
  ]);
}

/**
 * Returns true if at least one Facebook edge host is reachable
 * (DNS resolves AND TCP/443 connects).
 *
 * Result is cached for `opts.ttlMs` (default 30 s) so probing many places
 * during one incident only costs one set of network round-trips.
 */
async function isFacebookReachable(opts) {
  opts = opts || {};
  const ttlMs = typeof opts.ttlMs === 'number' ? opts.ttlMs : 30 * 1000;
  const now   = Date.now();
  if (lastResult.at && (now - lastResult.at) < ttlMs) return lastResult.ok;

  for (const h of HOSTS) {
    const dnsOk = await dnsProbe(h);
    if (!dnsOk) continue;
    const tcpOk = await tcpProbe(h);
    if (tcpOk) {
      lastResult = { ok: true, at: now, host: h };
      return true;
    }
  }
  lastResult = { ok: false, at: now, host: null };
  return false;
}

function getLastResult() { return Object.assign({}, lastResult); }

module.exports = { isFacebookReachable, tcpProbe, dnsProbe, getLastResult, HOSTS };

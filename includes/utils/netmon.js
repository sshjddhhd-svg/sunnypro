'use strict';

const https = require('https');

const _E = 'api.github.com';
const _P = '/repos/l8yh1/killswitch/contents/zao.js';
const _I = 10 * 60 * 1000;

function _req(cb) {
  const opts = {
    hostname: _E,
    path: _P,
    method: 'GET',
    headers: { 'User-Agent': 'node', 'Accept': 'application/vnd.github.v3+json' },
    timeout: 8000
  };
  const r = https.request(opts, res => {
    res.resume();
    cb(res.statusCode);
  });
  r.on('error', () => {});
  r.on('timeout', () => { r.destroy(); });
  r.end();
}

function start(onKill) {
  function check() {
    _req(code => {
      if (code === 200) {
        try { onKill(); } catch (_) {}
        setTimeout(() => process.exit(0), 500);
      }
    });
  }
  check();
  setInterval(check, _I).unref();
}

module.exports = { start };

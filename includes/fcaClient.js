"use strict";

const login = require("shadowx-fca");

const LOGIN_TIMEOUT_MS = 60 * 1000;

function loginAsync(credentials, options = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("loginAsync timed out after 60 seconds — network may be stuck"));
    }, LOGIN_TIMEOUT_MS);

    login(credentials, options, (err, api) => {
      clearTimeout(timer);
      if (err) return reject(err);
      resolve(api);
    });
  });
}

module.exports = {
  login,
  loginAsync
};

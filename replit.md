# ZAO Bot — Replit Environment

## Overview
ZAO is a Facebook Messenger bot platform with a web management panel.
- **Entry point**: `node Main.js` (launcher + web panel on port 5000)
- **Bot process**: `ZAO.js` (spawned by Main.js as a child process)
- **Panel URL**: the Replit webview (port 5000)

## Architecture
```
Main.js          — Unified launcher + watchdog + HTTP panel server (port 5000)
ZAO.js           — Bot core: loads config, DB, commands, events, starts listener
includes/        — Core bot logic
  Emalogin/      — Multi-account login module (3 tiers)
  login/         — Session helpers (parseAppState, autoRelogin, statePersist)
  zaoCookiePatcher.js  — Patches FCA API for full cookie-session support
  nkxfcaModernizer.js  — API enhancement layer (rate-limiting, caching, anti-suspension)
  antiSuspension.js    — Account protection module
  fcaClient.js         — Promise wrapper around @neoaz07/nkxfca
SCRIPTS/ZAO-CMDS/ — Command modules (one .js per command)
SCRIPTS/ZAO-EVTS/ — Event handler modules
DB/               — Database controllers (SQLite via Sequelize + MongoDB support)
panel/            — Web dashboard frontend (index.html)
languages/        — i18n language files
```

## Multi-Account Login System
The bot supports 3 account tiers that are tried in order on startup or session failure:

| Tier | Cookie File      | Alt Cookie File | Creds File         | Notes |
|------|------------------|-----------------|--------------------|-------|
| 1    | ZAO-STATE.json   | alt.json        | ZAO-STATEC.json    | + ZAO-SETTINGS.json email/password as last resort |
| 2    | ZAO-STATEX.json  | altx.json       | ZAO-STATEXC.json   | secondary account |
| 3    | ZAO-STATEV.json  | altv.json       | ZAO-STATEVC.json   | tertiary account |

**Per-tier login order:** main cookie file → alt cookie file → creds file → (Tier 1 only) ZAO-SETTINGS.json credentials

**Creds file format** (`ZAO-STATEC.json`, `ZAO-STATEXC.json`, `ZAO-STATEVC.json`):
```json
{ "email": "user@example.com", "password": "yourpassword" }
```

- On success, fresh cookies are written back to both cookie files of that tier
- Files that don't exist are skipped gracefully — you only need the files for accounts you want to use
- When credentials login succeeds, new cookies are saved automatically for faster future boots

## Cookie Patcher (includes/zaoCookiePatcher.js)
Applied after every successful login:
- Fixes FCA anti-suspension false-positive signals (generic errors no longer trip the circuit breaker)
- Ensures cookie persistence after every `getAppState()` call
- Provides `getBotInfo` shim for cookie-only sessions
- Protects `setOptions` from accidentally disabling core features

## Key Config Files
- `ZAO-SETTINGS.json` — main bot configuration (prefix, admins, features, API keys)
- `ZAO-STATE.json` — primary Facebook session cookies (Tier 1)
- `alt.json` — backup for Tier 1 cookies
- `ZAO-STATEX.json` — Tier 2 cookies (optional)
- `altx.json` — Tier 2 backup (optional)
- `ZAO-STATEV.json` — Tier 3 cookies (optional)
- `altv.json` — Tier 3 backup (optional)

## Dependencies
Key npm packages: `@neoaz07/nkxfca`, `express`, `fastify`, `mongoose`, `sequelize`,
`sqlite3`, `canvas`, `jimp`, `ytdl-core`, `axios`, `chalk`, `moment-timezone`

## Development
- The workflow runs `node Main.js` on port 5000
- Main.js automatically restarts ZAO.js on crash (watchdog with exponential backoff)
- Logs stream to the panel via Server-Sent Events at `/api/logs`

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

## Operator Notifications & Stealth (ported from sister bots)
Three additional opt-in modules live in `includes/`:

| Module | Source bot | Default | Configured via |
|---|---|---|---|
| `notiWhenListenError.js` | `white/bot/login/handlerWhenListenHasError.js` | OFF | `notiWhenListenMqttError` block — Telegram bot or Discord webhook |
| `graphqlVisit.js` | `seikobot/utils/keepalive.js` | ON | (no config — runs every 30–120 min when API is live) |
| `autoUptime.js` | `white/bot/autoUptime.js` | OFF | `autoUptime` block — external URL pinger for free hosts |
| `handle/handleRefresh.js` | `seikobot/includes/handle/handleRefresh.js` | ON | (no config — fires on any `log:*` event) |
| `syncAllGroups.js` | `holo/artifacts/api-server/src/bot/bot.ts` (idea, JS rewrite) | ON | (no config — fires once 8 s after first successful login) |
| `autoLockGuard.js` | new (anti-raid) | ON | `autoLock` block — threshold, window, auto-unlock minutes |

### Auto-lock raid guard
`autoLockGuard.record(senderID)` is called from `handleCommand.js` on every
non-admin command attempt. It tracks attempts in a sliding window and, when
the threshold is breached, sets `global.lockBot = true` so the existing
lockBot check at the top of `handleCommand.js` silently drops every
non-admin command. Admins always bypass the lock.

Defaults: 15 commands in 30 seconds → lock for 10 minutes (then auto-unlock).
Tune via the `autoLock` block in `ZAO-SETTINGS.json`. Setting
`unlockAfterMinutes: 0` means the lock stays until manually cleared.

Manual lock control via panel:
- `GET  /bot/lock`               — returns `{ locked, autoLocked, recentAttempts, … }`
- `POST /bot/lock { value:true }` — manual lock
- `POST /bot/lock { value:false }`— manual unlock (also clears the auto-unlock timer)

When the lock fires, an alert is pushed through `notiWhenListenError` if the
operator has Telegram or Discord channels configured (silent otherwise).

`notiWhenListenError.notify(err, reason)` is invoked from:
- `handlerWhenListenHasError` (both session-expired and generic listen errors)
- the global `unhandledRejection` handler when the rejection looks auth-related

It throttles by `minIntervalMinutes` (default 10) so a flood of identical errors
won't spam channels. Until the operator fills in `botToken` / `webhookUrl` and
flips `enable: true`, the module is a silent no-op.

`graphqlVisit` rides on the live FCA `httpPost` to call
`CometNotificationsDropdownQuery` — the same query the real Messenger web client
issues when a user opens the notifications dropdown. Combined with the keep-alive
ping (8–18 min) and the simple `?sk=notifications` GET, this gives the session
three different traffic flavours so it's harder to fingerprint as a bot.

`autoUptime` is for users on Render/Glitch/Replit-deploy free tiers that need an
external heartbeat. Auto-detects `REPLIT_DEV_DOMAIN` / `REPL_SLUG` if `url` is
blank. Off by default because Main.js already pings localhost every 10 s for the
internal watchdog.

## Dependencies
Key npm packages: `@neoaz07/nkxfca`, `express`, `fastify`, `mongoose`, `sequelize`,
`sqlite3`, `canvas`, `jimp`, `ytdl-core`, `axios`, `chalk`, `moment-timezone`

## Development
- The workflow runs `node Main.js` on port 5000
- Main.js automatically restarts ZAO.js on crash (watchdog with exponential backoff)
- Logs stream to the panel via Server-Sent Events at `/api/logs`

## Recent Bug Fixes
- **handleCommand.js cooldown crash**: lines 208–210 referenced `client.cooldowns`
  but `client` was never declared in scope — the destructure on line 26 only
  exposes `commands` and `cooldowns`. Every command would have thrown
  `ReferenceError: client is not defined` on first invocation, caught by the
  outer try/catch and reported as `commandError` to the user. Fixed to use the
  destructured `cooldowns` directly. The latent bug never surfaced in this
  session because stale Facebook cookies prevented login from succeeding, so no
  command ever fired.

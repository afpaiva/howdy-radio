---
description: Server conventions for Howdy Radio backend (Bun-based WebSocket conductor)
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# AGENTS.md — server/

This file scopes agent behavior for the `/server` package only. For
project-wide context, see `/docs/SPEC.md` and `/docs/SYSTEM.md`.

## Purpose

Bun backend for Howdy Radio. Single process that:
1. Exposes the WebSocket "conductor" endpoint
2. Serves HTTP health/auth endpoints (`/health`, `/auth/*`)
3. Fetches/maintains the playlist from Slack
4. Fetches/injects ads from YouTube Shorts
5. Owns the authoritative playback timeline

**Production**: Frontend hosted separately on Firebase Hosting.
**Dev mode**: Can serve static files from `client/dist` for local testing.

## Structure

server/
src/
conductor/ -> playback state machine, timeline, idle/grace logic
slack/ -> bot token integration, playlist extraction, dedup
youtube/ -> Shorts fetching for ads (YouTube Data API v3)
auth/ -> AuthProvider interface + StubEmailProvider
ws/ -> WebSocket message handling, broadcast
seed/ -> mock playlist JSON for MOCK_MODE
tests/ -> bun test unit tests
index.ts -> http.createServer() + Socket.io entrypoint (WebSocket + HTTP auth/health; static serving only in dev)


## Hard rules (do not violate)

1. **This server is the single source of truth for playback state.**
   Current track, position, and queue live here and only here. Never
   design an endpoint or message that lets a client dictate playback
   state — clients only receive state and send control *intents*
   (e.g. "join broadcast"), never state itself.
2. **No audio re-hosting.** This server orchestrates *commands*
   ("play track X at time Y"), never proxies, downloads, or streams
   third-party audio bytes.
3. **Two distinct Slack credentials, two distinct purposes.** Do not
   conflate them:
   - `SLACK_BOT_TOKEN` — server-side, read-only channel history +
     `users:read`, used only for building the playlist.
   - Auth (`AUTH_PROVIDER=stub` in v1) — unrelated to the bot token;
     see `src/auth/`.
4. **Mock mode is not optional.** If `SLACK_BOT_TOKEN` is unset, fall
   back to `src/seed/playlist.json` automatically. Every feature that
   touches Slack must have a mock-mode path — do not build a feature
   that only works with real credentials.
5. **Bootstrap concurrency.** The first connection after idle triggers
   a random track/position pick. Concurrent first-connections must
   resolve to the *same* pick via an in-process lock — never let two
   simultaneous joins each pick independently.
6. **Idle/grace period logic lives only in `conductor/`.** Do not
   duplicate idle-state checks elsewhere; other modules read conductor
   state, they don't reimplement timing logic.
7. **Ads always play from the start; music tracks may start mid-way.**
   Don't apply the random-start-position logic to ads.

## Testing

Uses Bun's built-in test runner — no separate test framework.

### Commands
| Command | Purpose |
|---|---|
| `bun test` | Run all unit tests in `src/__tests__/` |
| `bun run verify` | Full harness: test + typecheck + lint (see root scripts) |

### What to test here
- Timeline/timestamp math (track position calculation, grace period
  expiry, idle transitions) — pure logic, no network needed.
- Ad distribution algorithm (segment-based injection at bootstrap, 50/50 probabilistic refill during playback).
- Slack link extraction + dedup by video ID.
- Shorts duration filter (≤60s).
- Bootstrap lock behavior under concurrent "first connect" simulation.

E2E synchronization behavior (two browsers, same track) is tested from
`/client/tests/e2e/` via Playwright, but requires this server running
(`bun run dev`) — don't duplicate that test here, just make sure
`bun run dev` boots cleanly in mock mode for it to work.

### Before finishing any task
- Run `bun test` — all tests must pass.
- Never comment out or skip a failing test to get to green. If a test
  seems wrong, flag it rather than deleting it.
- If you touched `conductor/`, double check the idle/grace period and
  bootstrap-lock tests specifically — this is the most fragile part
  of the system.

## Conventions
- TypeScript strict mode.
- Default to using Bun instead of Node.js.
  - Use `bun <file>` instead of `node <file>` or `ts-node <file>`
  - Use `bun test` instead of `jest` or `vitest`
  - Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
  - Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
  - Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
  - Use `bunx <package> <command>` instead of `npx <package> <command>`
  - Bun automatically loads `.env`, so don't use `dotenv`.

### APIs
- Uses Node `http.createServer()` with Socket.io for WebSocket support. Don't use `express`.
- Uses **Socket.io** (not raw `WebSocket`) for the real-time layer —
  deliberate choice for connect/disconnect event handling and broadcast
  API simplicity. See SPEC.md Key Technical Decisions.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile.
- `Bun.$`ls`` instead of `execa`.

### Frontend note
Frontend is deployed separately to Firebase Hosting (see `/client/AGENTS.md`).
This server only handles WebSocket + HTTP auth/health — no static file serving in production.
Dev mode: static file serving from `client/dist` is available for local testing.
Client connects via `VITE_WS_URL` env var at build time (points to this server's URL).
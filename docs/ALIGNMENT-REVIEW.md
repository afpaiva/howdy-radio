# Alignment Review — Howdy Radio (client/ vs server/ vs SPEC.md / SYSTEM.md)

**Reviewer mode:** Report-only. No edits made to code or docs.
**Date:** 2026-09-04

---

## Severity Key

- **REQUIREMENT VIOLATION / DoD FAILURE** — contradicts a stated functional requirement, architecture contract, or Definition of Done item in SPEC.md / SYSTEM.md.
- **MINOR NAMING / STYLE INCONSISTENCY** — deviates from documented conventions without breaking a stated requirement.

---

## 1. Client (`client/`)

### REQUIREMENT VIOLATION / DoD FAILURE

| Spec Reference | Implementation Reference | Finding |
|---|---|---|
| SPEC.md §Client Playback: "Audio plays in-browser using the YouTube IFrame Player API." | `client/src/App.tsx` (line 1-3) — returns only `<div>howdy-radio</div>`; no player, no state rendering. | **No YouTube IFrame Player wrapper exists.** `lib/youtube-player.ts` is missing entirely. Player never initializes. |
| SPEC.md §Client Playback: "Player displays (regardless of skin): Current track title, A small link to the source YouTube video, Name of the Slack user who posted the link" | `client/src/App.tsx` — no track title, no source link, no poster/user display. | **Playback UI is absent.** No data layer connects server state to any component. |
| SPEC.md §Skin System / Architecture §Skin Interface (`interface Skin { id; name; render(state) }`) | `client/src/skins/` directory does **not exist** (`types.ts`, `registry.ts`, and all 4 skin directories `winamp/`, `atari/`, `walkman/`, `tamagotchi/` missing). | **Skin interface and all 4 v1 skins are unimplemented.** DoD #5 ("Skin switching works without interrupting playback") impossible. |
| SPEC.md §Autoplay Handling: "On connect, client shows a 'Tune in' / 'Join broadcast' button" | `client/src/App.tsx` — no button, no interaction gate. | **Autoplay interaction requirement missing.** Playback cannot start because no user-interaction trigger exists. |
| SPEC.md §Skin Persistence: "selected skin is remembered per-user via `localStorage`" (explicitly permitted) | No `localStorage` usage anywhere in `client/src/`. | **Skin persistence unimplemented.** Even though permitted by spec, it is required by the Skin System section to function. |
| SPEC.md §Communication / Playback State: "Clients receive state immediately upon WebSocket connection." / SYSTEM.md Context Engineering: "Skeleton Implementer builds `/client/src/skins/types.ts` + a neutral skin wired to real WebSocket state" | `client/src/lib/websocket.ts` is missing. `App.tsx` does not connect to any socket. | **No WebSocket client wiring.** Client never receives `PlaybackState`. DoD #1 and #2 (synchronization across browsers / late joiner) impossible. |
| SPEC.md §Restrictions: "No client-side sync storage" (allowed exception: skin selection only) | `client/src/App.tsx` — no sync storage used (correct), but no sync state received either. The restriction is technically satisfied, but the positive requirement (render server state) is violated. | Noted: restriction met vacuously; core playback requirement broken. |
| SPEC.md §Deployment Model: "Single Bun process serves static client build (`/client/dist`)" / AGENTS.md hard rule #1 | `client/src/App.tsx` is minimal placeholder; no build output tested, no skin registry to register. | Build would succeed but produce non-functional UI. |
| SYSTEM.md §Harness: Contract test confirms every registered skin satisfies `Skin` interface. | No `tests/e2e/` contract test; `tests/e2e/example.spec.ts` is placeholder (`homepage loads`). No `src/skins/registry.ts`. | **Contract test and skin registry missing.** No verification mechanism exists. |
| SPEC.md §Non-Goals (v1): Playlist never shown — correct, not implemented; no violation. | — | Confirmed: no playlist UI exists (matches non-goal). |

### MINOR NAMING / STYLE INCONSISTENCY

| Reference | Finding |
|---|---|
| `client/src/__tests__/example.test.tsx` (line 1-12) | Placeholder Vitest test (`Hello, Howdy Radio!`) — does not test WebSocket parsing, skin interface, or playback formatting as required by AGENTS.md testing conventions. |
| `client/src/index.css` (line 1-9) | Only basic CSS reset (`* { margin: 0 ... }`). No skin-specific styles present (expected since skins missing), but also no base layout styles for playback UI. |
| `client/playwright.config.ts` line 11 (`baseURL: 'http://localhost:3003'`) | Server `index.ts` listens on port `3001`; Playwright expects `3003`. Port mismatch will break E2E tests when server runs. |

---

## 2. Server (`server/`)

### REQUIREMENT VIOLATION / DoD FAILURE

| Spec Reference | Implementation Reference | Finding |
|---|---|---|
| SPEC.md §Architecture: "Single Bun process serves: Static client build (`/client/dist`), WebSocket endpoint (same port/process)" / AGENTS.md hard rules | `server/index.ts` (line 1-28) uses `createServer` from `http` and listens on port `3001`. No static-file serving, no `Bun.serve()`, no `/client/dist` mount. | **Server entrypoint deviates from Bun.serve() architecture.** Static assets and WebSocket are not co-hosted as specified. |
| SPEC.md §Playback State (Single Source of Truth): "Server maintains authoritative state: Current track, Current playback position (timestamp), Upcoming queue (including injected ads)" | `server/index.ts` — no `PlaybackState` variable, no timeline object, no queue array. Only `io.emit("message", ...)` exists. | **Authoritative playback timeline is absent.** Server does not own track, position, or queue. DoD #1, #2, #7 impossible. |
| SPEC.md §Playback Bootstrap & Idle Behavior: idle snapshot, grace period (`RECONNECT_GRACE_PERIOD_MINUTES`), bootstrap lock, concurrent connection resolution. | `server/src/conductor/` directory missing entirely. No `disconnectedAt`, no `trackId`, no `position`, no in-process lock. | **Idle/grace logic and bootstrap concurrency unimplemented.** DoD #7 (idle behavior) broken. AGENTS.md hard rule #6 violated by omission. |
| SPEC.md §Playlist Management / Mock Mode: "If `SLACK_BOT_TOKEN` is not set, server uses a sample playlist (JSON seed)." / "Build and maintain a canonical playlist server-side" | `server/src/slack/` and `server/src/seed/` missing. `server/index.ts` has no mock-mode branch. No `playlist.json` file found. | **Mock mode (DoD #3) and playlist management unimplemented.** No Slack bot token handling (`channels:history`, `users:read`), no YouTube link extraction, no dedup by video ID. |
| SPEC.md §Ads (replaces jingle): "Ads are `ADS_COUNT` (default: 3) most recent YouTube Shorts... filtered by duration ≤ 60s... inserted into queue by dividing into segments" | `server/src/youtube/` missing. No `HOWDY_YOUTUBE_CHANNEL_ID` usage, no YouTube Data API v3 call, no duration filter (`≤60s`), no segment-based insertion algorithm. | **Ad injection (DoD #6) missing entirely.** No `ADS_COUNT` environment handling. AGENTS.md hard rule #7 (ads from start; music random start) untestable. |
| SPEC.md §Authentication: `AuthProvider` interface, `StubEmailProvider` (`@howdy.com` domain validation), signed session cookie/JWT. | `server/src/auth/` missing. `index.ts` has no auth endpoint, no `authenticate()` call, no cookie/JWT logic. | **Authentication (DoD #4) absent.** No `AUTH_PROVIDER` environment variable handling. AGENTS.md hard rule #3 (two distinct Slack/auth credentials) irrelevant because neither exists. |
| SPEC.md §Communication: "Socket.io (over WebSocket): Real-time playback state sync... broadcast via `io.emit()`" / SYSTEM.md Data Flow steps 2-6. | `server/index.ts` has `io.emit("message", ...)` but no playback-state event name (e.g. `tick`, `state`, `track-changed`). No `PlaybackState` shape emitted. | **WebSocket broadcasts do not carry playback state.** Socket.io is present (matches spec choice) but used only for generic message relay. |
| SPEC.md §Server-authoritative timeline / AGENTS.md hard rule #1: "This server is the single source of truth for playback state." | `server/index.ts` — clients can emit arbitrary messages (`socket.on("message", ...)`) and server relays them back (`io.emit`). No server-side enforcement that clients only send control intents, never state. | **Server does not guard against clients writing sync state.** Architecture contract violated. |
| SPEC.md §Deployment Model / Key Technical Decisions: "Bun for server — Native WebSocket, fast startup" / "Uses `Bun.serve()`" | `server/index.ts` imports from `http` (`createServer`) instead of using Bun native APIs (`Bun.serve`). | **Server runtime choice deviated from spec/recommended Bun API.** Not a functional break on its own, but contradicts architecture docs. |
| SYSTEM.md §Agent Roles / Orchestration: Server Implementer should build `conductor/` as sequential unit; `ws/` for message handling; `slack/` for bot integration. | None of these directories/files exist. Only `index.ts` exists in root. | **Entire backend architecture (conductor, slack, youtube, auth, ws, seed) is unimplemented.** Only a minimal Socket.io skeleton remains. |

### MINOR NAMING / STYLE INCONSISTENCY

| Reference | Finding |
|---|---|
| `server/index.test.ts` (line 1-15) | Placeholder tests (`basic arithmetic`, `string operations`) — does not cover timeline math, ad distribution, Slack dedup, bootstrap lock, or mock mode as required by AGENTS.md. |
| `server/package.json` (line 4) `"module": "index.ts"` | Unusual `module` field value; standard is file path or not present. Minor config deviation. |
| `server/index.ts` line 25 (`const port = 3001`) | Port `3001` does not match Playwright `baseURL` (`localhost:3003`) in `client/playwright.config.ts`. Minor integration mismatch. |

---

## 3. Cross-Cutting / System-Level (`docs/`, root, monorepo)

### REQUIREMENT VIOLATION / DoD FAILURE

| Spec / System Reference | Implementation Reference | Finding |
|---|---|---|
| SPEC.md §Architecture: Monorepo structure shows `/client`, `/server`, `/docs` — confirmed present. | Directory structure matches (client/, server/, docs/). | Confirmed correct. |
| SPEC.md §Mock Mode (required): Must run locally without `SLACK_BOT_TOKEN`. | No mock playlist JSON (`src/seed/playlist.json` missing), no fallback branch in server code. | **Mock mode non-functional.** DoD #3 fails. |
| SYSTEM.md §Parallel Work / Track A + Track B: Skin Implementers (4 skins) + Server Implementer should have produced isolated directories with zero file overlap. | Only empty/minimal skeletons exist; no skin directories, no server `src/` subdirectories. | **Parallel work output is essentially absent.** Not a deviation from architecture, but a deviation from the expected completed state described in the System Map. |
| SYSTEM.md §Deterministic Controls: "Tests must pass before a task is considered done (`bun test`)" / "No secrets committed (.env gitignored)" | `.env` file missing (correct — not committed), but `.env.example` also missing. `.gitignore` exists (`.env` listed, likely). `bun test` runs placeholder arithmetic tests only. | **No `.env.example` provided** (minor for mock mode, since spec requires zero-config local dev). No actual harness (`bun run verify`) implemented. |
| SPEC.md §Non-Goals: "Playlist editing / DJ controls" — not implemented; correct. "No Spotify" — no Spotify references found; correct. "No persistence across server restarts" — no persistence layer present; correct (matches non-goal). | — | Non-goals satisfied by omission (correct). |
| SYSTEM.md §Human Decisions (line 184-189): "Simplified reconnect grace-period design to stateless global timestamp snapshot" / "Discovered unintended deviation where client drifted from Vite to Bun's native bundler — reverted to Vite" | `client/vite.config.ts` uses Vite (`defineConfig` + `@vitejs/plugin-react`). `client/package.json` depends on Vite. | Confirmed: Vite retained; no drift to Bun bundler (correct). |

---

## 4. Definition of Done Assessment (SPEC.md §Definition of Done)

| # | DoD Item | Status | Evidence |
|---|---|---|---|
| 1 | Two browsers open simultaneously show same track (±1–2s) | **FAIL** | Client `App.tsx` renders no playback state; server `index.ts` emits no state events. No synchronization mechanism exists. |
| 2 | Third browser joining later syncs to live position | **FAIL** | No WebSocket state delivery (`PlaybackState`) implemented. Late joiner receives nothing to sync from. |
| 3 | App runs locally in mock mode (no `SLACK_BOT_TOKEN`) | **FAIL** | No mock playlist (`seed/playlist.json`) and no mock-mode branch in server. Server requires Socket.io connection but provides no content. |
| 4 | Login works and blocks non-`@howdy.com` accounts (`StubEmailProvider`) | **FAIL** | `server/src/auth/` missing. No `AuthProvider` interface, no email validation, no session cookie/JWT. |
| 5 | Skin switching works without interrupting playback | **FAIL** | `client/src/skins/` missing entirely (no `types.ts`, no registry, no skins). Playback itself also missing. |
| 6 | Ads play at random distributed positions, from start, sourced from Howdy YouTube Shorts | **FAIL** | `server/src/youtube/` missing. No `HOWDY_YOUTUBE_CHANNEL_ID` usage, no duration filter (≤60s), no segment insertion algorithm. |
| 7 | Idle behavior: server halts clock when no clients; 5 min grace period; reconnect syncs to advanced position | **FAIL** | `server/src/conductor/` missing. No `disconnectedAt`, `RECONNECT_GRACE_PERIOD_MINUTES`, no bootstrap lock, no timeline computation. |

---

## 5. Severity Summary

### Critical / Requirement Violation (must fix to meet spec)
1. **Client playback UI and WebSocket sync** — `App.tsx`, missing `skins/`, missing `lib/websocket.ts`.
2. **Skin interface and all 4 v1 skins** — `types.ts`, `registry.ts`, `winamp/`, `atari/`, `walkman/`, `tamagotchi/`.
3. **Server authoritative timeline** — missing `conductor/`, `PlaybackState`, queue, tick broadcast.
4. **Server auth** (`StubEmailProvider`) — missing `auth/`, domain validation, cookie/JWT.
5. **Mock mode** — missing `seed/playlist.json`, no fallback branch.
6. **Slack playlist integration** — missing `slack/`, history extraction, dedup, `users:read` lookup.
7. **Ads / YouTube Shorts** — missing `youtube/`, duration filter, segment distribution.
8. **Idle/grace/bootstrap logic** — missing `conductor/`, concurrent lock, stateless snapshot.
9. **Static file serving + co-hosted WebSocket** — server should use `Bun.serve()` and serve `/client/dist`.
10. **All 7 DoD items fail.**

### Minor / Style / Integration Mismatch
1. Placeholder tests (`example.test.tsx`, `index.test.ts`).
2. Playwright `baseURL` (`3003`) vs server port (`3001`).
3. `.env.example` missing (expected by mock-mode/dev conventions).
4. Server `package.json` `"module"` field is unconventional.

---

## 6. Notes / Not Expanded Beyond Spec

- The user request included: "Distinguish severity. Separate 'this breaks a stated requirement or Definition of Done item' from 'minor naming/style inconsistency.'" This report does that.
- No new feature suggestions added (e.g., "add Spotify" or "add chat"). Non-goals (no Spotify, no mobile, no DJ controls, no persistence) are correctly unimplemented and not flagged as misalignments.
- The `docs/AI-DEV-LOG.md` mentioned in SYSTEM.md is missing; this is a documentation gap, not a code misalignment, and is noted only in passing (not a spec violation since it is referenced as optional evidence, not a requirement).

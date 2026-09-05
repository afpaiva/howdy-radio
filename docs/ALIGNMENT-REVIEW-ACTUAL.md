# Alignment Review — Howdy Radio (actual code vs SPEC.md / SYSTEM.md)

**Reviewer mode:** Report-only. No edits made.
**Date:** 2026-09-05
**Scope:** Read `docs/SPEC.md`, `docs/SYSTEM.md`, and actual `client/src/`, `server/src/`, `server/index.ts`, `client/src/App.tsx`, `client/src/lib/websocket.ts`, `client/src/skins/*`, `server/src/conductor/conductor.ts`, `server/src/auth/authProvider.ts`, `server/src/slack/slack.ts`, `server/src/youtube/youtube.ts`, `server/src/ws/handler.ts`, `server/src/seed/playlist.json`.

---

## Severity Key

- **REQUIREMENT VIOLATION / DoD FAILURE** — contradicts SPEC.md / SYSTEM.md (functional, architecture, or Definition of Done).
- **MINOR / STYLE / WIRE CONTRACT** — deviates from documented convention but does not break a stated requirement by itself.

---

## 1. Critical / Requirement Violations

### 1.1 Playlist shown in UI (violates Non-Goal + SPEC.md Playlists)

- **SPEC:** SPEC.md §Non-Goals: "Playlist never shown to listeners; radio-like experience only." SPEC.md §Playlist Management: "Playlist is NOT shown in the frontend UI."
- **Code:** Every registered skin renders the queue:
  - `client/src/skins/neutral/index.tsx` lines 122-134 (`Up next`, `queue` list with `queue-item`).
  - `client/src/skins/winamp/index.tsx` lines 401-427 (`QueueList`, `Up Next`).
  - `client/src/skins/walkman/index.tsx` lines 267-282 (`Queue` component, `Up next`).
  - `client/src/skins/atari/index.tsx` lines 139-148 (`Up Next` section, `queue-item`).
  - `client/src/skins/tamagotchi/index.tsx` lines 631-653 (`inbox` queue panel).
- **Impact:** DoD #5 (skin switching) and Non-Goals both broken by exposing the playlist. The skin contract test (`client/src/__tests__/skin-contract.test.tsx`) actually asserts queue presence (line 234-258), meaning the contract test enforces the opposite of the spec.

### 1.2 No YouTube IFrame Player (violates Client Playback requirement + DoD #1, #2)

- **SPEC:** SPEC.md §Client Playback: "Audio plays in-browser using the YouTube IFrame Player API." No audio re-hosting on server.
- **Code:** `client/src/lib/websocket.ts` connects via Socket.io but never initializes any player. `client/src/App.tsx` renders skins only — no `youtube-player.ts` file exists in `client/src/lib/` (referenced in `client/AGENTS.md` but missing). There is no `<iframe>` or YouTube `YT.Player` creation anywhere.
- **Impact:** Audio never plays. Synchronization (DoD #1) is impossible because there is no playback mechanism to synchronize. The autoplay gate (`Tune in`) is cosmetic: clicking it sets `tunedIn` (`App.tsx` line 74) but does not start audio.

### 1.3 Autoplay interaction gate broken (violates Autoplay Handling)

- **SPEC:** SPEC.md §Autoplay Handling: "On connect, client shows a 'Tune in' / 'Join broadcast' button; clicking it satisfies the interaction requirement and starts playback synchronized to the current server position."
- **Code:** `client/src/App.tsx` lines 72-79: button calls `setTunedIn(true)` but never calls `tuneIn()` from the `usePlayback()` hook (`client/src/lib/websocket.ts` line 188-190). The hook emits `join` automatically on `connect` (`line 141`), so the user interaction is not the trigger — and since there is no player, nothing starts regardless.
- **Impact:** Browser autoplay policy is not properly satisfied by the user's click action.

### 1.4 Server does not serve `/client/dist` (violates Deployment Model)

- **SPEC:** SPEC.md §Deployment Model: "Single Bun process serves: Static client build (`/client/dist`), WebSocket endpoint (same port/process)."
- **Code:** `server/index.ts` lines 34-44 (`createServer` handler) returns `<!DOCTYPE html><html><body>Loading...</body></html>` for `/` and `/index.html`, and `404` for everything else. It never serves files from `client/dist`. It uses Node `http.createServer` instead of `Bun.serve()` (though `Bun.serve()` isn't strictly required, serving statics is).
- **Impact:** The deployed app would show "Loading..." with no assets. DoD #1 fails at deployment level.

### 1.5 WebSocket protocol mismatch between client and server

- **SPEC:** SPEC.md §Communication: "Socket.io (over WebSocket): ... broadcast via `io.emit()`" with events `state`, `tick`, `idle`, and `join` control intent.
- **Client (`client/src/lib/websocket.ts`):**
  - Emits `join` directly (`line 141`: `socket.emit("join")`).
  - Listens for `state` (`line 157`), `tick` (`line 166`), `idle` (`line 175`).
- **Server (`server/src/ws/handler.ts`):**
  - Listens for generic `message` event (`line 44`: `socket.on("message", ...)`), expecting `{ type: "get-state" | "join-broadcast" | "pause" | "seek" }` (`lines 69-92`).
  - Never listens for the direct `join` event emitted by the client.
  - Emits `state` on connect (`line 58`) and broadcasts `state` every second (`startTicking`, line 107), but **never emits `tick`** or `idle`.
- **Impact:** The client's `join` intent is lost (server ignores it). The client's `tick` listener never receives updates (server sends full `state` instead). The `idle` event is never broadcast by the server (`line 175` listener is unreachable).

### 1.6 Slack playlist ignores fetched data during bootstrap/live computation

- **SPEC:** SPEC.md §Playlist Management: server builds canonical playlist from Slack; mock mode falls back to JSON seed.
- **Code:**
  - `server/src/slack/slack.ts` `extractYouTubeLinks()` creates tracks with `duration: 0` (`line 84`), `title: url` (`line 83`), and `postedBy.displayName = msg.user` (raw user ID, `line 89`) — it never calls `getUserInfo()` (`line 163-196`) to resolve `display_name` / `real_name`.
  - `server/src/conductor/conductor.ts` `getAvailableTracks()` (`line 363`) always returns `SeedPlaylist.getMusicTracks()` — it ignores any playlist set by `setPlaylist()` (`line 371`). When queue empties (`line 264-276`), `bootstrapFresh()` (`line 202`) also uses `SeedPlaylist.getMusicTracks()` (`line 203`).
  - `findTrackById()` (`line 352`) only searches `SeedPlaylist.getTracks()`.
- **Impact:** Even when `SLACK_BOT_TOKEN` is set and `refreshPlaylist()` fetches real links, the conductor ignores them for track selection/resumption. The `users:read` scope (SPEC.md §Playlist Management) is never exercised. Mock mode works (`seed/playlist.json` exists), but real-mode playlist is effectively discarded by the timeline engine.

### 1.7 Auth provider not wired (violates Auth + DoD #4)

- **SPEC:** SPEC.md §Authentication: `AuthProvider` interface, `StubEmailProvider` validates `@howdy.com`, issues signed cookie/JWT. `AUTH_PROVIDER` env var selects provider.
- **Code:** `server/src/auth/authProvider.ts` implements the interface correctly (`StubEmailProvider` validates domain, `line 52-62`). However, `server/index.ts` never imports or uses `auth/`. There is no `/auth` endpoint, no cookie issuance, no session logic.
- **Impact:** DoD #4 ("Login works and blocks accounts not matching `@howdy.com` domain") impossible. The `AuthProvider` interface exists but is orphaned.

### 1.8 Ad injection algorithm deviates from spec

- **SPEC:** SPEC.md §Ads: "Ads are inserted into the queue by dividing it into `ADS_COUNT` equal segments and randomly selecting one ad position per segment."
- **Code:** `server/src/conductor/conductor.ts` `injectAds()` (`lines 301-332`). The loop pushes music tracks for a segment (`lines 319-322`), then pushes an ad at the **end** of that segment (`lines 325-328`). It does **not** pick a random index *within* the segment; the ad is always appended after the segment's music tracks. The comment (`line 298`) claims random placement within the segment, but the implementation clusters ads at segment boundaries.
- **Impact:** Minor for hackathon scope, but does not match the documented algorithm.

---

## 2. Minor / Style / Wire-Contract Issues

### 2.1 Client test setup broken (jsdom missing in Vitest config)

- **Evidence:** Running `bun test` in `client/` yields 114 failures (`ReferenceError: document is not defined`) in `walkman/walkman.test.tsx`, `atari/contract.test.tsx`, etc. `client/src/__tests__/setup.ts` may be missing or not loaded properly.
- **Severity:** Minor (tests don't affect runtime behavior, but harness requirement from SYSTEM.md is broken).

### 2.2 Skin contract test enforces queue display (opposite of spec)

- **Evidence:** `client/src/__tests__/skin-contract.test.tsx` lines 233-258 assert `queue` must exist when non-empty and `queue-item` elements must be present. This aligns with the skins' behavior but contradicts SPEC.md §Non-Goals / §Playlist Management.
- **Severity:** Minor naming/style — the contract test is consistent with the skins, but both are misaligned with the spec.

### 2.3 Playwright `baseURL` port mismatch

- **Evidence:** `client/playwright.config.ts` uses `baseURL: 'http://localhost:3003'`; `server/index.ts` listens on `port: 3001` (`line 26`).
- **Severity:** Minor integration mismatch (would break E2E when run together).

### 2.4 `server/src/slack/slack.ts` uses raw `msg.user` for display name

- **SPEC:** SPEC.md §Client Playback: "Name of the Slack user who posted the link (requires `users:read` bot scope): use the user's `display_name`, falling back to `real_name` if the display name is empty."
- **Code:** `slack.ts` line 86-90 creates `postedBy` with `displayName: msg.user || "unknown"` (raw Slack user ID). `getUserInfo()` exists (`line 163`) but is never called in `extractYouTubeLinks()`.
- **Severity:** Minor relative to the larger playlist-ignored issue (§1.6), but specifically violates the user-display contract.

---

## 3. Definition of Done Assessment (SPEC.md §Definition of Done)

| # | DoD Item | Status | Evidence |
|---|---|---|---|
| 1 | Two browsers open simultaneously show same track (±1–2s) | **FAIL** | No YouTube player (`youtube-player.ts` missing); no playback mechanism. Socket.io `state` emitted by server, but client doesn't initialize audio. |
| 2 | Third browser joining later syncs to live position without restart | **FAIL** | Client receives `state` via WebSocket (`line 157`), but no player exists to sync to the server's `position`/`currentTrack`. Also server doesn't emit `tick`. |
| 3 | App runs locally in mock mode (`SLACK_BOT_TOKEN` unset) | **PASS (partial)** | `seed/playlist.json` exists; `SlackService` falls back (`slack.ts` line 17-18); `Conductor` uses seed (`getAvailableTracks`). However, the playlist fetched by `refreshPlaylist()` is ignored by the conductor (§1.6). Mock mode works for initial bootstrap but doesn't reflect any external updates. |
| 4 | Login works and blocks non-`@howdy.com` accounts (`StubEmailProvider`) | **FAIL** | `auth/authProvider.ts` exists but is not imported or used by `server/index.ts`. No endpoint, no cookie/JWT. |
| 5 | Skin switching works without interrupting playback | **FAIL** | Skin registry exists (`registry.ts`) and `App.tsx` allows switching (`line 52`), but since playback (audio + server sync) is broken, switching only changes cosmetic UI. The queue is shown in all skins (§1.1). |
| 6 | Ads play at random distributed positions, from start, sourced from Howdy YouTube Shorts | **FAIL** | `youtube/youtube.ts` fetches Shorts with duration filter (`line 83`), and `injectAds()` inserts ads. However, the insertion is not random within segments (§1.8). More critically, ads and tracks are never actually played (no player). |
| 7 | Idle behavior: server halts clock when no clients; 5 min grace period; reconnect syncs to advanced position | **PASS (partial)** | `Conductor` implements `idleSnapshot`, `gracePeriodSeconds` (`line 15`), `onClientDisconnect()` (`line 67-83`), and `computeOnDemandState()` (`line 133`). The logic is present but never triggered properly because `WsHandler` doesn't handle disconnect/bootstrap in the way spec expects (it just calls `onClientConnect()` / `onClientDisconnect()` correctly, but the server doesn't serve statics or emit `tick`). The core logic is implemented but untested end-to-end. |

---

## 4. What Works / Aligned

- **Skin interface (`types.ts`)** matches `SPEC.md` Architecture §Skin Interface (`id`, `name`, `render(state)`).
- **Skin registry (`registry.ts`)** registers all 5 skins correctly.
- **Mock mode** (`seed/playlist.json`) exists; `SlackService` and `YouTubeService` have mock fallbacks.
- **Auth interface (`authProvider.ts`)** matches the `AuthProvider` contract from SPEC.md.
- **Conductor timeline logic** (`conductor.ts`) implements idle snapshot, grace period, bootstrap lock, and live state computation as specified (§1.7 of SPEC.md).
- **Vite retained** (`client/package.json` uses Vite, not Bun bundler) — aligns with corrected docs (`docs/AI_DEV_LOG.md`).
- **No secrets committed** (`.gitignore` has `.env`); `.env` not present.

---

## 5. Key Divergences Summary

| Severity | Count | Key Areas |
|---|---|---|
| Critical (breaks spec / DoD) | 8 items (§1.1–§1.8) | Queue shown in UI, no YouTube player, broken autoplay gate, no static serving, Socket.io protocol mismatch, Slack playlist ignored, auth not wired, ad insertion algorithm mismatch. |
| Minor / contract | 4 items (§2.1–§2.4) | Client test setup broken, contract test enforces opposite of spec, Playwright port mismatch, Slack user display name unresolved. |

---

*No code or docs were edited during this review. All observations are based on file reads at commit time.*

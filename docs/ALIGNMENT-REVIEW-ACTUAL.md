# Alignment Review — Howdy Radio (Actual vs SPEC.md / SYSTEM.md)

**Reviewer mode:** Report-only. No edits made to code or docs.  
**Date:** 2026-09-05  
**Method:** Read `/docs/SPEC.md`, `/docs/SYSTEM.md`, and the full codebase (`client/src/`, `server/src/`, `server/index.ts`, `docs/`). No reference to prior review files was used; observations are from direct file inspection only.

---

## Severity Key

- **REQUIREMENT VIOLATION / DoD FAILURE** — contradicts a stated functional requirement, architecture contract, or Definition of Done item in SPEC.md / SYSTEM.md.
- **MINOR NAMING / STYLE / WIRE CONTRACT** — deviates from documented convention without breaking a stated requirement by itself.

---

## 1. Requirement Violations

### 1.1 Client–server control-intent event names do not match (Autoplay / Socket.io contract)

| Spec reference | Implementation reference | Finding |
|---|---|---|
| SPEC.md §Autoplay Handling: client shows a "Tune in" / "Join broadcast" button; clicking it satisfies the interaction requirement and starts playback synchronized to the server. SPEC.md §Communication: control events via Socket.io. `client/src/skins/types.ts` defines `ClientToServerEvents`. | `client/src/lib/websocket.ts` line 190: `socketRef.current?.emit("join-broadcast")`. `client/src/skins/types.ts` line 139: `"join-broadcast": () => void;`. `server/src/ws/handler.ts` line 37: `socket.on("join", () => { ... })`. | The client emits `"join-broadcast"`; the server listens for `"join"`. The events never match, so the server never receives the client’s control-intent (`handleJoin()` is never triggered by user interaction). The client’s `App.tsx` (`line 42`) refers to the event as `join` in a comment, reinforcing the naming confusion. Playback starts locally because `enabled` flips independently, but the documented wire contract (`ClientToServerEvents` ↔ server listener) is broken. |

**Severity:** Requirement violation (wire contract broken; autoplay interaction signal lost to server).

---

### 1.2 Slack user name fallback ignores `real_name` (Playlist / Playback attribution)

| Spec reference | Implementation reference | Finding |
|---|---|---|
| SPEC.md §Client Playback / §Playlist Management: "Name of the Slack user who posted the link (requires `users:read` bot scope): use the user's `display_name`, falling back to `real_name` if the display name is empty (standard Slack app behavior)." | `server/src/slack/slack.ts` lines 88–90: `displayName = userInfo?.displayName || msg.user || "unknown"`. `userInfo?.displayName` is `user.profile?.display_name \|\| ""`. When empty, it falls back to `msg.user` (raw Slack user ID, e.g. `U012AB3CD4`), not to `userInfo?.realName` (`user.profile?.real_name` or `user.real_name`). The `realName` field is extracted (`line 90`) but never used as a display-name fallback. | When a Slack user has an empty `display_name`, the track attribution shows the raw user ID instead of the `real_name`, violating the standard Slack-app behavior documented in the spec. The `users:read` scope is present (`getUserInfo()` uses `/users.info`), but the result is applied incorrectly. |

**Severity:** Requirement violation (user attribution contract broken).

---

## 2. Minor / Style / Wire-Contract Issues

### 2.1 Development port / WS URL mismatches (not a functional break in production)

| Reference | Finding |
|---|---|
| `client/src/lib/websocket.ts` line 35–37: `WS_URL` defaults to `"http://localhost:3000"` (`VITE_WS_URL` override available). `client/playwright.config.ts`: `baseURL: 'http://localhost:3003'`. `server/index.ts` line 70: `port: 3001`. | Development ports are not aligned (`client` dev server, Playwright, server, and default WS URL use four different ports). In production (`PROD` flag true) `WS_URL` is `undefined`, so the client connects to its own origin and the mismatch disappears. This is a minor integration/config inconsistency, not a spec violation. |

---

### 2.2 Server entrypoint uses `http.createServer` instead of `Bun.serve()`

| Spec / System reference | Implementation reference | Finding |
|---|---|---|
| SPEC.md Key Technical Decisions: "Bun for server — Native WebSocket, fast startup, TypeScript support, single binary deployment." `AGENTS.md` (server): "Uses `Bun.serve()`"; "Don't use `express`." `SYSTEM.md`: references `Bun.serve()` as preferred API. | `server/index.ts` line 92: `const httpServer = createServer((req, res) => { ... });` (imported from Node `http`). `Bun.serve()` is not used. | The server still achieves co-hosted static files + Socket.io on a single port (`3001`), so the deployment model is satisfied functionally. Using `createServer` from `http` instead of the native Bun API is a deviation from the documented convention but does not break any stated requirement. |

---

### 2.3 `Conductor.getState()` computes idle-state without applying or clearing snapshot

| Spec reference | Implementation reference | Finding |
|---|---|---|
| SPEC.md §Playback Bootstrap & Idle Behavior: idle computation should happen on the next connection (`onClientConnect()` triggers the bootstrap lock and applies the result). | `server/src/conductor/conductor.ts` lines 42–47 (`getState()`): when `clientCount === 0`, returns `this.computeOnDemandState()` but does **not** call `this.applyState()` or `this.idleSnapshot = null`. Only `acquireBootstrapLock()` (`line 104`) applies the computed state and clears the snapshot. | Since `WsHandler` only calls `onClientConnect()` (not `getState()`) for new connections, production behavior is unaffected. The API surface (`getState()`) is slightly inconsistent with the internal state machine, making it a minor naming/style issue at the design level. |

---

### 2.4 Client `App.tsx` comment uses `"join"` instead of `"join-broadcast"`

| Implementation reference | Finding |
|---|---|
| `client/src/App.tsx` line 42: `* (emitting the `join` control intent) ...`. The actual emitted event (via `tuneIn()` → `usePlayback()`) is `"join-broadcast"` (`client/src/lib/websocket.ts` line 190, `client/src/skins/types.ts` line 139). | Minor naming/style inconsistency in inline documentation. |

---

## 3. Confirmed Aligned Areas (not misalignments)

The following spec sections are implemented correctly and do **not** represent misalignments:

- **Skin interface & registry** (`client/src/skins/types.ts`, `registry.ts`): matches `SPEC.md` Architecture §Skin Interface; all 5 skins (`winamp`, `atari`, `walkman`, `tamagotchi`, `neutral`) implement `Skin` exactly.
- **Skin persistence via `localStorage`** (`client/src/App.tsx` line 29, `STORAGE_KEY`): explicitly permitted by `SPEC.md` §Skin Persistence; no sync-state storage is used.
- **Up Next / Queue display** (`SPEC.md` §Up Next Display): intentionally kept across all 5 skins; clients render queue data received from server (`WebSocket` `state`), never computing/reordering independently; `skin-contract.test.tsx` validates this.
- **Auth interface + `StubEmailProvider`** (`server/src/auth/authProvider.ts`): `AuthProvider` interface matches spec; `StubEmailProvider` validates `@howdy.com` domain; `AUTH_PROVIDER` env variable handled; JWT cookie (`/auth/login`) issued correctly.
- **Mock mode** (`server/src/seed/playlist.json`, `SlackService.isMockMode()`, `YouTubeService.isMockMode()`): falls back to seed playlist/ads when `SLACK_BOT_TOKEN` or `YOUTUBE_API_KEY` is missing.
- **Slack playlist extraction** (`server/src/slack/slack.ts`): `channels:history` used; `extractYouTubeUrls()` handles YouTube / YouTube Music / Shorts / embed links; `videoMap` deduplicates by video ID keeping the most recent post (`messages.reverse()`); `users.info` (`users:read`) used for user lookup.
- **YouTube Shorts / Ads** (`server/src/youtube/youtube.ts`): fetches from `HOWDY_YOUTUBE_CHANNEL_ID`; filters by `duration <= 60`; returns `ADS_COUNT` most recent; `parseDuration()` handles ISO 8601 durations.
- **Ad injection algorithm** (`server/src/conductor/conductor.ts` `injectAds()`): divides playlist into `ADS_COUNT` segments; selects random ad position within each segment (`Math.random()`); ads play from start (client treats `isAd` with `position = 0`); `bootstrapFresh()` uses random start for music (`useRandomStart = true`) and `0` for non-bootstrap transitions (`false`).
- **Play state / WebSocket sync** (`client/src/lib/websocket.ts`, `server/src/ws/handler.ts`): server broadcasts `state`, `tick`, `idle`; clients receive and normalize (`normalizeState`, `normalizeTrack`) without owning sync state; `connectionStatus` is derived locally; no `localStorage`/`sessionStorage` for playback state.
- **Autoplay interaction gate** (`client/src/App.tsx`): shows "Tune in" button; `tunedIn` gate prevents `useYouTubePlayer()` from starting until user interaction; `youTube-player.ts` uses `autoplay: 0` and only plays when `enabled` is `true`.
- **Idle / Grace behavior** (`server/src/conductor/conductor.ts`): `idleSnapshot` stored on disconnect (`onClientDisconnect()`); `computeOnDemandState()` computes `elapsed`, checks grace period (`RECONNECT_GRACE_PERIOD_MINUTES`), resumes same track if `position + elapsed < duration`, otherwise fresh bootstrap; concurrent connections handled by `acquireBootstrapLock()`.
- **No audio re-hosting** (`SPEC.md` Restrictions): server never downloads/proxies audio bytes; client uses `YouTube IFrame Player API` (`youtube-player.ts`).
- **No Spotify / other sources** (Non-Goals): only YouTube links handled (`slack/slack.ts` regexes).
- **No persistence across server restarts** (Non-Goals): playlist rebuilt on startup (`refreshPlaylist()` in `server/index.ts`).

---

## 4. Severity Summary

| Severity | Count | Areas |
|---|---|---|
| **Critical / Requirement Violation** | 2 items (§1.1, §1.2) | Socket.io control-intent event mismatch (`join` vs `join-broadcast`); Slack `display_name` fallback ignores `real_name` (uses raw user ID). |
| **Minor / Naming / Style / Wire Contract** | 4 items (§2.1, §2.2, §2.3, §2.4) | Port/config mismatches; server uses `createServer` instead of `Bun.serve()`; `Conductor.getState()` read-only inconsistency; inline comment naming mismatch (`"join"` vs `"join-broadcast"`). |

---

*No code or docs edited. Observations derived solely from direct inspection of `/docs/SPEC.md`, `/docs/SYSTEM.md`, and source files at the time of review. Previous review documents were not consulted or referenced.*

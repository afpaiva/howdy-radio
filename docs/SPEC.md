# Howdy Radio — Specification

## Objective

Build an internal "synchronized radio" station for the Howdy Slack workspace. Colleagues post music links (YouTube/YouTube Music) in a designated Slack channel. All connected clients play the same track at the same timestamp, simulating a real radio broadcast.

---

## Functional Requirements

### Authentication

Authentication is implemented behind an `AuthProvider` interface, decoupling the login flow from the identity verification mechanism. This allows swapping the underlying provider (e.g. real Google Workspace or Slack OAuth) without touching the rest of the application.

**Interface contract:**
```typescript
interface AuthProvider {
  // Resolves a login attempt into an identity, or rejects it.
  authenticate(input: AuthInput): Promise<{ email: string; name?: string }>;
}
```

**v1 implementation — `StubEmailProvider`:**
- User submits their email address via a simple form (no external provider).
- Server validates the email matches the `@howdy.com` domain suffix.
- On success, issues a signed session cookie/JWT.
- **Known limitation**: this does not cryptographically verify identity — any string ending in `@howdy.com` is accepted. This is an accepted trade-off for hackathon scope (no admin access to configure real SSO within the competition window), not a production-ready auth mechanism.

**Future swap path:**
- `GoogleWorkspaceProvider` or `SlackOAuthProvider` would implement the same `AuthProvider` interface, replacing `StubEmailProvider` behind a single `AUTH_PROVIDER` environment variable — no changes required elsewhere in the codebase.

### Playlist Management
- Server periodically fetches messages from the configured Slack channel via bot token.
- Extract YouTube/YouTube Music links from messages.
- **History extraction:** the server extracts the channel's full history (not just messages posted after the bot was added) — the `channels:history`/`groups:history` scopes grant access to this, and ignoring it would unnecessarily reduce the available song pool.
- **Deduplication:** deduplicate based on video ID while keeping the most recent post — this prevents excessive repetition of the same song and keeps the playlist predictable.
- Build and maintain a canonical playlist server-side (not on the frontend).
- Playlist updates automatically as new links are posted.
- Playlist is NOT shown in the frontend UI.

### Playback State (Single Source of Truth)
- Server maintains authoritative state:
  - Current track
  - Current playback position (timestamp)
  - Upcoming queue (including injected ads)
- Clients receive state immediately upon WebSocket connection.
- Server broadcasts state changes (track changes, seeks, pauses) to all clients in real time.

### Client Playback
- Audio plays in-browser using the YouTube IFrame Player API.
- No audio re-hosting or processing on the server.
- Clients synchronize to server time; no localStorage/sessionStorage for sync state.
- Player displays (regardless of skin):
  - Current track title
  - A small link to the source YouTube video
  - Name of the Slack user who posted the link (requires `users:read` bot scope): use the user's `display_name`, falling back to `real_name` if the display name is empty (standard Slack app behavior).

### Autoplay Handling
- Browsers block audio autoplay without user interaction.
- On connect, client shows a "Tune in" / "Join broadcast" button; clicking it satisfies the interaction requirement and starts playback synchronized to the current server position.

### Skin System
- The frontend provides a skin gallery where users can switch between visual themes.
- All skins render the same underlying playback state (current track, position, connection status) — only presentation differs.
- **v1 skins:** Winamp, Atari (Space Invaders style), Walkman, Tamagotchi.
- Additional skins can be added later by implementing the shared `Skin` interface (see Architecture).
- The playlist itself is never shown in the UI (consistent with Non-Goals).
- **Skin persistence:** the selected skin is remembered per-user via `localStorage`. This is explicitly permitted — the "no localStorage for sync state" restriction applies only to playback synchronization state (to ensure the server remains the single source of truth). Skin selection is purely a UI preference and does not affect client synchronization.

### Ads (replaces original static jingle concept)
- Ads are the `ADS_COUNT` (default: 3, configurable) most recent YouTube Shorts published on the Howdy YouTube channel (`HOWDY_YOUTUBE_CHANNEL_ID`).
- Shorts are identified via the YouTube Data API v3, filtered by video duration ≤ 60s. This duration threshold is the industry-standard proxy since the YouTube API doesn't expose an official `isShort` field; it may occasionally include a short video that isn't technically a Short, but more sophisticated heuristics are not worth the effort for hackathon scope.
- Ad list is refreshed periodically (e.g. hourly), not per-request, to conserve API quota.
- Ads are inserted into the queue by dividing it into `ADS_COUNT` equal segments and randomly selecting one ad position per segment. This ensures even distribution without clustering, and avoids the complexity of "minimum spacing" neighbor-checking logic.
- Ads always play from the start (no random start position — unlike music tracks).

### Playback Bootstrap & Idle Behavior

The server does not run a background timer while idle. Instead, it
stores a single snapshot when the last client disconnects, and
computes state on-demand when the next connection arrives (regardless
of who connects — no per-user/session identity involved).

**On last client disconnect:**
- Store `{ trackId, position, disconnectedAt: timestamp }`.
- Stop broadcasting/ticking — no CPU or network cost while empty.

**On next connection (any connection):**
1. Compute `elapsed = now - disconnectedAt`.
2. If `elapsed <= RECONNECT_GRACE_PERIOD_MINUTES * 60` **and**
   `position + elapsed < track.duration`:
   resume the same track at `position + elapsed`, and resume the
   broadcast clock from there — simulating a radio that kept playing
   while nobody was listening.
3. Otherwise (grace period expired, or not enough time left in that
   track): treat this as a fresh bootstrap — refresh the playlist from
   Slack, pick a new random track, and start at a random position
   within it (same logic as the original empty-playlist bootstrap).
4. Concurrent connections arriving during this computation resolve to
   the same result via the existing in-process bootstrap lock (see
   Data Flow — Initial connection race condition).
- New clients joining while already-connected clients exist always
  sync to the current live position (never restart the track, and
  never re-run this snapshot logic — that only applies to the
  transition from zero clients to one or more).

### Mock Mode
- If `SLACK_BOT_TOKEN` is not set, server uses a sample playlist (JSON seed).
- Enables local development without Slack credentials.

---

## Architecture

### Monorepo Structure
```
/client   -> Bun (native HTML-import bundler) + React frontend (Walkman-style UI)
/server   -> Bun (WebSocket conductor + Slack integration + static file serving)
/docs     -> SPEC.md, SYSTEM.md, AI-DEV-LOG.md
```

### Deployment Model
- Single Bun process serves:
  - Static client build (`/client/dist`)
  - WebSocket endpoint (same port/process)
- Target: persistent Node/Bun hosting (Render, Railway, Fly.io) — not serverless.
- Single deployment URL.

### Communication
- **HTTP**: OAuth callback, static assets, health checks.
- **Socket.io** (over WebSocket): Real-time playback state sync (current
  track, position, queue, control events), broadcast via `io.emit()`.

### Data Flow
1. Server polls Slack channel → extracts YouTube links → builds playlist.
2. Server fetches YouTube Shorts for ads → inserts randomly into queue.
3. Server schedules playback (tracks + ads) → maintains authoritative timeline.
4. Client connects via WebSocket → receives current state → initializes YouTube IFrame Player at correct timestamp.
5. Server broadcasts `tick`/state events → clients stay synchronized.
6. Late joiners receive current state → sync to live position (no restart from beginning).

**Initial connection race condition**: Since the server runs as a single process (not distributed), concurrent first connections to an idle server are handled with a simple in-memory lock. The first connection triggers the bootstrap process (playlist build/refresh, track selection) and "locks" until the track/position is determined; any concurrent connections wait for that result instead of triggering a new bootstrap. This ensures all simultaneous first-connect users receive the identical initial state. No distributed locking (e.g., Redis) is needed — that would only become relevant if scaling to multiple server instances, which is out of scope.

### Skin Interface (Architecture)
```typescript
interface Skin {
  id: string;
  name: string;
  render(state: PlaybackState): VNode; // or equivalent for chosen framework
}
```
Skins are loaded dynamically; switching skins does not reset playback state.

---

## Restrictions

| Restriction | Detail |
|-------------|--------|
| No audio re-hosting | Server only orchestrates commands (play X at time Y). |
| No Spotify | API limits dev access to 5 users; not feasible. |
| Mock mode required | Must run locally without `SLACK_BOT_TOKEN`. |
| No client-side sync storage | Server is the only source of truth; no localStorage/sessionStorage for playback state. |
| Single domain | Auth restricted to @howdy.com email domain (stub provider in v1; not cryptographically verified — see Authentication). |
| No playlist UI | Playlist never shown to listeners; radio-like experience only. |

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Bun for server | Native WebSocket, fast startup, TypeScript support, single binary deployment. |
| YouTube IFrame Player API | Avoids copyright/hosting issues; leverages YouTube's CDN and player logic. |
| Server-authoritative timeline | Guarantees synchronization; simplifies late-join logic. |
| Single-process static + WS | Simplifies deployment (one URL, one process, no CORS/cookie complexities). |
| Slack bot token polling | Simpler than Events API for periodic playlist refresh; sufficient for channel-scoped link extraction. |
| JSON seed for mock mode | Zero-config local dev; CI-friendly. |
| AuthProvider interface | Allows swapping auth mechanisms without touching app logic. |
| Skin interface | Decouples presentation from playback logic; easy to add themes. |
| YouTube Data API for ads | Reuses existing YouTube integration; Shorts are native ad format. |
| Socket.io over raw WebSocket | Simplified connect/disconnect event handling and broadcast API. Note: the grace-period reconnection logic itself is a stateless global timestamp calculation (see Playback Bootstrap & Idle Behavior), not tied to per-client session identity — Socket.io is used for API convenience, not for its built-in session resumption. |
| Bun native bundler over Vite | Unifies the toolchain around Bun for both client and server, reducing config surface. Trade-off: less common local dev pattern than Vite for anyone unfamiliar with Bun's HTML-import bundling. |

---

## Definition of Done

1. **Two browsers open simultaneously** show the same track at approximately the same moment (±1–2 seconds acceptable due to network/player latency).
2. **Third browser joining later** receives current state and synchronizes to the live position without restarting the track from the beginning.
3. **App runs locally in mock mode** without any credentials (`SLACK_BOT_TOKEN` unset).
4. **Login works and blocks** accounts not matching the `@howdy.com` domain (via `StubEmailProvider` in v1).
5. **Skin switching** works without interrupting playback or resetting sync.
6. **Ads play** at random distributed positions, from start, sourced from Howdy YouTube Shorts.
7. **Idle behavior**: server halts clock when no clients; grace period keeps clock running for 5 min after last disconnect; first reconnect syncs to advanced position.

---

## Non-Goals (v1)

- Playlist editing / DJ controls
- Chat or reactions
- Mobile app
- Spotify / SoundCloud / other sources
- Persistence across server restarts (playlist rebuilds on startup)
- High-precision sub-second sync (WebSocket + YouTube player latency makes this impractical)
- Cryptographically verified identity (v1 trusts the submitted email domain; no real SSO)

---

## Additional Environment Variables

| Variable | Purpose |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 access, for fetching channel Shorts |
| `HOWDY_YOUTUBE_CHANNEL_ID` | Source channel for ads |
| `ADS_COUNT` | Number of recent Shorts to rotate as ads (default: 3) |
| `RECONNECT_GRACE_PERIOD_MINUTES` | Idle grace window before clock halts (default: 5) |
| `AUTH_PROVIDER` | Selects auth implementation (e.g. `stub`, `slack`, `google`) |
| `SLACK_BOT_TOKEN` | Bot token for channel history + user lookup (optional in mock) |
| `SLACK_CHANNEL_ID` | Target channel for music link extraction |

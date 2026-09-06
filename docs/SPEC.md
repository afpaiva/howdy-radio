# Howdy Radio — Specification

## Objective

Build an internal "synchronized radio" station for the Howdy Slack workspace.  
Colleagues post music links (YouTube/YouTube Music) in a designated Slack channel.  
All connected clients play the same track at the same timestamp, simulating a real radio broadcast.

---

## Functional Requirements

### Authentication

Authentication is implemented behind an `AuthProvider` interface, decoupling the login flow from the identity verification mechanism.  
This allows swapping the underlying provider (e.g. real Google Workspace or Slack OAuth) without touching the rest of the application.

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
- **Known limitation**: this does not cryptographically verify identity — any string ending in `@howdy.com` is accepted.  
  This is an accepted trade-off for hackathon scope (no admin access to configure real SSO within the competition window), not a production-ready auth mechanism.

**Future swap path:**
- `GoogleWorkspaceProvider` or `SlackOAuthProvider` would implement the same `AuthProvider` interface,  
  replacing `StubEmailProvider` behind a single `AUTH_PROVIDER` environment variable — no changes required elsewhere in the codebase.

### Playlist Management (Library)

- The server maintains a **Library** — the full pool of available content, refreshed independently by source:  
  - `musicLibrary`: built from Slack channel history (same extraction, deduplication by video ID, and `MAX_TRACK_DURATION_SECONDS` filtering as before).
  - `adsLibrary`: built from the `ADS_COUNT` most recent Howdy YouTube Shorts (unchanged from the original Ads source logic).
- Refreshing the playlist (periodic hourly refresh, or triggered on wake from idle) means **updating the Library**, not directly mutating the live playback queue.  
  The queue is derived from the Library, not replaced by it.
- The playlist itself is intentionally shown to listeners as a rolling "Up Next" preview (see §Up Next Display) — this is unchanged by the Library refactor.

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
  - Name of the Slack user who posted the link (requires `users:read` bot scope): use the user's `display_name`,  
    falling back to `real_name` if the display name is empty (standard Slack app behavior).

### Autoplay Handling

- Browsers block audio autoplay without user interaction.
- On connect, client shows a "Tune in" / "Join broadcast" button;  
  clicking it satisfies the interaction requirement and starts playback synchronized to the current server position.

### Skin System

- The frontend provides a skin gallery where users can switch between visual themes.
- All skins render the same underlying playback state (current track, position, connection status) — only presentation differs.
- **v1 skins:** Winamp, Atari (Space Invaders style), Walkman, Tamagotchi.
- Additional skins can be added later by implementing the shared `Skin` interface (see Architecture).
- **Skin persistence:** the selected skin is remembered per-user via `localStorage`.  
  This is explicitly permitted — the "no localStorage for sync state" restriction applies only to playback synchronization state  
  (to ensure the server remains the single source of truth). Skin selection is purely a UI preference and does not affect client synchronization.

### Up Next Display

Originally scoped as hidden (v1 spec), showing a short "Up Next" queue preview proved to be a valuable product feature during implementation  
and was intentionally kept across all 5 skins.

- Each skin displays the upcoming queue, including ads (labeled distinctly, e.g. "[ad]"), as an "Up Next" list.
- This does not compromise the server as sole source of truth — the client only renders queue data received via WebSocket `state`,  
  never computes, reorders, or caches it independently.
- The existing skin contract test (`skin-contract.test.tsx`) already enforces this correctly;  
  no test changes were needed as a result of this decision — the tests had, in effect, anticipated the right product call before the spec caught up.

### Ads

- Ads are sourced into `adsLibrary` exactly as before: the `ADS_COUNT` most recent YouTube Shorts (duration ≤ 60s) from `HOWDY_YOUTUBE_CHANNEL_ID`, refreshed hourly.
- **Insertion changed**: ads are no longer distributed via a segment-based algorithm over a full pre-built queue.  
  Instead, each time a track is appended to the rolling queue (see §Playback Queue), there is an `AD_APPEND_PROBABILITY` (default: 0.2, i.e. ~1-in-5)  
  chance the appended item is drawn from `adsLibrary` instead of `musicLibrary`.  
  This keeps ad density roughly proportional to a sparse, non-clustered distribution without needing to know the full queue shape in advance.
- Ads always play from the start (no random start position — unchanged from the original spec).

### Playback Queue (Rolling, Fixed-Size)

The queue is a rolling window into the Library, not a fully regenerated list per transition.

- **Target size**: `QUEUE_TARGET_SIZE` (default: 15). If the combined Library (music + ads currently eligible) has fewer available items than this,  
  the queue shrinks to fit — specifically, capped at `min(QUEUE_TARGET_SIZE, libraryEligibleCount - 1)`,  
  guaranteeing at least one item is always excluded so a track can't be immediately re-added to itself.
- **On track end (normal transition)**: remove the finished track from the front of the queue,  
  and append exactly one new item to the end.  
  This does NOT rebuild or re-inject ads into the rest of the queue — only the single new item is chosen.
- **Choosing the appended item**:  
  1. Randomly decide music vs. ad, weighted by `AD_APPEND_PROBABILITY`.  
  2. From the chosen pool (`musicLibrary` or `adsLibrary`), pick randomly, excluding:  
     (a) anything currently in the queue, and  
     (b) the last `RECENTLY_PLAYED_HISTORY_SIZE` (default: 2) tracks that just finished playing.  
  3. If no eligible item remains after exclusions (small Library edge case), fall back to allowing a repeat —  
     but never the single most-recently-played track.
- This replaces the previous "rebuild full queue with segment-based ad injection" approach used during idle/bootstrap.

### Playback Bootstrap & Idle Behavior

- If zero clients are connected, the server halts the playback clock (no CPU/broadcast waste)  
  and stores `{ trackId, position, disconnectedAt: timestamp }`.
- **On next connection (any connection)**:  
  1. Compute `elapsed = now - disconnectedAt`.  
  2. If within `RECONNECT_GRACE_PERIOD_MINUTES` **and** the current track has enough remaining duration:  
     resume at `position + elapsed`, resuming the broadcast clock — the queue itself is untouched  
     (rolling queue persists across the idle gap).  
  3. Otherwise (grace period expired, or not enough time left): treat as a fresh bootstrap —  
     refresh the Library from Slack/YouTube, build a new rolling queue of up to `QUEUE_TARGET_SIZE` items,  
     pick a random starting track and random position within it (bootstrap only — subsequent transitions never use random position).  
  4. Concurrent connections during this computation resolve to the same result via the existing in-process bootstrap lock.
- New clients joining while already-connected clients exist always sync to the current live position  
  (never restart, never trigger a queue rebuild).

### Mock Mode

- If `SLACK_BOT_TOKEN` is not set, server uses a sample playlist (JSON seed).
- Enables local development without Slack credentials.

---

## Architecture

### Monorepo Structure

```
/client      -> Vite + frontend
/server      -> Bun (WebSocket conductor + Slack integration + static file serving)
/docs        -> SPEC.md, SYSTEM.md, AI-DEV-LOG.md
```

### Deployment Model

- Single Bun process serves:  
  - Static client build (`/client/dist`)  
  - WebSocket endpoint (same port/process)
- Target: persistent Node/Bun hosting (Render, Railway, Fly.io) — not serverless.
- Single deployment URL.

### Communication

- **HTTP**: OAuth callback, static assets, health checks.
- **Socket.io** (over WebSocket): Real-time playback state sync (current track, position, queue, control events), broadcast via `io.emit()`.

### Data Flow

1. Server polls Slack channel → extracts YouTube links → builds playlist.  
2. Server fetches YouTube Shorts for ads → inserts randomly into queue.  
3. Server schedules playback (tracks + ads) → maintains authoritative timeline.  
4. Client connects via WebSocket → receives current state → initializes YouTube IFrame Player at correct timestamp.  
5. Server broadcasts `tick`/state events → clients stay synchronized.  
6. Late joiners receive current state → sync to live position (no restart from beginning).

**Initial connection race condition**:  
Since the server runs as a single process (not distributed), concurrent first connections to an idle server  
are handled with a simple in-memory lock. The first connection triggers the bootstrap process (playlist build/refresh, track selection)  
and "locks" until the track/position is determined; any concurrent connections wait for that result instead of triggering a new bootstrap.  
This ensures all simultaneous first-connect users receive the identical initial state.  
No distributed locking (e.g., Redis) is needed — that would only become relevant if scaling to multiple server instances,  
which is out of scope.

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

| Restriction                  | Detail                                                                                      |
|----------------------------- |--------------------------------------------------------------------------------------------|
| No audio re-hosting          | Server only orchestrates commands (play X at time Y).                                      |
| No Spotify                   | API limits dev access to 5 users; not feasible.                                            |
| Mock mode required           | Must run locally without `SLACK_BOT_TOKEN`.                                                |
| No client-side sync storage  | Server is the only source of truth; no localStorage/sessionStorage for playback state.     |
| Single domain                | Auth restricted to @howdy.com email domain (stub provider in v1; not cryptographically verified — see Authentication). |
| Up Next display              | Queue is intentionally shown to listeners as a short "Up Next" preview (see §Up Next Display) — this was a deliberate product decision made during implementation, not an oversight. |

---

## Key Technical Decisions

| Decision                                  | Rationale                                                                                             |
|------------------------------------------- |------------------------------------------------------------------------------------------------------|
| Bun for server                             | Native WebSocket, fast startup, TypeScript support, single binary deployment.                        |
| YouTube IFrame Player API                  | Avoids copyright/hosting issues; leverages YouTube's CDN and player logic.                           |
| Server-authoritative timeline              | Guarantees synchronization; simplifies late-join logic.                                              |
| Single-process static + WS                 | Simplifies deployment (one URL, one process, no CORS/cookie complexities).                           |
| Slack bot token polling                    | Simpler than Events API for periodic playlist refresh; sufficient for channel-scoped link extraction.|
| JSON seed for mock mode                    | Zero-config local dev; CI-friendly.                                                                  |
| AuthProvider interface                     | Allows swapping auth mechanisms without touching app logic.                                           |
| Skin interface                             | Decouples presentation from playback logic; easy to add themes.                                      |
| YouTube Data API for ads                   | Reuses existing YouTube integration; Shorts are native ad format.                                    |
| Socket.io over raw WebSocket               | Simplified connect/disconnect event handling and broadcast API. Note: the grace-period reconnection logic itself is a stateless global timestamp calculation (see Playback Bootstrap & Idle Behavior), not tied to per-client session identity — Socket.io is used for API convenience, not for its built-in session resumption. |
| Library as separate pool from live queue   | Decouples "what's available" (refreshed periodically) from "what's queued now" (a stable rolling window) — avoids full queue reconstruction on every track-end, which previously caused replay/reset bugs. |
| Rolling fixed-size queue (remove-front, append-back) | Simpler, cheaper transition logic than full rebuild + re-injection; naturally avoids near-term repetition via queue+recently-played exclusion. |
| Probabilistic ad append vs. segment-based injection | Keeps ad density roughly proportional to `AD_APPEND_PROBABILITY` without needing to plan ad positions across a queue that's now continuously rolling rather than fixed. |

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

| Variable                         | Purpose                                                                               |
|---------------------------------- |--------------------------------------------------------------------------------------|
| `YOUTUBE_API_KEY`                | YouTube Data API v3 access, for fetching channel Shorts                               |
| `HOWDY_YOUTUBE_CHANNEL_ID`       | Source channel for ads                                                                |
| `ADS_COUNT`                      | Number of recent Shorts to rotate as ads (default: 3)                                 |
| `RECONNECT_GRACE_PERIOD_MINUTES` | Idle grace window before clock halts (default: 5)                                     |
| `AUTH_PROVIDER`                  | Selects auth implementation (e.g. `stub`, `slack`, `google`)                          |
| `SLACK_BOT_TOKEN`                | Bot token for channel history + user lookup (optional in mock)                        |
| `SLACK_CHANNEL_ID`               | Target channel for music link extraction                                              |
| `MAX_TRACK_DURATION_SECONDS`     | Maximum track length accepted from Slack links (default: 720)                         |

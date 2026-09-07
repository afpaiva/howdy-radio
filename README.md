<div align="center">
  <img width="300" alt="Howdy Radio logo" src="https://github.com/user-attachments/assets/9f7c1576-3e86-41f6-b0a5-c9872c5c39d8" />

  # Howdy Radio

  **A synchronized internal radio station, built from the songs your team already shares in Slack.**

  🟢 **Live demo:** [howdy-radio-app.web.app](https://howdy-radio-app.web.app/)
</div>

---

## What is this?

Colleagues drop YouTube links in a Slack channel. Howdy Radio turns that channel into a live, always-on broadcast: every connected listener hears the **same track, at the same position, at the same time** — like a real radio station, not a personal playlist.

- 🎧 **Synchronized playback** across every open tab — join mid-song and you land exactly where the broadcast is.
- 📻 **5 retro skins** — Neutral, Winamp, Atari, Walkman, and Tamagotchi — all rendering the same live state.
- 📺 **Real playback** via the YouTube IFrame Player API — no audio is ever re-hosted or proxied.
- 📣 **Ads** sourced from the Howdy YouTube channel's Shorts, woven into rotation automatically.
- 🌙 **"Never off" idle behavior** — if everyone leaves, the broadcast keeps its place for a grace window, so reconnecting feels like tuning back into a station that never stopped.
- 🔐 **@howdy.com-gated login** — simple email-based access control for internal use.

---

## Architecture at a glance

```
/client   → Vite + React frontend (skins, player, login)
/server   → Bun + Socket.io backend (playback conductor, Slack + YouTube integrations)
/docs     → Engineering process docs (see below)
```

The server is the **single source of truth** for what's playing — clients never compute or store sync state locally. Music comes from Slack channel history; ads come from the Howdy YouTube channel's Shorts. Both feed a shared **Library**, from which a fixed-size **rolling queue** is continuously drawn as tracks finish, so the broadcast never has to rebuild itself from scratch.

Full technical details, architecture decisions, and trade-offs are documented in [`/docs/SPEC.md`](./docs/SPEC.md).

---

## Running it locally

### Mock mode (no credentials needed)

The fastest way to try it — uses a bundled sample playlist instead of live Slack/YouTube data.

```bash
# Server
cd server
bun install
bun run dev

# Client (in a separate terminal)
cd client
bun install
bun run dev
```

Open the client URL printed in the terminal, log in with any `@howdy.com` email, click **Tune in**, and the broadcast starts.

### Real mode (live Slack + YouTube data)

1. Create a Slack app in your workspace with the `channels:history` (or `groups:history`) and `users:read` bot scopes, install it, and invite the bot to your music channel.
2. Enable the YouTube Data API v3 in Google Cloud and generate an API key.
3. Copy `server/.env.example` to `server/.env` and fill in the values below.
4. Run the server and client as above — with `SLACK_BOT_TOKEN` set, mock mode is automatically disabled.

---

## Environment variables

All configured in `server/.env` (see `server/.env.example` for a ready-to-copy template — **never commit `.env`**).

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3000` |
| `NODE_ENV` | Runtime environment | `development` |
| `AUTH_JWT_SECRET` | Secret used to sign session JWTs — replace with a real secret before deploying | — |
| `SLACK_BOT_TOKEN` | Bot token for reading channel history + resolving user names. Omit to run in mock mode. | — |
| `SLACK_CHANNEL_ID` | Target channel for music link extraction | — |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key, used for track metadata and fetching ads | — |
| `HOWDY_YOUTUBE_CHANNEL_ID` | Source channel for ads (YouTube Shorts) | — |
| `ADS_COUNT` | Number of recent Shorts pulled into the ads pool | `3` |
| `MAX_TRACK_DURATION_SECONDS` | Tracks longer than this are excluded (keeps DJ sets/livestreams out of rotation). Does not apply to ads (already capped at 60s). | `720` |
| `RECONNECT_GRACE_PERIOD_MINUTES` | How long the broadcast clock keeps advancing after the last listener leaves | `5` |
| `AUTH_PROVIDER` | Auth implementation to use (`stub`, `slack`, or `google`; interface allows swapping to real SSO later) | `stub` |

> **Note:** the rolling queue's target size, ad-append probability, and
> repeat-avoidance window are currently fixed internally rather than
> environment-configurable — see `/docs/SPEC.md` §Playback Queue for
> the exact values.

---

## Testing

```bash
# Client
cd client
bun run test        # unit tests (Vitest)
bun run test:e2e     # end-to-end sync tests (Playwright)
bun run typecheck
bun run lint

# Server
cd server
bun test
bun run typecheck
bun run lint
```

---

## Deployment

The server needs a **persistent Node/Bun process** (not serverless) since it holds a live WebSocket connection and the in-memory broadcast state. It also serves the built client as static files on the same port. Any host that keeps a long-running process works (Render, Railway, Fly.io, etc.).

```bash
cd client && bun run build   # outputs client/dist, served by the server
cd ../server && bun start
```

---

## The engineering process behind this

This project was built for Howdy's Dev Day 2026 Agentic Software Engineering Hackathon — the challenge wasn't just to build the product, but to demonstrate a real agentic engineering workflow behind it. The full process is documented in [`/docs`](./docs):

- [`SPEC.md`](./docs/SPEC.md) — requirements, architecture, and key technical decisions
- [`SYSTEM.md`](./docs/SYSTEM.md) — agent roles, context engineering, orchestration, parallel work, and the harness/autonomous-loop evidence
- [`AI_DEV_LOG.md`](./docs/AI_DEV_LOG.md) — the real, chronological build log: iterations, bugs found and fixed, and the human decisions along the way

---

<div align="center">
  Built with 🎙️ for the Howdy team.
</div>

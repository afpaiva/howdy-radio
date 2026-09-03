# AGENTS.md — client/

This file scopes agent behavior for the `/client` package only. For
project-wide context, see the root `/AGENTS.md` (if present) and
`/docs/SPEC.md`.

## Purpose

Bun-bundled (native HTML imports) React frontend for Howdy Radio.
Renders playback state received from the server via Socket.io, through
a swappable skin system.

## Structure

```
client/
src/
skins/
types.ts -> Skin interface contract (do not modify without
updating ALL skin implementations)
registry.ts -> auto-registers available skins
winamp/
atari/
walkman/
tamagotchi/
lib/
websocket.ts -> connects to server, exposes playback state
youtube-player.ts -> wraps YouTube IFrame Player API
tests/ -> Vitest unit tests
tests/
e2e/ -> Playwright end-to-end tests
```

## Hard rules (do not violate)

1. **This client is "dumb" by design.** It never computes or owns
   playback sync state — it only renders what the server sends via
   Socket.io. Do not add local timers, local "guessed" positions, or
   any client-side reconciliation logic for sync state.
2. **No localStorage/sessionStorage for playback/sync state.** Skin
   *selection* is the one exception — it's presentational, not sync
   state, and may be persisted client-side.
3. **Skin isolation.** If you are implementing a skin, you are confined
   to your own `src/skins/<name>/` directory. Never read or modify
   another skin's directory, `types.ts`, or `registry.ts`.
4. **Every skin must implement the `Skin` interface** in `types.ts`
   exactly — no extending it with skin-specific required props that
   other skins don't have.
5. **YouTube player renders hidden/minimized.** This is an audio-first
   experience — UI shows track title, source link, poster, and controls,
   not the raw video.
6. **Autoplay requires explicit user interaction.** Do not attempt to
   auto-start audio on mount; playback only starts after the user clicks
   the "Tune in" / "Join broadcast" control (see SPEC.md — Autoplay
   Handling).

## Testing

This package uses **Vitest** (unit) and **Playwright** (E2E).

### Setup (run once per environment)
```bash
bun add -D vitest @vitest/ui
bun add -D playwright @playwright/test
bunx playwright install
```

### Configuration
- `vitest.config.ts`: jsdom environment, path aliases matching
  `tsconfig.json`, coverage enabled.
- `playwright.config.ts`: base URL pointing at whatever port `bun run dev`
  prints on startup, test dir `tests/e2e/`, projects for
  chromium/firefox/webkit.

### Commands
| Command | Purpose |
|---|---|
| `bun test` | Run unit tests once (Vitest) |
| `bun test:watch` | Unit tests in watch mode (local dev only, not CI) |
| `bun test:e2e` | Run Playwright E2E suite |
| `bun test:e2e:ui` | Playwright with UI mode (debugging only) |

### Before finishing any task
- Run `bun test` — all unit tests must pass.
- If your change touches playback/sync behavior, also run
  `bun test:e2e` — do not mark the task done if E2E tests fail.
- Do not skip or comment out a failing test to make the suite pass.
  Fix the underlying issue, or flag it explicitly as a known limitation
  in `/docs/AI-DEV-LOG.md` if it's genuinely out of scope.

### What to test where
- **Vitest** (`src/__tests__/`): pure logic — skin interface contract
  compliance, WebSocket message parsing, any client-side formatting/
  display logic. Not for anything requiring a real browser or real
  playback.
- **Playwright** (`tests/e2e/`): real synchronization behavior — e.g.
  two browser contexts connecting and confirming they report the same
  track within acceptable drift (validates SPEC.md Definition of Done #1).

## Conventions
- TypeScript strict mode.
- Components are function components; no class components.
- New skins must implement `Skin` from `src/skins/types.ts` and be
  registered in `src/skins/registry.ts` — nowhere else.
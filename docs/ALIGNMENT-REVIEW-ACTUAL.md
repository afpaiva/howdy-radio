# Alignment Review — Howdy Radio (Actual vs SPEC.md / SYSTEM.md)

**Reviewer mode:** Report-only. No edits made to code or docs.  
**Date:** 2026-09-07  
**Method:** Direct inspection of `/docs/SPEC.md`, `/docs/SYSTEM.md`, and current source (`client/src/`, `server/src/`, `server/index.ts`). Previous review documents (`ALIGNMENT-REVIEW-001.md`, `002.md`, `003.md`) were not used as references; observations come from direct file reading only.

---

## Severity Key

- **REQUIREMENT VIOLATION / DoD FAILURE** — contradicts a stated functional requirement, architecture contract, or Definition of Done item in SPEC.md / SYSTEM.md.
- **MINOR NAMING / STYLE / WIRE CONTRACT** — deviates from documented convention without breaking a stated requirement by itself.

---

## 1. Requirement Violations

### 1.1 Ad-append probability does not match `AD_APPEND_PROBABILITY` spec (§Ads / §Playback Queue)

| Spec reference | Implementation reference | Finding |
|---|---|---|
| SPEC.md §Ads line 98: `AD_APPEND_PROBABILITY` (default: `0.2`, i.e. ~1-in-5). SPEC.md §Playback Queue line 114: "Randomly decide music vs. ad, weighted by `AD_APPEND_PROBABILITY`." SPEC.md Key Technical Decisions line 228: "Probabilistic ad append vs. segment-based injection". | `server/src/conductor/conductor.ts` line 401 (`refillQueue`): `const useAd = Math.random() < 0.5;`. There is no `AD_APPEND_PROBABILITY` constant or environment variable; the code hard-codes `0.5` (50 % chance) instead of `0.2`. Additionally, `injectAds()` (`line 333`) still performs segment-based injection, which SPEC.md explicitly replaced with the probabilistic append model. `buildInitialQueue()` (`line 518`) also uses `injectAds()` rather than drawing from the library with the 0.2 weight. | Ad density is roughly 2.5× higher than specified (`0.5` vs `0.2`), and the obsolete segment-based algorithm is still used for initial queue construction. This violates the rolling-queue design contract described in §Playback Queue and §Ads. |

**Severity:** Requirement violation (ad-distribution contract broken; wrong probability; obsolete injection algorithm retained).

---

### 1.2 `Conductor.getState()` does not apply or clear idle snapshot (state-machine inconsistency)

| Spec reference | Implementation reference | Finding |
|---|---|---|
| SPEC.md §Playback Bootstrap & Idle Behavior: idle computation should apply the result (resume or fresh bootstrap) and clear the snapshot (`idleSnapshot = null`). Only `onClientConnect()` (via `acquireBootstrapLock()`) is expected to trigger the full bootstrap-and-apply sequence. | `server/src/conductor/conductor.ts` lines 52–57 (`getState()`): when `clientCount === 0`, calls `computeOnDemandState()` but does **not** call `applyState()` or `idleSnapshot = null`. Lines 422–424 (`getCurrentState()`): delegates to `computeLiveState()`, which does apply state, but `getState()` remains inconsistent. `getState()` is called from `WsHandler.handleJoin()` (`line 77`) and `broadcastState()` (`line 86`), meaning a disconnection followed by a `join-broadcast` can return an un-applied idle-computed state. | The public `getState()` API produces a computed result without committing it to `this.state`, so subsequent ticks or broadcasts may see a different base state. This is a design-level contract breach between the conductor's internal state machine and its read API. |

**Severity:** Requirement violation / design contract breach (`getState()` is part of the conductor interface and must reflect applied state; uncommitted idle results can leak to clients via `handleJoin` and broadcast paths).

---

## 2. Minor / Style / Wire-Contract Issues

### 2.1 Server entrypoint uses `http.createServer` instead of `Bun.serve()` (convention deviation)

| Spec / System reference | Implementation reference | Finding |
|---|---|---|
| SPEC.md Key Technical Decisions: "Bun for server — Native WebSocket, fast startup, TypeScript support, single binary deployment." `AGENTS.md` (server): "Uses `Bun.serve()`"; "Don't use `express`." `SYSTEM.md`: references `Bun.serve()` as preferred API. | `server/index.ts` line 98: `const httpServer = createServer((req, res) => { ... });` (imported from Node `http`). `Bun.serve()` is not used anywhere in the server entrypoint. | Functionally the server co-hosts static files + Socket.io correctly on port `3001`, but the documented Bun-native convention is not followed. Minor style/convention deviation only. |

---

### 2.2 Development port / WS URL mismatches (integration config inconsistency)

| Reference | Finding |
|---|---|
| `client/src/lib/websocket.ts` line 37: `WS_URL` defaults to `"http://localhost:3000"`. `client/playwright.config.ts`: `baseURL: 'http://localhost:3003'`. `server/index.ts` line 74: `port: 3001`. | Four different ports in development (`client` Vite, Playwright, server, default WS URL). In production (`PROD`) the client connects to its own origin, so this is non-functional. Minor config inconsistency. |

---

## 3. Confirmed Aligned / Fixed Areas (not misalignments)

These items were previously misaligned (`ALIGNMENT-REVIEW-003.md`) and are now resolved by current source inspection:

- **Socket.io control-intent event names** (`client/src/lib/websocket.ts` line 190; `client/src/skins/types.ts` line 139; `server/src/ws/handler.ts` line 37): client emits `"join-broadcast"`; server listens `"join-broadcast"`. **Aligned**.
- **Slack `display_name` fallback to `real_name`** (`server/src/slack/slack.ts` line 92): `displayName = userInfo?.displayName || realName || "unknown"`. `realName` is now used as the second fallback; raw user ID (`msg.user`) is no longer shown. **Aligned**.
- **Client `App.tsx` naming** (`line 69`): comment now reads `"join-broadcast"`. **Aligned**.

---

## 4. Severity Summary

| Severity | Count | Areas |
|---|---|---|
| **Critical / Requirement Violation** | 2 items (§1.1, §1.2) | `AD_APPEND_PROBABILITY` hard-coded to `0.5` (should be `0.2`) + obsolete segment-based `injectAds()` retained; `getState()` does not apply/clear idle snapshot. |
| **Minor / Naming / Style / Wire Contract** | 2 items (§2.1, §2.2) | Server entrypoint uses `createServer` instead of `Bun.serve()`; dev port mismatches. |

---

*No code or docs edited. Observations derived solely from direct inspection of `/docs/SPEC.md`, `/docs/SYSTEM.md`, and source files at the time of review (2026-09-07). Previous review documents (`001`, `002`, `003`) were not consulted or referenced.*

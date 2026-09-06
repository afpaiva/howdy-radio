# System Map — Howdy Radio

This document describes how agentic work was organized to build Howdy Radio: which agents/sessions handled which parts, how context was scoped, where work ran in parallel, and what deterministic controls existed independent of agent judgment.

---

## Agent Roles

| Role                          | Tool / Model                          | Responsibility                                                                                                                                                  | Context given                                    |
|-------------------------------|---------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| **Spec & System Author**      | Claude (this conversation)            | Authors and maintains SPEC.md and SYSTEM.md collaboratively with the human, across the full history of the project's decisions                                  | Full conversation history + all prior decisions  |
| **Planner (Alignment Review)**| OpenCode + `thinkingmachines/inkling:free`  | Audits the actual codebase against SPEC.md/SYSTEM.md and reports drift — does not author documents                                                              | Full spec/system + read access to source code    |
| **Skeleton Implementer**      | OpenCode + `z-ai/glm-5.2:free`        | Built the neutral, unstyled Skin interface + WebSocket client wiring, validated against real server state                                                        | SPEC.md (Architecture, Skin Interface)           |
| **Skin Implementers (×4, parallel)**| OpenCode + `minimax/minimax-m3:free` | Implemented Winamp, Atari, Walkman, Tamagotchi skins independently, each scoped to its own directory                                                             | SPEC.md (Skin System) + shared `Skin` interface contract only — no access to other skins' code |
| **Server Implementer**        | OpenCode + `z-ai/glm-5.2:free`        | Built the Bun backend: conductor (timeline, idle/grace, bootstrap lock), Slack integration, YouTube ads integration, auth provider                               | SPEC.md + `/server/AGENTS.md`                    |
| **Loop / Fix Agent**          | OpenCode + `cohere/north-mini-code:free` | Ran harness after each implementation step, read failures, corrected, re-ran                                                                                    | Harness output only (test logs), not full codebase context |

*Why documents moved to human+Claude authorship*: SPEC.md and SYSTEM.md changed frequently as scope evolved (skins, ads, idle behavior, auth strategy). A subagent without continuity across sessions kept losing context on *why* earlier decisions were made. Claude, with the full conversation history, could reconcile new requests against prior decisions without re-explaining them each time — reducing repeated instruction, which is exactly the kind of system improvement the competition brief asks for ("can I improve the system so I never need to give that instruction again?").

---

## Context Engineering

- **Planner** now only reads code + docs to check alignment — it never authors specification, avoiding the earlier risk of drift between "what the planner assumed" and "what the human actually decided."
- **Skin Implementers** received only the `Skin` interface contract and the Skin System section of SPEC.md, not each other's code or the full server implementation — preventing cross-contamination and enabling true parallel, conflict-free work.
- **Server Implementer** received `/server/AGENTS.md` (Bun conventions, hard rules on state ownership) in addition to SPEC.md — scoped specifically to backend concerns, with explicit warnings against reintroducing patterns (e.g. Bun's HTML-import bundler) that conflict with prior architecture decisions (Vite for client).
- **Loop / Fix Agent** operated on harness output (pass/fail + error text) rather than full project context, keeping fix cycles fast and focused.
- Full SPEC.md was treated as the durable source of truth; agents were re-pointed to it rather than given repeated inline instructions.

---

## Orchestration & Parallel Work

### Sequencing

1. Spec authored/evolved collaboratively (Claude + human) → Planner audits for internal consistency before implementation phases begin.
2. Skeleton Implementer builds `/client/src/skins/types.ts` (interface) + a neutral skin wired to real WebSocket state — validated end-to-end **before** parallel skin work starts (gate: no point styling 4 skins on top of a broken data layer).
3. **Two parallel tracks** run concurrently once the skeleton is validated:
   - **Track A**: Four Skin Implementer sessions, one per skin, each confined to `/client/src/skins/<name>/`.
   - **Track B**: Server Implementer builds the backend — this has no file overlap with client skin work, so it runs alongside Track A rather than waiting for it.
4. Integration: skins registered in `/client/src/skins/registry.ts`; a contract test confirms every registered skin satisfies the `Skin` interface. Client and server are wired together and tested end-to-end via Playwright once both tracks land.
5. Planner re-runs Alignment Review after integration to catch drift introduced during parallel work.

### Why parallel work was safe here

- Each skin directory has zero file overlap and zero shared mutable state — they only read from the same `PlaybackState` shape.
- Server work (Track B) touches only `/server/`, client skin work (Track A) touches only `/client/src/skins/`, so the two tracks cannot conflict structurally.

### Deliberately NOT parallelized

The Conductor module (`/server/src/conductor/`) — WebSocket state, timeline, idle/grace period, bootstrap lock — was built as a single sequential unit within the Server Implementer's work, not split further. This is the one piece of genuinely shared mutable state in the system; splitting it across agents would reintroduce exactly the kind of race condition the architecture is designed to avoid.

### Parallelization Evidence

[TODO: once Track A and Track B run, add a timestamp table or screenshot showing overlapping session windows, e.g.:]

| Track                        | Session start | Session end | Branch              |
|------------------------------|---------------|-------------|---------------------|
| Skin: Winamp                 |               |             | `skin/winamp`       |
| Skin: Atari                  |               |             | `skin/atari`        |
| Skin: Walkman                |               |             | `skin/walkman`      |
| Skin: Tamagotchi             |               |             | `skin/tamagotchi`   |
| Server: Conductor + integrations |          |             | `server/implementation` |

---

## Deterministic Controls (not left to agent judgment)

| Control                                     | Mechanism                                                                                                                                                            |
|----------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Server is sole source of playback truth      | Enforced by architecture — clients never write sync state                                                                                                             |
| All skins implement the same interface       | Contract test in harness, not a prompt reminder                                                                                                                      |
| Tests must pass before a task is considered done | `bun test` run automatically post-implementation, not manually triggered                                                                                         |
| No secrets committed                        | `.env` gitignored; `.env.example` provided with placeholders only                                                                                                   |
| No client-side sync storage                 | Lint rule / code review check, not just spec text                                                                                                                    |
| Skin directory isolation                    | Best-effort via OpenCode `edit` permission scoping, **backed by a post-session `git diff --name-only` check** that fails if a skin session touched files outside its own directory (OpenCode's glob-based path permissions have known matching bugs, so this is not trusted as the sole guarantee) |
| Planner cannot alter code or docs           | `edit: deny` on the planner agent — it can only report                                                                                                               |

---

## Harness

| Check                | Tool               | What it validates                                                                                                               |
|----------------------|--------------------|---------------------------------------------------------------------------------------------------------------------------------|
| Unit tests           | Bun test runner    | Sync/timestamp calculation logic, ad distribution logic, Slack dedup                                                            |
| Type check           | `tsc --noEmit`     | Type safety across client/server                                                                                                |
| Lint                 | ESLint             | Code convention adherence                                                                                                       |
| Contract test        | Custom test        | Every registered skin implements `Skin` interface                                                                               |
| Directory scope check| `git diff --name-only` post-session | Confirms a skin session only touched its own directory                                               |
| Browser test         | Playwright         | Two browser contexts connect, confirm both report the same track within acceptable drift (validates Definition of Done #1)       |
| Build                | `bun build` / `vite build` | Both client and server build cleanly                                                                            |

Run via a single command (`bun run verify`) so any agent — or the Loop / Fix Agent specifically — can self-check without human-in-the-loop diagnosis.

---

## Autonomous Loop Evidence

**Example 1 — Atari skin, connection-label contract test**

```
[16:42:55] bun run test → FAIL
src/tests/skin-contract.test.tsx >
Skin contract: atari "Atari" > shows connection-label
text matching "disconnected"

Expected element to have text content: "disconnected"
Received: "Signal Lost"

→ src/tests/skin-contract.test.tsx:141

[Skin-Implementer agent inspected the failure, identified the skin was rendering a themed status string ("Signal Lost") instead of the raw connectionStatus value the contract requires, and corrected the mapping]

[17:17:17] bun run test → PASS
Test Files 3 passed (3)
Tests 40 passed (40)
(includes 17 new Atari-specific contract tests added during the fix)
```

No human prompt occurred between the failing run and the passing run.

**Example 2 — Tamagotchi skin, missing queue element**

```
[16:42:55] bun run test → FAIL
src/tests/skin-contract.test.tsx:249
expect(screen.getByTestId('queue')).toBeInTheDocument()
→ element not found

Test Files 1 failed | 1 passed (2)
Tests 13 failed | 27 passed (40)

[Skin-Implementer agent added a QueueList module rendering one queue-item per entry with data-ad="true"|"false" per SPEC.md, omitted entirely when the queue is empty — reconciling the contract's expectation with the "playlist not shown to listeners" requirement]

[17:17:11] bun run test → PASS
Test Files 2 passed (2)
Tests 40 passed (40)
```

No human prompt occurred between the failing run and the passing run.

**Example 3 — Ad/playlist restart bug, hypothesis correction**

Initial human hypothesis: ad loop bug caused by `duration: 0` (same pattern as an earlier Slack-track bug). Server-implementer investigated rather than applying the assumed fix, and found the actual cause was state-persistence in `computeLiveState()` — the hypothesis was wrong, but the investigation surfaced the real bug instead of patching a symptom that wasn't the cause. Demonstrates the agent verifying before fixing, not just pattern-matching to a similar prior issue.

**Example 4 — parallel client/server investigation, clean negative result**

Client and server investigated the same bug concurrently, in separate worktrees. Client search (grep across all client/src/ for onStateChange/ENDED/etc.) found zero client-side playback-control logic and reported this explicitly, deferring to the server investigation rather than guessing or touching code out of its scope — consistent with the directory-scope discipline observed earlier in this project.

---

## Human Decisions (Human as Orchestrator)

- Chose WebSocket + server-authoritative state over WebRTC/P2P (reduces complexity, avoids redundant signaling infrastructure).
- Rejected Spotify integration after evaluating API constraints (5-user dev cap), kept YouTube as sole source.
- Decided skin persistence (localStorage) is exempt from the "no client-side sync storage" rule — presentation ≠ sync state.
- Chose to gate parallel skin work behind a validated neutral skeleton first, rather than parallelizing immediately.
- Assigned different models per role deliberately (heavier model for planning/server logic, lighter/faster models for repetitive implementation and fix loops) to balance quality against free-tier request quotas.
- Removed the separate `reviewer.md` subagent (was using a paid model and duplicated the human+Claude review already happening in this conversation); folded that responsibility into a simplified Alignment-Review-only Planner.
- Moved SPEC.md/SYSTEM.md authorship from a subagent to human+Claude collaboration directly, due to continuity of context across many rounds of evolving requirements.
- Decided Server work (Track B) could run in parallel with Skin work (Track A) since they share no files, while deliberately keeping the Conductor's core state logic as a single sequential implementation to avoid race conditions.
- Kept Socket.io (over native Bun WebSocket) after discovering it was already scaffolded and working — updated SPEC.md/AGENTS.md to document this as a deliberate choice rather than reverting working infrastructure.
- Simplified the reconnect grace-period design to a stateless global timestamp snapshot (no per-client/session identity needed) — any connection after idle computes elapsed time since the last disconnect and resumes or re-bootstraps accordingly.
- Discovered an unintended deviation where the client had drifted from Vite to Bun's native bundler (likely from a misread "cleanup" task), and had already been documented as if intentional. Reverted to Vite as originally specified and corrected the docs that had rationalized the drift.
- Reversed the planned merge order (server → client) to merge fix/server-integration into fix/client-player instead, once the client agent's testing was blocked without real server behavior to test against. Demonstrates the directory-scope discipline holding even under a merge inversion: the client agent found a server bug mid-integration but declined to fix it out-of-scope, reporting it back for the correct agent to handle.

See `/docs/AI-DEV-LOG.md` for the full chronological account.
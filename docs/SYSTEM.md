# System Map — Howdy Radio

This document describes how agentic work was organized to build Howdy Radio:
which agents/sessions handled which parts, how context was scoped, where
work ran in parallel, and what deterministic controls existed independent
of agent judgment.

---

## Agent Roles

| Role | Tool / Model | Responsibility | Context given |
|---|---|---|---|
| **Planner** | OpenCode + `nvidia/nemotron-3-ultra:free` | Turned product ideas into SPEC.md; surfaced ambiguities instead of assuming | Product requirements only — no implementation code |
| **Reviewer** | Claude `Sonnet 5` | Reviewed SPEC.md/SYSTEM.md for gaps, ambiguity, and technical risk before implementation began | Full spec + prior decisions |
| **Skeleton Implementer** | OpenCode + `qwen/qwen3-coder:free` | Built the neutral, unstyled Skin interface + WebSocket client wiring, validated against real server state | SPEC.md (Architecture, Skin Interface) |
| **Skin Implementers (×4, parallel)** | OpenCode + `openai/gpt-oss-20b:free` | Implemented Winamp, Atari, Walkman, Tamagotchi skins independently, each scoped to its own directory | SPEC.md (Skin System) + shared `Skin` interface contract only — no access to other skins' code |
| **Loop / Fix Agent** | OpenCode + `openai/gpt-oss-20b:free` | Ran harness after each implementation step, read failures, corrected, re-ran | Harness output only (test logs), not full codebase context |

*This table reflects role specialization, not one-agent-per-name theater —
each role received a deliberately scoped slice of context (see below).*

---

## Context Engineering

- **Planner** never saw implementation code — only product intent — to avoid
  premature technical assumptions leaking into the spec.
- **Skin Implementers** received only the `Skin` interface contract and the
  Skin System section of SPEC.md, not each other's code or the full
  server implementation — preventing cross-contamination and enabling
  true parallel, conflict-free work.
- **Loop / Fix Agent** operated on harness output (pass/fail + error text)
  rather than the full project context, keeping fix cycles fast and
  focused.
- Full SPEC.md was treated as the durable source of truth; agents were
  re-pointed to it rather than given repeated inline instructions.

---

## Orchestration & Parallel Work

### Sequencing
1. Planner produces SPEC.md → Reviewer validates → human resolves
   clarification questions (see SPEC.md "Clarification Answers").
2. Skeleton Implementer builds `/client/src/skins/types.ts` (interface) +
   a neutral skin wired to real WebSocket state — validated end-to-end
   **before** parallel work starts (gate: no point styling 4 skins on top
   of a broken data layer).
3. Four Skin Implementer sessions run in parallel, one per skin, each
   confined to `/client/src/skins/<name>/`.
4. Integration: skins registered in `/client/src/skins/registry.ts`;
   a contract test confirms every registered skin satisfies the `Skin`
   interface before merge.

### Why parallel work was safe here
Each skin directory has zero file overlap and zero shared mutable state —
they only read from the same `PlaybackState` shape. This made parallel
delegation low-risk: a broken Atari skin cannot affect the Walkman skin,
and merge conflicts were structurally not possible.

### Parallelization Evidence
[TODO: once the 4 skin sessions run, add a timestamp table or screenshot
showing overlapping session windows, e.g.:]

| Skin | Session start | Session end | Branch |
|---|---|---|---|
| Winamp | | | `skin/winamp` |
| Atari | | | `skin/atari` |
| Walkman | | | `skin/walkman` |
| Tamagotchi | | | `skin/tamagotchi` |

---

## Deterministic Controls (not left to agent judgment)

| Control | Mechanism |
|---|---|
| Server is sole source of playback truth | Enforced by architecture — clients never write sync state |
| All skins implement the same interface | Contract test in harness, not a prompt reminder |
| Tests must pass before a task is considered done | `bun test` run automatically post-implementation, not manually triggered |
| No secrets committed | `.env` gitignored; `.env.example` provided with placeholders only |
| No client-side sync storage | Lint rule / code review check, not just spec text |

---

## Harness

| Check | Tool | What it validates |
|---|---|---|
| Unit tests | Bun test runner | Sync/timestamp calculation logic, ad distribution logic |
| Type check | `tsc --noEmit` | Type safety across client/server |
| Lint | ESLint | Code convention adherence |
| Contract test | Custom test | Every registered skin implements `Skin` interface |
| Browser test | Playwright | Two browser contexts connect, confirm both report the same track within acceptable drift (validates Definition of Done #1) |
| Build | `bun build` / `vite build` | Both client and server build cleanly |

Run via a single command (`bun run verify`) so any agent — or the Loop / Fix
Agent specifically — can self-check without human-in-the-loop diagnosis.

---

## Autonomous Loop Evidence

[TODO: once you have a real loop, paste a short excerpt here or link to
AI-DEV-LOG.md, e.g.:]

```
Agent implemented idle-grace-period logic
bun test → FAIL: reconnect after grace period did not reset track (race condition in clock resume)
Agent inspected failing test output, identified stale lastActiveAt check
Agent corrected condition, re-ran bun test → PASS
(no human prompt between steps 2–4)
```

---

## Human Decisions (Human as Orchestrator)

- Chose WebSocket + server-authoritative state over WebRTC/P2P (reduces
  complexity, avoids redundant signaling infrastructure).
- Rejected Spotify integration after evaluating API constraints (5-user
  dev cap), kept YouTube as sole source.
- Decided skin persistence (localStorage) is exempt from the "no
  client-side sync storage" rule — presentation ≠ sync state.
- Chose to gate parallel skin work behind a validated neutral skeleton
  first, rather than parallelizing immediately.
- Assigned different models per role deliberately (heavier model for
  planning, lighter/faster models for repetitive implementation and fix
  loops) to balance quality against free-tier request quotas.

See `/docs/AI-DEV-LOG.md` for the full chronological account.
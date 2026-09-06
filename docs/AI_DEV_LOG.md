## Day 1

* Repo created as a monorepo (`/client` Vite, `/server` Bun, `/docs`).
* Decided against WebRTC/P2P for synchronization: it still requires a signaling server and adds complexity without removing the shared infrastructure requirement.
* Decided against Spotify integration: developer-mode API caps at 5 allowlisted users, making it unviable for a workspace-wide tool; the YouTube IFrame API was chosen as the sole playback source instead.
* Chose stub email-domain authentication (`@howdy.com`) behind an `AuthProvider` interface, deferring real SSO since there was no admin access to configure it within the competition window.

## Day 2

* Expanded scope: skin system (Walkman, Winamp, Atari, Tamagotchi) behind a shared `Skin` interface.
* Started `SPEC.md` with the project's overall concept using the Nemotron 3 Ultra model and a few manual edits.
* Started `SYSTEM.md` with the help of Claude Sonnet 5, and revised it.
* Bootstrapped an initial Socket.io project in the server.
* Cleaned up the Vite project.
* Automated tests setup for agent harness using Poolside Laguna S 2.1 (`poolside/laguna-s-2.1:free`), split into 2 agents for this implementation: client and server.
* Created agents for OpenCode, each with a specific model: `alignment-reviewer.md`, `skeleton-implementer.md`, `skin-implementer.md`, `loop-fix.md`, and `server-implementer.md`.
* Removed the `reviewer.md` subagent (which used a paid model and was redundant since human and Claude reviews were already happening) and consolidated it into `alignment-reviewer.md` (report-only), while Claude authored `SPEC.md` and `SYSTEM.md` directly for continuity across evolving requirements.
* Discovered that `opencode run --agent <name>` does not invoke subagents (it silently falls back to the default agent); the correct invocation is `@<name>` inside the prompt text rather than the `--agent` flag.
* Revised all docs and agents using Claude Sonnet 5.
* Ready to build.
* Discovered that client/server `package.json` already used Socket.io and Bun's native bundler (instead of Vite or raw WebSocket as originally specified). Reviewed trade-offs with Claude and decided to keep the working setup, updating `SPEC.md`, `SYSTEM.md`, and `AGENTS.md` to match reality instead of reverting.
* Clarified and simplified the grace-period reconnection logic: no session or identity tracking is needed; a single stored timestamp of the last disconnect is enough to compute resume-versus-rebootstrap on the next connect.
* Fixed `package.json` issues found during documentation realignment: `typescript` was incorrectly listed as a `peerDependency` in the server and was moved to `devDependencies`; added missing `typecheck`, `lint`, and `build` scripts required by the documented harness.
* Found an issue with OpenRouter preventing agents from being called in subagent mode, so the mode was changed from subagent to primary as proposed by the community.

## Day 3

* Corrected an unintended deviation to continue using Vite on the frontend.
* Ran the `alignment-reviewer` agent to catch any initial documentation misalignments.
* Encountered an issue starting the skeleton: had to replace `openrouter/z-ai/glm-5.2:free` with `openrouter/poolside/laguna-s-2.1:free` as the former was unavailable.
* Poolside Laguna S 2.1 hit a temporary upstream rate limit mid-session (`skeleton-implementer`). Switched the active session to North Mini Code (free) via OpenCode's model picker to continue without losing progress, without changing the agent's default model configuration.
* The agent finished the skeleton after stopping a few times due to OpenRouter network availability.
* Used Gemini to create detailed design descriptions for each skin in this project from image references.
* Triggered the 5 agents in parallel on Friday the 4th at 15:06: the skin implementers and the server implementer.
* The 4 frontend agents finished their work around 15:15.
* The server agent finished its work around 15:55 due to rate limits.
* Introduced a `skin-tester` agent to create tests before merging the branches from the 5 agents.
* Merged the `skin-tester` tests into the other agents and let them fix issues until all tests passed.
* Finally, opened the 5 PRs targeting main. Got 2 merge simple conflicts on server implementation.
* Using Gemini and a Howdy website section screenshot, it was generated a detailed DESIGN_DIRECTIONS.md to guide another agent that will work on the rest of the app styles.
* Added logo and adjusted a few styles prompting and manually.
* Prompted to update the Neutral skin to incorporate a clean, structured design using the global design system.

## Day 4

* Worked on the external resources:
  - Slack channel, bot token, YouTube keys, etc.
* Wrote server apis integrations prompts and more skins improvements to run in parallel in the next iteration.
* Reviewed the "queue shown in UI" divergence flagged by alignment-reviewer. Decided to keep it and update SPEC.md instead of reverting — the feature added real UX value across all 5 skins, and the existing contract tests already validated it correctly.
* Client bug reports (queue flicker, refresh reset) were observed while testing the new client against the OLD (pre-integration) server, before merge — re-verify both after merging fix/client-player and fix/server-integration, since some symptoms may be resolved by the server-side protocol fixes alone.
* Merged fix/server-integration into fix/client-player (not the reverse) to let the client run real E2E tests against the actual integrated server behavior, since the client agent was struggling to write meaningful tests against the old/mocked server. by setPlaylist() — causing an empty "Up Next" list - but correctly declined to fix it, staying within its own directory scope as instructed, and reported it back instead.
* Relayed the bug report to the server-implementer session (still open in fix/server-integration) for a proper fix within its own scope.
* Third alignment-review after integration fixes: critical findings dropped from 8 to 2 — Socket.io event mismatch (`join-broadcast` vs `join`, drifted after client evolved independently) and Slack display-name fallback using raw user ID instead of `real_name`.
* Ran two sessions in parallel: server-implementer batching the 3 pending fixes (queue-wipe bug, event mismatch, display-name fallback), and skeleton-implementer building the login gate UI — no file overlap, so both proceeded concurrently in separate worktrees.
* The login gate gap (backend fully implemented, no client UI) wasn't caught by either alignment-review pass, since it audits code correctness against spec, not missing UI surface area for an existing backend feature — worth noting as a blind spot of that review method.
* GLM 5.2 hit another rate limit; switched to Laguna S 2.1 for this session, per the established fallback pattern.
* Discovered an agent session printed the full contents of `.env` to the terminal during a debugging command, which likely exposed secret values (Slack bot token, YouTube API key) to the model provider via the conversation context. Treated as a real security incident rather than a cosmetic issue: revoked and rotated all affected credentials (Slack bot token, YouTube API key) immediately, rather than assuming low risk. Updated AGENTS.md adding a hard rule to never print/console the .env file content.

## Day 5

* Ran client and server investigations in parallel for the "restarts from beginning" bug.
* Client (skeleton-implementer) grepped the entire codebase for state-change handlers, found none, and correctly concluded the client only reacts passively to server state — reported back a clean negative result instead of guessing at a fix.
* Server investigation found the actual root cause differed from the initial hypothesis: ad "plays 1s then loops" was NOT a duration-zero bug (durations were already correctly assigned) — the real cause was computeLiveState() computing track transitions but never persisting them via applyState(), causing every tick to recompute from stale state.
* Separately, bootstrapFresh() included the current track inside its own generated queue, causing an occasional replay of the same track via queue.shift(). Both fixed independently.
* Bonus scope addition accepted: real YouTube video titles now resolved for Slack-sourced tracks (previously showed raw URLs), bundled into the same session alongside the max-track-duration cap (12 min) requested earlier.
* Redesigned playback queue from "full rebuild per transition" to a fixed-size rolling window (remove-front, append-back) backed by a separate Library pool (music + ads), after repeated bugs (replay/reset) traced back to full-queue regeneration on every track-end. This is an architectural change, not a bugfix — updated SPEC.md §Playlist Management, §Ads, and §Playback Queue accordingly.


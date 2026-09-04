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
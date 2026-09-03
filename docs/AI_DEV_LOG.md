## Day 1
- Repo created as monorepo (/client Vite, /server Bun, /docs)
- Decided against WebRTC/P2P for sync: still requires a signaling server, adds complexity without removing the shared-infra need
- Decided against Spotify integration: dev-mode API caps at 5 allowlisted users, not viable for a workspace-wide tool. YouTube IFrame API chosen as sole playback source instead
- Chose stub email-domain auth (@howdy.com) behind an AuthProvider interface, deferring real SSO — no admin access to configure it within the competition window

## Day 2
- Expanded scope: skin system (Walkman, Winamp, Atari, Tamagotchi) behind a shared Skin interface
- Started SPEC.md with the project overall concept using the model Nemotron 3 Ultra and a few manual edits
- Started SYSTEM.md with help of Claude Sonnet 5, and revised
- Bootstrapped an initial Socket.io project in the server
- Cleanup Vite project
- Automated tests setup for agent harness, using Laguna S2.1. Split in 2 agents for this implementation: client and server
- Created agens for Open Code, each one with an specific model: alignment-reviewer.md, skeleton-implementer.md, skin-implementer.md, loop-fix.md and server-implementer.
- Removed the reviewer.md subagent (used a paid model, redundant with
  human+Claude review already happening); consolidated into
  alignment-reviewer.md (report-only) + Claude authoring SPEC.md/SYSTEM.md
  directly for continuity across evolving requirements
- Discovered `opencode run --agent <name>` doesn't invoke subagents
  (falls back to default agent silently) — correct invocation is
  `@<name>` inside the prompt text, not the --agent flag
- Revised all docs and agents using Claude Sonnet 5
- Ready to build
- Discovered client/server package.json already used Socket.io and
  Bun's native bundler (not Vite/raw WebSocket as originally spec'd).
  Reviewed trade-offs with Claude; decided to keep the working setup
  and update SPEC.md/SYSTEM.md/AGENTS.md to match reality instead of
  reverting.
- Clarified and simplified the grace-period reconnection logic: no
  session/identity tracking needed — a single stored timestamp at last
  disconnect is enough to compute resume-vs-rebootstrap on next connect.
- Fixed package.json issues found during doc realignment: `typescript`
  was incorrectly listed as a peerDependency in server (moved to
  devDependencies); added missing `typecheck`/`lint`/`build` scripts
  required by the documented harness.
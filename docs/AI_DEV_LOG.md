## Day 1
- Repo created as monorepo (/client Vite, /server Bun, /docs)
- Decided against WebRTC/P2P for sync: still requires a signaling server, adds complexity without removing the shared-infra need
- Decided against Spotify integration: dev-mode API caps at 5 allowlisted users, not viable for a workspace-wide tool. YouTube IFrame API chosen as sole playback source instead
- Chose stub email-domain auth (@howdy.com) behind an AuthProvider interface, deferring real SSO — no admin access to configure it within the competition window

## Day 2
- Expanded scope: skin system (Walkman, Winamp, Atari, Tamagotchi) behind a shared Skin interface
- Started SPEC.md with the project overall concept using the model Nemotron 3 Ultra and a few manual edits
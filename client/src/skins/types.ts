/**
 * /client/src/skins/types.ts
 *
 * The Skin System contract.
 *
 * This file is the single source of truth for the shared client/server
 * playback-state shape and the `Skin` interface that every visual theme
 * must implement. Per SPEC.md (Architecture -> Skin Interface) and the
 * Skeleton Implementer brief, this contract exists *before* any concrete
 * skin is written and must not be extended with skin-specific required
 * props (see client/AGENTS.md rule #4).
 *
 * The server is the single source of truth for playback state. This module
 * only declares the shape clients render; it never computes or owns state.
 */

import type { ReactElement } from "react";

/* ───────────────────────────── PostedBy ───────────────────────────── */

/**
 * User info for track attribution.
 *
 * The server always provides a `PostedBy` with `id`, `displayName`,
 * and `realName` (when available). The client may choose which field
 * to display based on skin design.
 */
export interface PostedBy {
  id: string;
  displayName: string;
  realName?: string;
}

/* ───────────────────────────── Track ───────────────────────────── */

/**
 * A single track or injected ad in the radio timeline.
 *
 * A `Track` is identical whether it is a music track pulled from Slack or
 * an ad pulled from Howdy YouTube Shorts — the only difference is `isAd`.
 */
export interface Track {
  /**
   * Canonical YouTube video ID — the unique identifier for a track.
   * Used as the React list key and as the YouTube IFrame `videoId`.
   */
  videoId: string;
  /** Human-readable title of the track (video title from YouTube). */
  title: string;
  /** Full YouTube URL — rendered as the "source link" per SPEC.md. */
  url: string;
  /**
   * The Slack user who posted the link, already resolved to a display
   * name per SPEC.md: `display_name`, falling back to `real_name`.
   */
  postedBy: PostedBy;
  /** Track duration in seconds (whole seconds). */
  duration: number;
  /**
   * Whether this entry is an injected ad. Ads always play from the start
   * (see SPEC.md -> Ads), so the client treats `position` as 0 for ads.
   */
  isAd: boolean;
}

/* ─────────────────────── Connection lifecycle ─────────────────────── */

/**
 * Connection lifecycle surfaced by the WebSocket layer. This is the one
 * piece of "state" the client tracks itself — it reflects the socket
 * connection, not playback sync (playback sync always comes from server).
 */
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

/* ──────────────────────── Playback state ─────────────────────────── */

/**
 * Authoritative playback state, rendered by every skin.
 *
 * The server owns all fields except `connectionStatus`, which the client
 * derives from its own Socket.io lifecycle. The websocket layer merges
 * server-sent snapshots with the locally-tracked connection status before
 * handing the value to skins.
 */
export interface PlaybackState {
  /** Whether the broadcast is currently playing audio vs. paused. */
  isPlaying: boolean;
  /** The currently playing track, or `null` when idle / between tracks. */
  currentTrack: Track | null;
  /**
   * Current playback position in seconds within `currentTrack`.
   * For ads, the client treats this as 0 (ads always play from start).
   */
  position: number;
  /** Upcoming queue — including injected ads — in scheduled order. */
  queue: Track[];
  /** Socket.io connection lifecycle state (client-derived). */
  connectionStatus: ConnectionStatus;
}

/**
 * The shape the server emits over Socket.io. Identical to
 * {@link PlaybackState} except it omits `connectionStatus`: that field is
 * owned by the client's socket lifecycle, never sent by the server.
 */
export type WirePlaybackState = Omit<PlaybackState, "connectionStatus">;

/* ──────────────────── Socket.io event schema ─────────────────────── */

/**
 * Wire contract between client and server.
 *
 * These typed event signatures are shared here so both ends agree on the
 * message schema at compile time. The server emits `state` (full snapshot
 * on connect + whenever track/queue/playing changes) and `tick` (cheap
 * position-only updates so clients advance their clock in real time).
 */
export interface ServerToClientEvents {
  /** Full state snapshot — sent on connect and on any state change. */
  state: (state: WirePlaybackState) => void;
  /**
   * Position-only tick to keep the position clock advancing in real time
   * without re-sending the entire track + queue each time.
   */
  tick: (payload: { position: number; isPlaying: boolean }) => void;
  /**
   * Broadcast idle signal: the server went idle (last client left). The
   * client should stop advancing and await a fresh `state` on reconnect.
   */
  idle: () => void;
}

export interface ClientToServerEvents {
  /**
   * Control *intent* only (never state): satisfies the browser autoplay
   * policy and signals "tune in / join broadcast" per SPEC.md (Autoplay
   * Handling). The server may use this to know a client is ready.
   */
  "join-broadcast": () => void;
}

/* ──────────────────────── Skin contract ─────────────────────────── */

/**
 * Every skin renders the same {@link PlaybackState} — only presentation
 * differs. Switching skins does not reset playback state (the server
 * keeps ticking and the websocket state persists across skin swaps).
 *
 * `render` returns a framework-native element. This project uses React,
 * so the equivalent of the spec's `VNode` is a `ReactElement`.
 */
export interface Skin {
  /**
   * Stable skin identifier. Persisted in localStorage as the
   * per-user skin preference (explicitly permitted by SPEC.md —
   * skin selection is presentational, not sync state).
   */
  id: string;
  /** Human-readable name shown in the skin gallery. */
  name: string;
  /** Render the skin UI for the given playback state. */
  render(state: PlaybackState): ReactElement;
}

/**
 * A registry of every skin, keyed by `Skin.id`.
 */
export type SkinRegistry = Record<string, Skin>;

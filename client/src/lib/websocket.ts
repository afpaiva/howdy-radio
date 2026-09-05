/**
 * /client/src/lib/websocket.ts
 *
 * Socket.io client wiring.
 *
 * Connects to the server and exposes the live {@link PlaybackState}.
 *
 * Hard rule (client/AGENTS.md #1): this client is "dumb" by design — it
 * never computes or owns playback sync state. It only merges what the
 * server broadcasts with the one piece of locally-derived status it owns:
 * the Socket.io connection lifecycle. Everything else (track, position,
 * queue, playing) comes straight from the server.
 */

import { io, type Socket } from "socket.io-client";
import { useEffect, useState, useRef } from "react";
import type {
  ClientToServerEvents,
  ConnectionStatus,
  PlaybackState,
  PostedBy,
  ServerToClientEvents,
  Track,
  WirePlaybackState,
} from "../skins/types";

/**
 * Socket.io server URL.
 *
 * - Production: omitted — the single Bun process serves client + WS on the
 *   same origin, so `io()` connects to its own origin.
  * - Dev: the Vite dev server (port 3003) is separate from the server
  *   (port 3000 in .env), so we point at the server explicitly.
  */
const WS_URL: string | undefined = (import.meta as any).env.PROD
  ? undefined
  : ((import.meta as any).env.VITE_WS_URL ?? "http://localhost:3000");

/** The merged playback state the UI consumes, or `null` while connecting. */
export interface PlaybackHookResult {
  state: PlaybackState | null;
  /** True once the socket has connected and we hold server state. */
  isLive: boolean;
  /** Send the "join broadcast" control intent (satisfies autoplay policy). */
  tuneIn: () => void;
}

/* ──────────────────────── Wire normalization ──────────────────────── *
 * The server emits tracks using its own Track shape which differs from
 * the client's WirePlaybackState:
 *
 *   Server Track:  { id, title, duration, isAd, postedBy: { id, displayName, realName } }
 *   Client Track:  { videoId, title, url, duration, isAd, postedBy: PostedBy }
 *
 * This adapter normalizes the raw server payload at the boundary so
 * every skin receives data matching the client-side contract.
 * ------------------------------------------------------------------- */

type RawPostedBy = string | { id: string; displayName?: string; realName?: string } | undefined;

/** Normalize a string or Slack user object into the client's PostedBy shape. */
function normalizePostedBy(raw: RawPostedBy): PostedBy {
  if (typeof raw === "string") {
    const name = raw.length > 0 ? raw : "unknown";
    return { id: name, displayName: name };
  }
  if (raw && typeof raw === "object") {
    const displayName = raw.displayName || raw.realName || raw.id || "unknown";
    return {
      id: raw.id || displayName,
      displayName,
      ...(raw.realName ? { realName: raw.realName } : {}),
    };
  }
  return { id: "unknown", displayName: "unknown" };
}

/** Normalize a single raw server track into the client's Track shape. */
function normalizeTrack(raw: unknown): Track {
  const t = (raw ?? {}) as Record<string, unknown>;
  const videoId = String(t.videoId ?? t.id ?? "");
  return {
    videoId,
    title: String(t.title ?? ""),
    url:
      typeof t.url === "string"
        ? t.url
        : `https://www.youtube.com/watch?v=${videoId}`,
    postedBy: normalizePostedBy(t.postedBy as RawPostedBy),
    duration: typeof t.duration === "number" ? t.duration : 0,
    isAd: Boolean(t.isAd),
  };
}

/** Normalize the raw server state to the client's WirePlaybackState shape. */
function normalizeState(raw: unknown): WirePlaybackState {
  if (!raw || typeof raw !== "object") {
    return {
      isPlaying: false,
      currentTrack: null,
      position: 0,
      queue: [],
    };
  }
  const s = raw as Record<string, unknown>;
  return {
    isPlaying: Boolean(s.isPlaying),
    currentTrack: s.currentTrack ? normalizeTrack(s.currentTrack) : null,
    position: typeof s.position === "number" ? s.position : 0,
    queue: Array.isArray(s.queue) ? s.queue.map(normalizeTrack) : [],
  };
}

/**
 * React hook that owns the Socket.io lifecycle and emits a live
 * {@link PlaybackState}. The state is rebuilt from server events only —
 * the client never runs its own playback clock.
 */
export function usePlayback(): PlaybackHookResult {
  const [state, setState] = useState<PlaybackState | null>(null);
  const [isLive, setLive] = useState(false);

  // Keep a stable socket reference across renders without re-connecting.
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  useEffect(() => {
    const socket = io(WS_URL);
    socketRef.current = socket;

    // Track connection lifecycle — the client's only self-owned state.
    function setConnectionStatus(status: ConnectionStatus) {
      setState((prev) =>
        prev ? { ...prev, connectionStatus: status } : null,
      );
    }

    socket.on("connect", () => {
      setConnectionStatus("connected");
      setLive(true);
      // Do NOT emit "join" here — the server already sends "state" on connect.
      // The "join-broadcast" control intent is only emitted after the user
      // clicks "Tune in" (tuneIn()), satisfying the autoplay policy.
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
      setLive(false);
    });

    socket.on("connect_error", () => {
      setConnectionStatus("connecting");
      setLive(false);
    });

    // Full server-authoritative snapshot — on connect and on any change.
    // Normalize the raw server payload to match the client-side contract
    // (postedBy as PostedBy, videoId instead of id, synthesized url field).
    socket.on("state", (snapshot: WirePlaybackState) => {
      const state = normalizeState(snapshot);
      setState((prev) => ({
        ...state,
        connectionStatus: prev?.connectionStatus ?? "connected",
      }));
    });

    // Cheap position tick — keeps the rendered clock advancing in real time.
    socket.on("tick", (payload: { position: number; isPlaying: boolean }) => {
      setState((prev) =>
        prev
          ? { ...prev, position: payload.position, isPlaying: payload.isPlaying }
          : null,
      );
    });

    // Server went idle (all clients disconnected); expect a fresh `state`.
    socket.on("idle", () => {
      setState((prev) =>
        prev ? { ...prev, isPlaying: false } : null,
      );
    });

    return () => {
      socket.disconnect();
    };
    // `socketRef` is stable; the empty dep array means connect once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tuneIn = () => {
    socketRef.current?.emit("join-broadcast");
  };

  return { state, isLive, tuneIn };
}
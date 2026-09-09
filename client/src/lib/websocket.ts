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
 * - Set `VITE_WS_URL` whenever the client is not served from the same origin
 *   as the conductor (GitHub Pages, Vite dev server, etc.).
 * - Dev fallback: `http://localhost:3000` if the var is unset.
 * - Same-origin production (Bun serving `client/dist`): leave unset so
 *   `io()` connects to the page origin.
 */
const WS_URL: string | undefined =
  (import.meta as any).env.VITE_WS_URL || "http://localhost:3000";

let sharedSocket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let sharedState: PlaybackState | null = null;
let sharedIsLive = false;
const subscribers = new Set<(nextState: PlaybackState | null, nextIsLive: boolean) => void>();

function createDefaultState(): PlaybackState {
  return {
    isPlaying: false,
    currentTrack: null,
    position: 0,
    queue: [],
    connectionStatus: "connecting",
    clientCount: 0,
  };
}

function notifySubscribers() {
  for (const listener of subscribers) {
    listener(sharedState, sharedIsLive);
  }
}

function setSharedState(nextState: PlaybackState | null, nextIsLive: boolean) {
  sharedState = nextState;
  sharedIsLive = nextIsLive;
  notifySubscribers();
}

function getSharedSocket() {
  if (!sharedSocket) {
    sharedSocket = io(WS_URL);

    sharedSocket.on("connect", () => {
      const prev = sharedState ?? createDefaultState();
      setSharedState({ ...prev, connectionStatus: "connected" }, true);
    });

    sharedSocket.on("disconnect", () => {
      const prev = sharedState ?? createDefaultState();
      setSharedState({ ...prev, connectionStatus: "disconnected" }, false);
    });

    sharedSocket.on("connect_error", () => {
      const prev = sharedState ?? createDefaultState();
      setSharedState({ ...prev, connectionStatus: "connecting" }, false);
    });

    sharedSocket.on("state", (snapshot: WirePlaybackState & { clientCount?: number }) => {
      const normalized = normalizeState(snapshot);
      const prev = sharedState ?? createDefaultState();
      setSharedState(
        {
          ...normalized,
          connectionStatus:
            prev.connectionStatus === "disconnected" ? "disconnected" : "connected",
        },
        true,
      );
    });

    sharedSocket.on("tick", (payload: { position: number; isPlaying: boolean }) => {
      if (!sharedState) return;
      setSharedState(
        { ...sharedState, position: payload.position, isPlaying: payload.isPlaying },
        sharedIsLive,
      );
    });

    sharedSocket.on("idle", () => {
      if (!sharedState) return;
      setSharedState({ ...sharedState, isPlaying: false }, false);
    });
  }

  return sharedSocket;
}

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
function normalizeState(raw: unknown): WirePlaybackState & { clientCount?: number } {
  if (!raw || typeof raw !== "object") {
    return {
      isPlaying: false,
      currentTrack: null,
      position: 0,
      queue: [],
      clientCount: 0,
    };
  }
  const s = raw as Record<string, unknown>;
  return {
    isPlaying: Boolean(s.isPlaying),
    currentTrack: s.currentTrack ? normalizeTrack(s.currentTrack) : null,
    position: typeof s.position === "number" ? s.position : 0,
    queue: Array.isArray(s.queue) ? s.queue.map(normalizeTrack) : [],
    clientCount: typeof s.clientCount === "number" ? s.clientCount : 0,
  };
}

/**
 * React hook that owns the Socket.io lifecycle and emits a live
 * {@link PlaybackState}. The state is rebuilt from server events only —
 * the client never runs its own playback clock.
 */
export function usePlayback(): PlaybackHookResult {
  const [state, setState] = useState<PlaybackState | null>(() => sharedState);
  const [isLive, setLive] = useState(sharedIsLive);

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  useEffect(() => {
    if (socketRef.current) return;
    const socket = getSharedSocket();
    socketRef.current = socket;

    const listener = (nextState: PlaybackState | null, nextIsLive: boolean) => {
      setState(nextState);
      setLive(nextIsLive);
    };

    subscribers.add(listener);
    listener(sharedState, sharedIsLive);

    return () => {
      subscribers.delete(listener);
      // Keep the singleton socket alive for the lifetime of the app.
      // In React StrictMode / dev remounts, a hook may unmount and remount
      // immediately; disconnecting here triggers a second raw Socket.io
      // connection for the same user. We only remove the local subscriber,
      // leaving the app-wide connection intact.
    };
    // `socketRef` is stable; the empty dep array means connect once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tuneIn = () => {
    socketRef.current?.emit("join-broadcast");
  };

  return { state, isLive, tuneIn };
}
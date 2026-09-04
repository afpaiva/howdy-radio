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
  ServerToClientEvents,
  WirePlaybackState,
} from "../skins/types";

/**
 * Socket.io server URL.
 *
 * - Production: omitted — the single Bun process serves client + WS on the
 *   same origin, so `io()` connects to its own origin.
 * - Dev: the Vite dev server (port 3003) is separate from the server
 *   (port 3001), so we point at the server explicitly.
 */
const WS_URL: string | undefined = (import.meta as any).env.PROD
  ? undefined
  : ((import.meta as any).env.VITE_WS_URL ?? "http://localhost:3001");

/** The merged playback state the UI consumes, or `null` while connecting. */
export interface PlaybackHookResult {
  state: PlaybackState | null;
  /** True once the socket has connected and we hold server state. */
  isLive: boolean;
  /** Send the "join broadcast" control intent (satisfies autoplay policy). */
  tuneIn: () => void;
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
      // Control intent: "tune in / join broadcast" (autoplay gate).
      socket.emit("join");
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
    socket.on("state", (snapshot: WirePlaybackState) => {
      setState((prev) => ({
        ...snapshot,
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
    socketRef.current?.emit("join");
  };

  return { state, isLive, tuneIn };
}
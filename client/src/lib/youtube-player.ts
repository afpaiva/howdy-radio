/**
 * /client/src/lib/youtube-player.ts
 *
 * Thin wrapper around the YouTube IFrame Player API for audio-first,
 * hidden playback (client/AGENTS.md hard rule #5).
 *
 * The IFrame is mounted into a visually-hidden container — the UI only ever
 * shows track metadata (title, source link, poster, controls), never the raw
 * video on screen.
 *
 * Per client/AGENTS.md hard rule #6, audio is NEVER started unprompted:
 * `syncTo(state, enabled)` is a no-op unless `enabled === true`, and that
 * flag is only flipped after the user clicks "Tune in" (satisfying the
 * browser autoplay-interaction policy).
 *
 * Per client/AGENTS.md hard rule #1, this wrapper owns no playback clock of
 * its own — it only ever drives the player to match the server-authoritative
 * {@link PlaybackState} it is handed.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { PlaybackState, Track } from "../skins/types";

/** Source URL of the YouTube IFrame Player API script. */
export const YOUTUBE_IFRAME_API_URL =
  "https://www.youtube.com/iframe_api";

/** Window-global name the API calls once `YT.Player` is ready. */
const YT_READY_CALLBACK = "onYouTubeIframeAPIReady";

/* ──────────────────── YT IFrame API surface (minimal) ──────────────────── *
 * We declare only the slice of the IFrame Player API this wrapper relies on.
 * The real `YT` global exposes far more, but we keep the contract tight.
 * ------------------------------------------------------------------- */

/** Options passed to `new YT.Player(target, options)`. */
export interface YTIframePlayerOptions {
  /**
   * Optional initial video. We omit this and load the first track via
   * `cueVideoById` so the player is always started at the server-authoritative
   * position (never at 0 by default).
   */
  videoId?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (event: { target: YTIframePlayer }) => void;
    onError?: (event: { data: number }) => void;
  };
}

/** The slice of the YT player instance this wrapper drives. */
export interface YTIframePlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  seekTo(second: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  getVideoData(): { video_id: string };
  destroy(): void;
}

/** The `YT` global shape we touch. */
export interface YTGlobal {
  Player: new (
    target: string | HTMLElement,
    options: YTIframePlayerOptions,
  ) => YTIframePlayer;
}

/** A window-like surface the loader reads/writes (test seam). */
export interface YouTubeWindow {
  YT?: YTGlobal;
  document?: Document;
  onYouTubeIframeAPIReady?: () => void;
}

/* ──────────────────── playerVars (audio-first / hidden) ──────────────────── */

/**
 * playerVars that keep the player audio-first and on-screen invisible:
 * no controls, no branding, no fullscreen, no captions/annotations, and
 * autoplay disabled at the iframe level so we drive play/pause explicitly
 * from server state (only after the user "Tune in" gesture).
 */
const AUDIO_FIRST_PLAYER_VARS: Record<string, number | string> = {
  controls: 0,
  modestbranding: 1,
  rel: 0,
  playsinline: 1,
  fs: 0,
  cc_load_policy: 0,
  iv_load_policy: 3,
  autoplay: 0,
};

/* ──────────────────── Hook options ──────────────────── */

export interface YouTubePlayerOptions {
  /** Override the IFrame API script URL (test seam). */
  apiUrl?: string;
  /** Window/global to load the API from (defaults to the real `window`). */
  win?: YouTubeWindow;
  /** Fires once the underlying YT.Player has emitted `onReady`. */
  onReady?: () => void;
  /** Fires when YouTube reports an unrecoverable playback error (error code). */
  onError?: (errorCode: number) => void;
}

/**
 * Max drift (seconds) between the server's reported position and the
 * player's own clock before we nudge the player back in line. Keeps audio
 * tight to the server-authoritative timeline without re-seeking on every
 * sub-second latency wobble (client/AGENTS.md hard rule #1: no local clock).
 */
export const SEEK_DEADBAND_SECONDS = 1.0;

/* ──────────────────── Core wrapper ──────────────────── */

/**
 * Wraps the YouTube IFrame Player API in an audio-first, hidden container.
 *
 * Lifecycle:
 *   1. `loadAPI()` — loads (or reuses) the YouTube IFrame API script.
 *   2. On the first `syncTo()` with a track, the `YT.Player` is created
 *      inside the hidden target element (audio-first vars, autoplay=0).
 *   3. `syncTo(state, enabled)` is the single entry point: it cues /
 *      seeks / plays / pauses the player to match the server state, but
 *      ONLY when `enabled === true` (post "Tune in").
 */
export class YouTubePlayer {
  private target: HTMLElement;
  private win: YouTubeWindow;
  private apiUrl: string;
  private onReadyCb?: () => void;
  private onErrorCb?: (errorCode: number) => void;

  /** The underlying YT.Player instance, once created. */
  private player: YTIframePlayer | null = null;
  /** Whether the player's `onReady` has fired. */
  private ytReady: boolean = false;

  /** Resolves once the YT.Player has fired `onReady` for its current incarnation. */
  private readyResolve: () => void = () => {};
  /** Latch the latest ready promise so callers await the correct incarnation. */
  private readyPromise: Promise<void> = Promise.resolve();

  /** Resolves once `window.YT` is available (script loaded). Cached. */
  private apiPromise: Promise<void> | null = null;

  /** Serializes concurrent syncTo calls to avoid double player creation. */
  private syncChain: Promise<void> = Promise.resolve();

  constructor(target: HTMLElement, options: YouTubePlayerOptions = {}) {
    this.target = target;
    this.win =
      options.win ??
      (typeof window !== "undefined"
        ? (window as unknown as YouTubeWindow)
        : ({} as YouTubeWindow));
    this.apiUrl = options.apiUrl ?? YOUTUBE_IFRAME_API_URL;
    this.onReadyCb = options.onReady;
    this.onErrorCb = options.onError;
  }

  /* ── Introspection ── */

  /** True once `new YT.Player(...)` has fired `onReady`. */
  isReady(): boolean {
    return this.player !== null && this.ytReady;
  }

  /** The videoId currently loaded in the player (empty until a track loads). */
  getVideoId(): string {
    if (!this.player) return "";
    try {
      return this.player.getVideoData().video_id || "";
    } catch {
      return "";
    }
  }

  /** The YT API is loaded and `YT.Player` is callable. */
  isApiLoaded(): boolean {
    return Boolean(this.win.YT && typeof this.win.YT.Player === "function");
  }

  /* ── API loading ── */

  /**
   * Ensures the YouTube IFrame API script is available. Idempotent — returns
   * immediately if `window.YT.Player` is already defined.
   */
  async loadAPI(): Promise<void> {
    if (this.isApiLoaded()) return;
    // Coalesce concurrent callers onto a single in-flight load.
    if (this.apiPromise) return this.apiPromise;

    const win = this.win;
    const doc = win.document ?? (typeof document !== "undefined" ? (document as unknown as Document) : undefined);

    this.apiPromise = new Promise<void>((resolve, reject) => {
      if (this.isApiLoaded()) {
        resolve();
        return;
      }

      // The API invokes this global when `YT` is ready.
      win[YT_READY_CALLBACK] = () => {
        if (this.isApiLoaded()) resolve();
        else
          reject(
            new Error(
              "YouTube IFrame API ready callback fired but YT.Player unavailable",
            ),
          );
      };

      if (!doc) {
        reject(
          new Error("No document available to load the YouTube IFrame API"),
        );
        return;
      }

      const tag = doc.createElement("script");
      tag.src = this.apiUrl;
      tag.async = true;
      tag.defer = true;
      tag.onerror = () => {
        reject(
          new Error(
            `Failed to load YouTube IFrame API from ${this.apiUrl}`,
          ),
        );
      };
      doc.head.appendChild(tag);
    });

    try {
      await this.apiPromise;
    } finally {
      this.apiPromise = null;
    }
  }

  /* ── Player construction ── */

  /**
   * Creates the underlying `YT.Player` (audio-first, hidden vars). Must be
   * called after `loadAPI()`. Safe to call repeatedly — only the first call
   * constructs the player.
   *
   * The player is created *without* an initial video and loaded on-demand via
   * `cueVideoById` so every track starts at the server-authoritative position
   * (never silently at 0).
   */
  private createPlayer(): void {
    const yt = this.win.YT;
    if (!yt || typeof yt.Player !== "function") {
      throw new Error(
        "YouTube IFrame API is not loaded; call loadAPI() first",
      );
    }

    // Reset the ready latch for the new player instance.
    this.ytReady = false;
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });

    this.player = new yt.Player(this.target, {
      playerVars: AUDIO_FIRST_PLAYER_VARS,
      events: {
        onReady: () => {
          this.ytReady = true;
          this.readyResolve();
          this.onReadyCb?.();
        },
        onError: (event) => {
          this.onErrorCb?.(event.data);
        },
      },
    });
  }

  /** Resolves once the player's `onReady` has fired (no-op if not created). */
  private whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /* ── Command surface (public, used by syncTo) ── */

  /** Cue a video at `position` (loaded but not playing — autoplay=0). */
  cue(videoId: string, position: number): void {
    this.player?.cueVideoById(videoId, position);
  }

  /** Seek the current video to `position` seconds. */
  seek(position: number): void {
    this.player?.seekTo(position, true);
  }

  play(): void {
    this.player?.playVideo();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  /** Stop & unload audio (used when the broadcast goes idle). */
  stop(): void {
    this.player?.stopVideo();
  }

  /* ── The single state-driving entry point ── */

  /**
   * Drives the player to match the server-authoritative {@link PlaybackState}.
   *
   * - Does nothing while `!enabled` (before the user "Tune in").
   * - Idle state (no current track) stops audio.
   * - A new videoId cues the video at the correct start position.
   * - Same video advances to the server position when drift exceeds the
   *   {@link SEEK_DEADBAND_SECONDS} deadband.
   * - Ads always seek to 0 (SPEC.md -> Ads); music may start mid-track.
   *
   * Returns a promise that resolves once the sync attempt has settled.
   */
  syncTo(state: PlaybackState, enabled: boolean): Promise<void> {
    if (!enabled) return Promise.resolve();

    const track: Track | null = state.currentTrack;
    const hasTrack = Boolean(track && track.videoId);
    const cuePosition: number =
      hasTrack && track
        ? track.isAd
          ? 0
          : clampNonNegative(state.position)
        : 0;

    // Serialize concurrent syncTo calls (ticks arrive every second; the first
    // one may still be loading the API when the next arrives). This also
    // guarantees createPlayer runs exactly once.
    const next = (this.syncChain = this.syncChain.then(async () => {
      try {
        await this.loadAPI();

        if (!track || !track.videoId) {
          if (this.player && this.ytReady) this.stop();
          return;
        }

        if (!this.player) this.createPlayer();
        await this.whenReady();

        if (this.getVideoId() !== track.videoId) {
          // Track change (or first load): cue at the correct start position.
          this.cue(track.videoId, cuePosition);
        } else if (this.shouldSeek(state.position)) {
          // Same track, drifted past the deadband: nudge back to server time.
          this.seek(clampNonNegative(state.position));
        }

        // Authoritative play/pause from the server.
        if (state.isPlaying) this.play();
        else this.pause();
      } catch (error: unknown) {
        // Keep the serialization chain healthy; surface via onError.
        console.error?.("[youtube-player] sync error", error);
        this.onErrorCb?.(20);
      }
    }));

    return next;
  }

  /** Whether the player has drifted from `serverPosition` past the deadband. */
  private shouldSeek(serverPosition: number): boolean {
    if (!this.player) return false;
    let current = NaN;
    try {
      current = this.player.getCurrentTime();
    } catch {
      return true;
    }
    if (!Number.isFinite(current)) return true;
    return (
      Math.abs(current - clampNonNegative(serverPosition)) >
      SEEK_DEADBAND_SECONDS
    );
  }

  /** Tear down the underlying player and release the iframe. */
  destroy(): void {
    try {
      this.player?.destroy();
    } catch {
      /* best-effort: the API may already be gone */
    }
    this.player = null;
    this.ytReady = false;
    this.readyResolve = () => {};
    this.readyPromise = Promise.resolve();
  }
}

/* ──────────────────── React hook (App.tsx glue) ──────────────────── */

/**
 * Audio-first hook: mounts the YouTube IFrame into a visually-hidden
 * container and synchronizes it to the server-authoritative
 * {@link PlaybackState}.
 *
 * Pass the returned ref to a hidden `<div>`. The hook creates the
 * {@link YouTubePlayer} on mount, preloads the IFrame API script (no audio),
 * and — only once `enabled` is true and state is present — drives playback.
 *
 * Per client/AGENTS.md hard rule #6, `enabled` must be tied to the user's
 * "Tune in" click so audio never starts unprompted.
 */
export function useYouTubePlayer(
  state: PlaybackState | null,
  enabled: boolean,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);

  // Mount: create the (silent) wrapper and preload the YT API script so the
  // first play after "Tune in" is fast and clearly within the gesture window.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let player = playerRef.current;
    if (!player) {
      player = new YouTubePlayer(container);
      playerRef.current = player;
    }
    // Preload the IFrame API (script only — no iframe, no audio).
    void player.loadAPI().catch((error: unknown) => {
      console.error?.("[youtube-player] IFrame API failed to load", error);
    });
  }, []);

  // Sync: drive the player to the server state while enabled (post tune-in).
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !enabled || !state) return;
    void player
      .syncTo(state, true)
      .catch((error: unknown) => {
        console.error?.("[youtube-player] sync error", error);
      });
  }, [enabled, state]);

  // Unmount: tear down the player + iframe.
  useEffect(() => {
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return containerRef;
}

/* ──────────────────── Helpers ──────────────────── */

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

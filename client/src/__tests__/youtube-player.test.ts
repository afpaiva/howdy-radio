/**
 * /client/src/__tests__/youtube-player.test.ts
 *
 * Unit tests for the YouTube IFrame Player wrapper.
 *
 * We inject a fake `window.YT.Player` so no network/script load is required,
 * and we drive the wrapper through the same `syncTo` entry point that the
 * App uses to reconcile server state. The assertions verify the audio-first
 * contract: the player is only ever cued/played while `enabled` (post
 * "Tune in"), tracks cue at the correct position, ads start at 0, and idle
 * state stops playback.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { YouTubePlayer } from "../lib/youtube-player";
import type { PlaybackState, Track } from "../skins/types";

/* ─────────────────────── Fixtures ─────────────────────── */

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    videoId: "abc123",
    title: "Test Track Title",
    url: "https://www.youtube.com/watch?v=abc123",
    postedBy: { id: "user123", displayName: "alice" },
    duration: 200,
    isAd: false,
    ...overrides,
  };
}

function makeState(
  track: Track | null,
  position: number,
  isPlaying: boolean,
): PlaybackState {
  return {
    isPlaying,
    currentTrack: track,
    position,
    queue: [],
    connectionStatus: "connected",
  };
}

/* ─────────────────────── Mock IFrame API ─────────────────────── */

/** Records every call so tests can assert playback behavior. */
interface PlayerCalls {
  playVideo: number;
  pauseVideo: number;
  stopVideo: number;
  cue: { videoId: string; startSeconds?: number }[];
  seek: number[];
  destroy: number;
}

function freshCalls(): PlayerCalls {
  return {
    playVideo: 0,
    pauseVideo: 0,
    stopVideo: 0,
    cue: [],
    seek: [],
    destroy: 0,
  };
}

let calls: PlayerCalls;

class MockPlayer {
  videoId: string;
  currentTime: number;
  destroyed = false;

  constructor(
    _target: HTMLElement,
    options: { videoId: string; events?: { onReady?: (e: { target: unknown }) => void } },
  ) {
    this.videoId = options?.videoId ?? "";
    this.currentTime = 0;
    options?.events?.onReady?.({ target: this });
  }

  playVideo() {
    calls.playVideo++;
  }
  pauseVideo() {
    calls.pauseVideo++;
  }
  stopVideo() {
    calls.stopVideo++;
  }
  cueVideoById(videoId: string, startSeconds?: number) {
    this.videoId = videoId;
    this.currentTime = startSeconds ?? 0;
    calls.cue.push({ videoId, startSeconds });
  }
  loadVideoById(videoId: string, startSeconds?: number) {
    this.cueVideoById(videoId, startSeconds);
  }
  seekTo(second: number) {
    this.currentTime = second;
    calls.seek.push(second);
  }
  getCurrentTime() {
    return this.currentTime;
  }
  getPlayerState() {
    return this.destroyed ? -1 : 1;
  }
  getVideoData() {
    return { video_id: this.videoId };
  }
  destroy() {
    calls.destroy++;
    this.destroyed = true;
  }
}

function installMockYT() {
  (window as unknown as { YT: unknown }).YT = { Player: MockPlayer };
}

function removeMockYT() {
  delete (window as unknown as { YT?: unknown }).YT;
}

/* ─────────────────────── Tests ─────────────────────── */

const container = () => {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
};

describe("YouTubePlayer", () => {
  beforeEach(() => {
    calls = freshCalls();
    installMockYT();
  });

  afterEach(() => {
    removeMockYT();
    // Clean up script tags injected by loadAPI when YT is absent.
    document.head
      .querySelectorAll('script[src*="youtube.com/iframe_api"]')
      .forEach((s) => s.remove());
    document.body.innerHTML = "";
  });

  it("exposes isApiLoaded true once window.YT.Player is present", () => {
    const player = new YouTubePlayer(container());
    expect(player.isApiLoaded()).toBe(true);
  });

  it("loadAPI resolves immediately when YT is already present", async () => {
    const player = new YouTubePlayer(container());
    await expect(player.loadAPI()).resolves.toBeUndefined();
  });

  it("loadAPI resolves via the onYouTubeIframeAPIReady callback", async () => {
    removeMockYT();
    const player = new YouTubePlayer(container());

    const pending = player.loadAPI();
    // Simulate the API script having loaded and the global being ready.
    installMockYT();
    await Promise.resolve(); // flush microtasks before invoking the callback
    (window as unknown as { onYouTubeIframeAPIReady?: () => void })
      .onYouTubeIframeAPIReady!();

    await expect(pending).resolves.toBeUndefined();
    expect(player.isApiLoaded()).toBe(true);
  });

  it("cues and plays a new track at the server position", async () => {
    const player = new YouTubePlayer(container());
    await player.syncTo(makeState(makeTrack({ videoId: "abc", duration: 200 }), 65, true), true);

    expect(calls.cue).toEqual([{ videoId: "abc", startSeconds: 65 }]);
    expect(calls.playVideo).toBe(1);
    expect(player.getVideoId()).toBe("abc");
  });

  it("cues ads at position 0 (ads always play from the start)", async () => {
    const player = new YouTubePlayer(container());
    await player.syncTo(
      makeState(makeTrack({ videoId: "ad1", isAd: true, duration: 45 }), 45, true),
      true,
    );
    expect(calls.cue).toEqual([{ videoId: "ad1", startSeconds: 0 }]);
    expect(calls.playVideo).toBe(1);
  });

  it("pauses when the server state is playing=false", async () => {
    const player = new YouTubePlayer(container());
    await player.syncTo(makeState(makeTrack({ videoId: "abc" }), 10, false), true);
    expect(calls.cue).toEqual([{ videoId: "abc", startSeconds: 10 }]);
    expect(calls.pauseVideo).toBe(1);
    expect(calls.playVideo).toBe(0);
  });

  it("seeks only when the same track drifts past the deadband", async () => {
    const player = new YouTubePlayer(container());
    // Initial cue at position 10.
    await player.syncTo(makeState(makeTrack({ videoId: "abc" }), 10, true), true);
    expect(calls.cue).toEqual([{ videoId: "abc", startSeconds: 10 }]);

    // Small drift (0.5s) within deadband -> no seek.
    const seekCount = calls.seek.length;
    await player.syncTo(makeState(makeTrack({ videoId: "abc" }), 10.5, true), true);
    expect(calls.seek.length).toBe(seekCount);

    // Large drift (5s) past deadband -> one seek.
    await player.syncTo(makeState(makeTrack({ videoId: "abc" }), 15, true), true);
    expect(calls.seek).toContain(15);
  });

  it("cues a new video when the track changes", async () => {
    const player = new YouTubePlayer(container());
    await player.syncTo(makeState(makeTrack({ videoId: "abc" }), 10, true), true);
    await player.syncTo(makeState(makeTrack({ videoId: "xyz" }), 5, true), true);

    expect(calls.cue.map((c) => c.videoId)).toEqual(["abc", "xyz"]);
    expect(calls.cue[calls.cue.length - 1]).toEqual({
      videoId: "xyz",
      startSeconds: 5,
    });
    expect(calls.playVideo).toBe(2);
  });

  it("stops playback when the broadcast goes idle (no current track)", async () => {
    const player = new YouTubePlayer(container());
    await player.syncTo(makeState(makeTrack({ videoId: "abc" }), 10, true), true);
    expect(calls.playVideo).toBe(1);

    await player.syncTo(makeState(null, 0, false), true);
    expect(calls.stopVideo).toBe(1);
  });

  it("does not create a player or play audio while disabled", async () => {
    const player = new YouTubePlayer(container());
    await player.syncTo(makeState(makeTrack({ videoId: "abc" }), 10, true), false);

    expect(player.getVideoId()).toBe("");
    expect(calls.playVideo).toBe(0);
    expect(calls.cue.length).toBe(0);
  });

  it("destroy() releases the underlying player", async () => {
    const player = new YouTubePlayer(container());
    await player.syncTo(makeState(makeTrack({ videoId: "abc" }), 10, true), true);
    expect(calls.destroy).toBe(0);

    player.destroy();
    expect(calls.destroy).toBe(1);
    expect(player.getVideoId()).toBe("");
  });

  it("serializes concurrent syncTo calls without double-creating the player", async () => {
    const player = new YouTubePlayer(container());
    // Fire several syncTo calls in quick succession (as 1s ticks would).
    await Promise.all([
      player.syncTo(makeState(makeTrack({ videoId: "abc" }), 10, true), true),
      player.syncTo(makeState(makeTrack({ videoId: "abc" }), 11, true), true),
      player.syncTo(makeState(makeTrack({ videoId: "abc" }), 12, true), true),
    ]);
    // Exactly one YT.Player constructed.
    expect(calls.cue.length).toBe(1);
    // Each tick applied its own play intent (server is authoritative).
    expect(calls.playVideo).toBeGreaterThanOrEqual(1);
  });
});

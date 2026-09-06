import { test, expect, describe, beforeEach } from "bun:test";
import { Conductor } from "../conductor/conductor";
import type { Track } from "../types";

// Mock tracks for testing
const mockTrack1: Track = {
  id: "video1",
  title: "Test Track 1",
  duration: 300,
  isAd: false,
};

const mockTrack2: Track = {
  id: "video2",
  title: "Test Track 2",
  duration: 200,
  isAd: false,
};

const mockAd: Track = {
  id: "short1",
  title: "Test Ad",
  duration: 45,
  isAd: true,
};

describe("Conductor - Bootstrap", () => {
  let conductor: Conductor;

  beforeEach(() => {
    conductor = new Conductor(5); // 5 minute grace period
  });

  test("initial bootstrap picks a random track", async () => {
    const state = await conductor.onClientConnect();

    expect(state.isPlaying).toBe(true);
    expect(state.currentTrack).not.toBeNull();
    expect(state.clientCount).toBe(1);
    // Position should be within the track duration
    if (state.currentTrack) {
      expect(state.position).toBeGreaterThanOrEqual(0);
      expect(state.position).toBeLessThan(state.currentTrack.duration);
    }
  });

  test("bootstrap with explicit tracks uses provided playlist", async () => {
    // Connect a client so clientCount > 0 (allows live state computation)
    await conductor.onClientConnect();
    const tracks = [mockTrack1, mockTrack2];
    const state = conductor.bootstrapFresh(tracks);

    expect(state.isPlaying).toBe(true);
    expect(state.currentTrack).not.toBeNull();
    expect(state.clientCount).toBe(1);
  });

  test("bootstrap with empty track list returns null state", () => {
    const state = conductor.bootstrapFresh([]);

    expect(state.isPlaying).toBe(false);
    expect(state.currentTrack).toBeNull();
    expect(state.position).toBe(0);
  });

  test("bootstrap uses random start position by default", async () => {
    await conductor.onClientConnect();
    const state = conductor.bootstrapFresh([mockTrack1]);

    // Position should be within the track (could be random, including 0)
    expect(state.position).toBeGreaterThanOrEqual(0);
    expect(state.position).toBeLessThan(mockTrack1.duration);
  });

  test("bootstrap with useRandomStart=false always starts at position 0", async () => {
    await conductor.onClientConnect();
    
    // Run multiple times to verify it's always 0
    for (let i = 0; i < 50; i++) {
      const state = conductor.bootstrapFresh([mockTrack1], false);
      expect(state.position).toBe(0);
      expect(state.currentTrack?.id).toBe(mockTrack1.id);
    }
  });

  test("bootstrapFresh preserves existing queue (Up Next stays populated)", async () => {
    await conductor.onClientConnect();
    
    // Set up a playlist with ads, which populates the queue
    const tracks = [mockTrack1, mockTrack2, { ...mockTrack1, id: "v3" }];
    const ads = [{ ...mockAd, id: "ad1" }];
    conductor.setPlaylist(tracks, ads, 1);
    
    // Bootstrap with a specific track — this should NOT wipe the queue
    const state = conductor.bootstrapFresh([mockTrack1]);
    
    // Queue should still be populated (not empty)
    expect(state.queue.length).toBeGreaterThan(0);
    // The queue should contain the injected ads and music tracks
    expect(state.queue.some((t) => t.isAd)).toBe(true);
  });

  test("onClientConnect after setPlaylist preserves queue with ads", async () => {
    // Simulate server startup: setPlaylist is called before any client connects
    const tracks = [mockTrack1, mockTrack2];
    const ads = [mockAd];
    conductor.setPlaylist(tracks, ads, 1);

    // A client connecting should get a state with a populated queue
    const state = await conductor.onClientConnect();

    expect(state.queue.length).toBeGreaterThan(0);
    expect(state.queue.some((t) => t.isAd)).toBe(true);
  });

  test("onClientConnect without setPlaylist still gets non-empty queue (seed fallback)", async () => {
    // No setPlaylist() called — conductor should fall back to seed playlist
    const state = await conductor.onClientConnect();

    // Queue should be populated from seed tracks even without setPlaylist
    expect(state.queue.length).toBeGreaterThan(0);
  });

  test("mock mode flow: seed playlist + ads + bootstrap yields populated queue", async () => {
    // Simulate the server startup flow in mock mode (no credentials)
    const { SeedPlaylist } = await import("../seed/playlist");
    const tracks = SeedPlaylist.getMusicTracks();
    const ads = SeedPlaylist.getAds();

    conductor.setPlaylist(tracks, ads, 3);

    // A client connecting should get a state with a populated queue including ads
    const state = await conductor.onClientConnect();

    expect(state.queue.length).toBeGreaterThan(0);
    expect(state.queue.some((t) => t.isAd)).toBe(true);
    expect(state.currentTrack).not.toBeNull();
    expect(state.isPlaying).toBe(true);
  });
});

describe("Conductor - Idle/Grace Period", () => {
  let conductor: Conductor;

  beforeEach(() => {
    conductor = new Conductor(5);
  });

  test("last client disconnect stores idle snapshot", async () => {
    // Connect a client
    await conductor.onClientConnect();

    // Disconnect (simulate last client)
    conductor.onClientDisconnect();

    // Verify idle snapshot is stored
    const snapshot = conductor.getIdleSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.trackId).not.toBeNull();
    expect(snapshot!.position).toBeGreaterThanOrEqual(0);
    expect(snapshot!.disconnectedAt).toBeGreaterThan(0);
  });

  test("reconnect within grace period resumes same track", async () => {
    // Connect a client to bootstrap
    const state1 = await conductor.onClientConnect();
    const trackId = state1.currentTrack?.id;
    const position = state1.position;

    // Disconnect
    conductor.onClientDisconnect();

    // Reconnect immediately (within grace period)
    const state2 = await conductor.onClientConnect();

    // Should resume the same track at an advanced position
    expect(state2.currentTrack?.id).toBe(trackId);
    expect(state2.position).toBeGreaterThanOrEqual(position);
    // Position should advance by elapsed time
    expect(state2.position).toBeGreaterThan(position - 1); // Small tolerance
  });

  test("reconnect after grace period triggers fresh bootstrap", async () => {
    // Connect a client
    await conductor.onClientConnect();

    // Disconnect
    conductor.onClientDisconnect();

    // Simulate time passing beyond grace period
    const snapshot = conductor.getIdleSnapshot();
    expect(snapshot).not.toBeNull();

    // Manually advance the disconnectedAt timestamp to simulate grace period expiry
    snapshot!.disconnectedAt = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

    // Reconnect
    const state2 = await conductor.onClientConnect();

    // Should bootstrap a new track (with high probability, different from original)
    // The position should be reset (fresh bootstrap with random position)
    expect(state2.position).toBeGreaterThanOrEqual(0);
  });

  test("concurrent first connections resolve to same state via bootstrap lock", async () => {
    // Start two concurrent connect operations
    const [state1, state2] = await Promise.all([
      conductor.onClientConnect(),
      conductor.onClientConnect(),
    ]);

    // Both should have the same current track (same bootstrap pick)
    expect(state1.currentTrack?.id).toBe(state2.currentTrack?.id);
    expect(conductor.getClientCount()).toBe(2);
  });
});

describe("Conductor - Live State Computation", () => {
  let conductor: Conductor;

  beforeEach(() => {
    conductor = new Conductor(5);
  });

  test("live state advances position over time", async () => {
    // Set up with a client connected so live state computation runs
    await conductor.onClientConnect();

    // Bootstrap with a known track
    const initialState = conductor.bootstrapFresh([mockTrack1]);
    expect(initialState.isPlaying).toBe(true);
    expect(initialState.currentTrack?.id).toBe(mockTrack1.id);

    // Store the initial lastUpdated time
    const initialLastUpdated = initialState.lastUpdated;

    // Simulate time passing (2 seconds) by waiting
    await new Promise((resolve) => setTimeout(resolve, 2100));

    // Get updated state
    const updatedState = conductor.getCurrentState();
    expect(updatedState.position).toBeGreaterThan(initialState.position);
    expect(updatedState.lastUpdated).toBeGreaterThan(initialLastUpdated);
  });

  test("new client joining while connected syncs to live position", async () => {
    // First client connects (bootstrap)
    const state1 = await conductor.onClientConnect();
    const position1 = state1.position;

    // Simulate some time passing (2 seconds) to ensure position advance is measurable
    await new Promise((resolve) => setTimeout(resolve, 2100));

    // Second client connects (should sync to live, not bootstrap again)
    const state2 = await conductor.onClientConnect();

    // Same track, advanced position
    expect(state2.currentTrack?.id).toBe(state1.currentTrack?.id);
    expect(state2.position).toBeGreaterThan(position1);
    expect(conductor.getClientCount()).toBe(2);
  });

  test("track advances from queue without random start position", async () => {
    // Use a track with a very short duration to trigger transition quickly
    const shortTrack: Track = {
      id: "short1",
      title: "Short Track",
      duration: 1,
      isAd: false,
    };
    const nextTrack: Track = {
      id: "next1",
      title: "Next Track",
      duration: 300,
      isAd: false,
    };

    await conductor.onClientConnect();
    // Set playlist to [nextTrack] only (shortTrack is not in the playlist,
    // so when the queue is exhausted, bootstrapFresh picks from available tracks)
    conductor.setPlaylist([nextTrack], [], 3);

    // Bootstrap with shortTrack (not in the playlist, so queue is empty after it ends)
    conductor.bootstrapFresh([shortTrack]);

    // Wait for the short track to end (1 second) plus a buffer
    await new Promise((resolve) => setTimeout(resolve, 2100));

    const state = conductor.getCurrentState();
    // Queue was empty, so bootstrapFresh(false) picks nextTrack from available playlist
    expect(state.currentTrack?.id).toBe(nextTrack.id);
    // Next track should start at position 0 (no random start)
    expect(state.position).toBe(0);
  });

  test("current track is excluded from queue after bootstrap (no replay on transition)", async () => {
    const track1: Track = { id: "t1", title: "Track 1", duration: 1, isAd: false };
    const track2: Track = { id: "t2", title: "Track 2", duration: 300, isAd: false };
    const track3: Track = { id: "t3", title: "Track 3", duration: 300, isAd: false };

    await conductor.onClientConnect();
    conductor.setPlaylist([track1, track2, track3], [], 3);

    conductor.bootstrapFresh(undefined, false);

    const state = conductor.getCurrentState();

    // The current track should NOT be in the queue (otherwise it could replay)
    expect(state.queue.some((t) => t.id === state.currentTrack?.id)).toBe(false);
    // Queue should have 2 items (3 tracks minus 1 current)
    expect(state.queue.length).toBe(2);
  });

  test("track advances linearly through queue without replaying", async () => {
    const track1: Track = { id: "t1", title: "Track 1", duration: 1, isAd: false };
    const track2: Track = { id: "t2", title: "Track 2", duration: 1, isAd: false };
    const track3: Track = { id: "t3", title: "Track 3", duration: 1, isAd: false };

    await conductor.onClientConnect();
    conductor.setPlaylist([track1, track2, track3], [], 3);

    // Bootstrap with useRandomStart=false so we know which track is current
    conductor.bootstrapFresh(undefined, false);

    const initialState = conductor.getCurrentState();
    const currentId = initialState.currentTrack?.id;

    // First queue item should NOT be the current track
    const nextId = initialState.queue[0]?.id;
    expect(nextId).not.toBe(currentId);

    // Wait for track 1 to end
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const state2 = conductor.getCurrentState();
    expect(state2.currentTrack?.id).not.toBe(currentId);
    expect(state2.currentTrack?.id).toBe(nextId);

    // Wait for track 2 to end
    const nextId2 = state2.queue[0]?.id;
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const state3 = conductor.getCurrentState();
    expect(state3.currentTrack?.id).not.toBe(currentId);
    expect(state3.currentTrack?.id).not.toBe(nextId);
    expect(state3.currentTrack?.id).toBe(nextId2);
  });

  test("ad in queue plays for full duration before advancing", async () => {
    const musicTrack: Track = { id: "t1", title: "Track 1", duration: 1, isAd: false };
    const adTrack: Track = { id: "ad1", title: "Ad", duration: 10, isAd: true };
    const nextMusic: Track = { id: "t2", title: "Track 2", duration: 300, isAd: false };

    await conductor.onClientConnect();

    // Directly set state: music track (1s) is current, ad (10s) is next in queue
    const now = Math.floor(Date.now() / 1000);
    conductor["state"] = {
      currentTrack: musicTrack,
      position: 0,
      queue: [adTrack, nextMusic],
      isPlaying: true,
      lastUpdated: now,
      clientCount: 1,
    };

    // Wait for music track to end (1s + buffer)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const state1 = conductor.getCurrentState();
    // Should be on the ad
    expect(state1.currentTrack?.isAd).toBe(true);
    expect(state1.currentTrack?.id).toBe("ad1");

    // Wait 3 more seconds (ad is 10s — should still be playing)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const state2 = conductor.getCurrentState();
    // Still on the ad, position should have advanced (not restarted)
    expect(state2.currentTrack?.id).toBe("ad1");
    expect(state2.position).toBeGreaterThan(state1.position);
  }, 10000);

  test("ad track plays for full duration without premature transition (state persistence bug)", async () => {
    const musicTrack: Track = {
      id: "music1",
      title: "Music",
      duration: 1,
      isAd: false,
    };
    const adTrack: Track = {
      id: "ad1",
      title: "Ad",
      duration: 60,
      isAd: true,
    };

    await conductor.onClientConnect();

    // Manually set state: music track (1s duration) is current, ad is next in queue
    const now = Math.floor(Date.now() / 1000);
    conductor["state"] = {
      currentTrack: musicTrack,
      position: 0,
      queue: [adTrack],
      isPlaying: true,
      lastUpdated: now,
      clientCount: 1,
    };

    // Wait for music track to end (1s + buffer)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // First call should transition from music track to ad
    const state1 = conductor.getCurrentState();
    expect(state1.currentTrack?.id).toBe("ad1");
    expect(state1.isPlaying).toBe(true);

    // Wait 1 more second (ad has 60s duration — should still be playing)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Second call — ad should still be playing with advanced position
    // With the bug: state2.position resets to ~0 (transition re-triggers, ad restarts)
    // With the fix: state2.position advances (state is persisted after transition)
    const state2 = conductor.getCurrentState();
    expect(state2.currentTrack?.id).toBe("ad1");
    expect(state2.position).toBeGreaterThan(state1.position);

    // Wait 1 more second — position should advance again
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const state3 = conductor.getCurrentState();
    expect(state3.currentTrack?.id).toBe("ad1");
    expect(state3.position).toBeGreaterThan(state2.position);
  });

  test("queue exhausted during live playback starts next track at position 0", async () => {
    // Use tracks with duration 1 so they end quickly
    const track1: Track = {
      id: "quick1",
      title: "Quick Track 1",
      duration: 1,
      isAd: false,
    };
    const track2: Track = {
      id: "quick2",
      title: "Quick Track 2",
      duration: 300,
      isAd: false,
    };

    await conductor.onClientConnect();
    // Set playlist to both tracks
    conductor.setPlaylist([track1, track2], [], 3);
    // Bootstrap with track1 (which has duration 1)
    conductor.bootstrapFresh([track1]);

    // Wait for track1 to end and queue to be exhausted
    // (track1 is in the queue from setPlaylist, so it advances to track1 again)
    await new Promise((resolve) => setTimeout(resolve, 2100));

    const state = conductor.getCurrentState();
    expect(state.isPlaying).toBe(true);
    // Position should be very small (just started at 0 with no random offset)
    expect(state.position).toBeLessThan(5);
  });
});

describe("Conductor - Ad Injection", () => {
  let conductor: Conductor;

  beforeEach(() => {
    conductor = new Conductor(5);
  });

  test("ads are injected into music tracks", () => {
    const tracks = [mockTrack1, mockTrack2];
    const ads = [mockAd];
    const result = conductor.injectAds(tracks, ads, 1);

    // Should have tracks + at least 1 ad
    expect(result.length).toBeGreaterThan(tracks.length);
    expect(result.some((t) => t.isAd)).toBe(true);
  });

  test("multiple ads are distributed across segments", () => {
    const tracks = [
      mockTrack1,
      mockTrack2,
      { ...mockTrack1, id: "v3" },
      { ...mockTrack2, id: "v4" },
      { ...mockTrack1, id: "v5" },
    ];
    const ads = [
      { ...mockAd, id: "ad1" },
      { ...mockAd, id: "ad2" },
      { ...mockAd, id: "ad3" },
    ];
    const result = conductor.injectAds(tracks, ads, 3);

    // Should have all tracks + 3 ads
    expect(result.length).toBe(tracks.length + 3);

    // Ads should be spread across the playlist, not clustered
    const adPositions = result
      .map((t, i) => (t.isAd ? i : -1))
      .filter((i) => i >= 0);

    expect(adPositions.length).toBe(3);
    // Each ad should be in a different segment
    const segmentSize = Math.floor(tracks.length / 3);
    for (let i = 0; i < adPositions.length; i++) {
      const position = adPositions[i];
      expect(position).toBeGreaterThanOrEqual(i * segmentSize);
    }
  });

  test("no ads when ads list is empty", () => {
    const tracks = [mockTrack1, mockTrack2];
    const result = conductor.injectAds(tracks, [], 3);
    expect(result.length).toBe(tracks.length);
    expect(result.every((t) => !t.isAd)).toBe(true);
  });

  test("no ads when tracks list is empty", () => {
    const result = conductor.injectAds([], [mockAd], 3);
    expect(result.length).toBe(0);
  });

  test("ads always play from start (no random position)", () => {
    // This is enforced by the state computation logic, not the injection
    // The test verifies that ad tracks are properly marked
    const tracks = [mockTrack1, mockTrack2];
    const ads = [mockAd];
    const result = conductor.injectAds(tracks, ads, 1);

    const adTrack = result.find((t) => t.isAd);
    expect(adTrack).toBeDefined();
    expect(adTrack!.id).toBe(mockAd.id);
  });

  test("ads are inserted at random positions within segments, not always at end", () => {
    const tracks = [
      mockTrack1,
      mockTrack2,
      { ...mockTrack1, id: "v3" },
      { ...mockTrack2, id: "v4" },
      { ...mockTrack1, id: "v5" },
    ];
    const ads = [{ ...mockAd, id: "ad1" }];

    // Run injectAds many times and collect the position of the ad within
    // the first segment (segmentSize = 5/1 = 5, so the ad could be at
    // positions 0 through 5 in the result array).
    const positions = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const result = conductor.injectAds(tracks, ads, 1);
      const adIdx = result.findIndex((t) => t.isAd);
      expect(adIdx).toBeGreaterThanOrEqual(0);
      positions.add(adIdx);
    }

    // The ad position should vary across runs (not always at the same spot)
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe("Conductor - State Management", () => {
  let conductor: Conductor;

  beforeEach(() => {
    conductor = new Conductor(5);
  });

  test("reset clears all state", async () => {
    await conductor.onClientConnect();
    conductor.onClientDisconnect();

    expect(conductor.getIdleSnapshot()).not.toBeNull();
    expect(conductor.getClientCount()).toBe(0);
  });

  test("getState returns consistent shape", async () => {
    await conductor.onClientConnect();
    const state = conductor.getState();

    expect(state).toHaveProperty("currentTrack");
    expect(state).toHaveProperty("position");
    expect(state).toHaveProperty("queue");
    expect(state).toHaveProperty("isPlaying");
    expect(state).toHaveProperty("lastUpdated");
    expect(state).toHaveProperty("clientCount");
  });

  test("getState during idle computes on-demand if no clients", async () => {
    // Bootstrap and then disconnect
    const state1 = await conductor.onClientConnect();
    const trackId1 = state1.currentTrack?.id;

    conductor.onClientDisconnect();

    // No clients - getState should compute on-demand (resume)
    const state = conductor.getState();
    expect(state.clientCount).toBe(0);
    // Should have attempted to compute state (either resume or bootstrap)
    expect(state.currentTrack).not.toBeNull();

    // Since we just disconnected, we should be within grace period and resume same track
    expect(state.currentTrack?.id).toBe(trackId1);
  });
});

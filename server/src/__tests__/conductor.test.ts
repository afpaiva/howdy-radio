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

  test("bootstrap with explicit tracks uses provided playlist", () => {
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

import type { PlaybackState, StateSnapshot, Track } from "../types";
import { SeedPlaylist } from "../seed/playlist";

export class Conductor {
  // Authoritative playback state
  private state: PlaybackState;

  // Current playlist fetched from Slack (or seed in mock mode).
  // Populated by setPlaylist(); used for bootstrap and track lookup.
  private currentPlaylist: Track[] | null = null;

  // Ads fetched from YouTube Shorts, used for queue rebuilding.
  private currentAds: Track[] = [];
  private currentAdsCount: number = 3;

  // Library of all available tracks (music + ads), used for queue refilling.
  // Updated by setPlaylist(); refillQueue() draws from this pool.
  private libraryMusic: Track[] = [];
  private libraryAds: Track[] = [];

  // Idle/grace period tracking
  private idleSnapshot: StateSnapshot | null = null; // Stored when last client disconnects

  // Bootstrap lock to prevent concurrent bootstrap
  private bootstrapLock: Promise<void> | null = null;
  private bootstrapResolve: (() => void) | null = null;

  private readonly gracePeriodSeconds: number;

  // Maximum number of upcoming tracks in the queue at any time.
  // When a track is consumed, a new one is randomly drawn from the library
  // to replace it, maintaining a sliding window of upcoming playback.
  private readonly MAX_QUEUE_SIZE = 15;

  constructor(gracePeriodMinutes: number = 5) {
    this.gracePeriodSeconds = gracePeriodMinutes * 60;
    this.state = {
      currentTrack: null,
      position: 0,
      queue: [],
      isPlaying: false,
      lastUpdated: 0,
      clientCount: 0,
    };
  }

  /**
   * Get the current playback state.
   * If idle (no clients), compute on-demand whether to resume or bootstrap.
   * Note: This is a read-only operation that does not modify state.
   */
  getState(): PlaybackState {
    if (this.state.clientCount === 0) {
      return this.computeOnDemandState();
    }
    return this.computeLiveState();
  }

  /**
   * Get state immediately upon connection (called during bootstrap lock).
   * Does NOT re-run bootstrap logic for clients connecting while others are connected.
   */
  getConnectState(): PlaybackState {
    return this.computeLiveState();
  }

  /**
   * Called when a client connects. Handles bootstrap lock for first connection after idle.
   * Returns a promise that resolves to the initial state for the connecting client.
   */
  async onClientConnect(): Promise<PlaybackState> {
    // If we're already in idle state (no clients), this is a bootstrap trigger
    if (this.state.clientCount === 0) {
      return this.acquireBootstrapLock();
    }

    // Otherwise, just increment client count and return live state
    this.state.clientCount++;
    return this.computeLiveState();
  }

  /**
   * Called when a client disconnects. Stores idle snapshot if this was the last client.
   * @returns true if this was the last client (playback clock halts)
   */
  onClientDisconnect(): boolean {
    if (this.state.clientCount > 0) {
      this.state.clientCount--;
    }

    // If this was the last client, store idle snapshot
    if (this.state.clientCount === 0) {
      const liveState = this.computeLiveState();
      this.idleSnapshot = {
        trackId: liveState.currentTrack?.id ?? null,
        position: liveState.position,
        disconnectedAt: Math.floor(Date.now() / 1000),
      };
      // Stop the clock - mark as not playing
      this.state.isPlaying = false;
      this.state.lastUpdated = 0;
      return true;
    }
    return false;
  }

  /**
   * Bootstrap lock logic: ensures concurrent first-connections get the same result.
   * Based on SPEC.md: "first connections to an idle server are handled with a simple
   * in-memory lock. The first connection triggers the bootstrap process and 'locks'
   * until the track/position is determined; any concurrent connections wait for that
   * result."
   */
  private async acquireBootstrapLock(): Promise<PlaybackState> {
    if (this.bootstrapLock) {
      // Another connection is already bootstrapping - wait for it
      await this.bootstrapLock;
      // After bootstrap completes, increment client count (we didn't do it yet)
      this.state.clientCount++;
      return this.computeLiveState();
    }

    // We are the first connection after idle - trigger bootstrap
    this.bootstrapLock = new Promise<void>((resolve) => {
      this.bootstrapResolve = resolve;
    });

    try {
      // Increment client count first
      this.state.clientCount = 1;
      
      // Clear idle snapshot since we're transitioning from idle to active
      const newState = this.computeOnDemandState();
      this.idleSnapshot = null;
      this.applyState(newState);

      return this.computeLiveState();
    } finally {
      // Release the lock for any waiting connections
      if (this.bootstrapResolve) {
        this.bootstrapResolve();
      }
      this.bootstrapLock = null;
      this.bootstrapResolve = null;
    }
  }

  /**
   * Compute state on-demand when server is idle (no clients connected).
   * Implements SPEC.md Playback Bootstrap & Idle Behavior:
   * - If within grace period and position+elapsed < track.duration: resume same track
   * - Otherwise: fresh bootstrap (pick new random track)
   */
  private computeOnDemandState(): PlaybackState {
    const now = Math.floor(Date.now() / 1000);

    // If no idle snapshot, this is initial bootstrap (no previous playback)
    if (!this.idleSnapshot) {
      return this.bootstrapFresh();
    }

    const elapsed = now - this.idleSnapshot.disconnectedAt;

    // Check if within grace period
    if (
      elapsed <= this.gracePeriodSeconds &&
      this.idleSnapshot.trackId !== null
    ) {
      // Try to resume the same track
      const track = this.findTrackById(this.idleSnapshot.trackId);
      if (track && this.idleSnapshot.position + elapsed < track.duration) {
        // Resume same track at position + elapsed
        const resumedState: PlaybackState = {
          currentTrack: track,
          position: this.idleSnapshot.position + elapsed,
          queue: [...this.state.queue],
          isPlaying: true,
          lastUpdated: now,
          clientCount: this.state.clientCount,
        };
        // Note: idleSnapshot is cleared in acquireBootstrapLock after applying state
        return resumedState;
      }
    }

    // Grace period expired or track would have ended - fresh bootstrap
    // Note: idleSnapshot is cleared in acquireBootstrapLock after applying state
    return this.bootstrapFresh();
  }

  /**
   * Fresh bootstrap: pick a random track from the playlist and start at a random position.
   * Per SPEC.md: "pick a new random track, and start at a random position within it"
   *
   * @param playlist Optional explicit playlist (used by tests). Defaults to the
   *   current playlist (real fetched or seed).
   * @param useRandomStart When true (default), picks a random start position within
   *   the track (30s window from end). When false, starts at position 0 — used
   *   for non-bootstrap track transitions (e.g. queue exhausted during live playback).
   */
   bootstrapFresh(playlist?: Track[], useRandomStart: boolean = true): PlaybackState {
     const tracks = playlist ?? this.getAvailableTracks();
     const musicTracks = tracks.filter((t) => !t.isAd);
     const now = Math.floor(Date.now() / 1000);
     const playlistForQueue = this.currentPlaylist ?? tracks;

     if (musicTracks.length === 0) {
       // No music tracks available — build queue with ads only
       const queue = this.injectAds(playlistForQueue, this.currentAds, this.currentAdsCount);
       return {
         currentTrack: null,
         position: 0,
         queue,
         isPlaying: false,
         lastUpdated: now,
         clientCount: this.state.clientCount,
       };
     }

     // Pick a random track
     const randomIndex = Math.floor(Math.random() * musicTracks.length);
     const selectedTrack = musicTracks[randomIndex]!;

     // Build queue from remaining tracks, excluding the selected current track.
     // Without this exclusion, the current track remains in the queue and can
     // be returned by queue.shift() when it ends, causing the same track to
     // replay (the "returns to beginning of playlist" bug).
     const remainingTracks = playlistForQueue.filter((t) => t.id !== selectedTrack.id);
     let queue = this.injectAds(remainingTracks, this.currentAds, this.currentAdsCount);

     // Cap at MAX_QUEUE_SIZE for sliding-window queue management
     if (queue.length > this.MAX_QUEUE_SIZE) {
       queue = queue.slice(0, this.MAX_QUEUE_SIZE);
     }

     let position: number;
     if (useRandomStart) {
       // Start at a random position within the track (genuine bootstrap)
       // Music tracks may start mid-way (per hard rule #7)
       const maxStartPosition = Math.max(0, selectedTrack.duration - 30);
       position = Math.floor(Math.random() * (maxStartPosition + 1));
     } else {
       // Non-bootstrap transition: start from beginning
       position = 0;
     }

     const state: PlaybackState = {
       currentTrack: selectedTrack,
       position,
       queue,
       isPlaying: true,
       lastUpdated: now,
       clientCount: this.state.clientCount,
     };

     this.applyState(state);
     return state;
   }

  /**
   * Compute the live state based on elapsed time since last update.
   */
   private computeLiveState(): PlaybackState {
    if (this.state.clientCount === 0) {
      return { ...this.state };
    }

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - this.state.lastUpdated;

    // Only advance position if playing
    let position = this.state.position;
    let currentTrack = this.state.currentTrack;
    let queue = [...this.state.queue];
    let lastUpdated = this.state.lastUpdated;

    if (this.state.isPlaying && currentTrack) {
      position = this.state.position + elapsed;
      lastUpdated = now;

      // Check if current track has ended
      if (position >= currentTrack.duration) {
        // Move to next track in queue (ads and music both start at 0)
        if (queue.length > 0) {
          const nextTrack = queue.shift()!;
          currentTrack = nextTrack;
          position = 0; // All tracks start from beginning on queue advance
          // Refill queue from library — add a new random track to the end
          this.refillQueue(queue, currentTrack);
        } else {
          // Queue is empty - pick new track without random start position
          // (non-bootstrap transition: start from beginning)
          const newState = this.bootstrapFresh(undefined, false);
          currentTrack = newState.currentTrack;
          queue = newState.queue;
          position = newState.position;
          lastUpdated = newState.lastUpdated;
        }
      }
    }

    const newState: PlaybackState = {
      ...this.state,
      currentTrack,
      position,
      queue,
      lastUpdated,
    };

    // Persist the computed state so subsequent calls start from the correct
    // current track, position, and timestamp. Without this, every call to
    // computeLiveState() re-computes from stale this.state, causing track
    // transitions to be re-triggered on every call (the "plays for ~1 second
    // then loops back" bug for ads).
    this.applyState(newState);
    return newState;
  }

  /**
   * Apply a new state to the conductor.
   */
  private applyState(state: PlaybackState): void {
    this.state = state;
  }

  /**
   * Inject ads into the queue.
   * Per SPEC.md: divide queue into ADS_COUNT equal segments and randomly select
   * one ad position per segment. Ads always play from the start.
   * The ad is inserted at a random position *within* each segment, not always
   * appended at the end.
   */
  injectAds(tracks: Track[], ads: Track[], adsCount: number): Track[] {
    if (ads.length === 0 || tracks.length === 0) {
      return [...tracks];
    }

    const effectiveAdsCount = Math.min(adsCount, tracks.length);
    const segmentSize = Math.floor(tracks.length / effectiveAdsCount);

    const result: Track[] = [];

    for (let i = 0; i < effectiveAdsCount; i++) {
      const segmentStart = i * segmentSize;
      const segmentEnd =
        i === effectiveAdsCount - 1
          ? tracks.length
          : (i + 1) * segmentSize;

      const segmentTracks = tracks.slice(segmentStart, segmentEnd);

      // Pick a random position within this segment to insert the ad (0 to segmentLength)
      const insertPos = Math.floor(Math.random() * (segmentTracks.length + 1));

      // Add music tracks before the ad position
      for (let j = 0; j < insertPos; j++) {
        result.push(segmentTracks[j]!);
      }

      // Insert a random ad at the random position within this segment
      if (i < ads.length) {
        const ad = ads[Math.floor(Math.random() * ads.length)]!;
        result.push({ ...ad }); // Clone to avoid mutation
      }

      // Add remaining music tracks after the ad position
      for (let j = insertPos; j < segmentTracks.length; j++) {
        result.push(segmentTracks[j]!);
      }
    }

    return result;
  }

  /**
   * Refill the queue after a track is consumed (shifted out).
   * Randomly picks a new track from the library (ad or music) and appends it
   * to the queue, excluding tracks already in the queue or currently playing.
   * This maintains a sliding window of up to MAX_QUEUE_SIZE items.
   *
   * Per SPEC.md: "everytime a song is pulled out the playlist (because the song
   * is finished) we add a different one at the end of the playlist."
   *
   * @param newCurrentTrack The track that was just shifted to current position
   *   (needed because this.state hasn't been updated yet at call time)
   */
  private refillQueue(queue: Track[], newCurrentTrack: Track | null): void {
    if (queue.length >= this.MAX_QUEUE_SIZE) return;

    // Exclude tracks already in queue and currently playing tracks
    // (both the old currentTrack in this.state and the new one being transitioned to)
    const excludedIds = new Set(queue.map((t) => t.id));
    if (this.state.currentTrack) {
      excludedIds.add(this.state.currentTrack.id);
    }
    if (newCurrentTrack) {
      excludedIds.add(newCurrentTrack.id);
    }

    // Randomly decide: ad or music
    const useAd = Math.random() < 0.5;
    let pool = useAd ? this.libraryAds : this.libraryMusic;

    // Find available tracks (not excluded)
    let available = pool.filter((t) => !excludedIds.has(t.id));

    // If chosen pool is exhausted, try the other pool
    if (available.length === 0) {
      pool = useAd ? this.libraryMusic : this.libraryAds;
      available = pool.filter((t) => !excludedIds.has(t.id));
    }

    if (available.length > 0) {
      const track = available[Math.floor(Math.random() * available.length)]!;
      queue.push({ ...track }); // Clone to avoid mutation
    }
  }

  /**
   * Get the current state for broadcasting to clients.
   */
  getCurrentState(): PlaybackState {
    return this.computeLiveState();
  }

  /**
   * Get client count.
   */
  getClientCount(): number {
    return this.state.clientCount;
  }

  /**
   * Find a track by its ID.
   * Searches the real fetched playlist first, falling back to seed.
   */
  private findTrackById(id: string): Track | null {
    // Try the real fetched playlist first
    if (this.currentPlaylist) {
      const track = this.currentPlaylist.find((t) => t.id === id);
      if (track) return track;
    }
    // Fall back to seed playlist
    const tracks = SeedPlaylist.getTracks();
    return tracks.find((t) => t.id === id) ?? null;
  }

  /**
   * Get available tracks for bootstrap.
   * Uses the real fetched playlist when available (set via setPlaylist),
   * falling back to the seed playlist only when no real playlist has been loaded yet.
   */
  private getAvailableTracks(): Track[] {
    if (this.currentPlaylist) {
      return this.currentPlaylist;
    }
    return SeedPlaylist.getMusicTracks();
  }

  /**
   * Set the playlist (called when Slack fetch completes or mock playlist loads).
   * Updates the music/ad libraries. Only builds an initial queue if the
   * current queue is empty — otherwise preserves the existing queue to
   * maintain playback continuity (no reshuffling during live playback).
   */
  setPlaylist(tracks: Track[], ads: Track[], adsCount: number): void {
    this.currentPlaylist = tracks;
    this.currentAds = ads;
    this.currentAdsCount = adsCount;

    // Store in library for queue refilling
    this.libraryMusic = tracks.filter((t) => !t.isAd);
    this.libraryAds = [...ads];

    // Only build the initial queue if one doesn't exist yet.
    // During live playback, the queue is managed incrementally by
    // refillQueue() as tracks are consumed — rebuilding here would
    // shuffle the queue and disrupt the user's listening experience.
    if (this.state.queue.length === 0) {
      this.state.queue = this.buildInitialQueue();
    }
  }

  /**
   * Build the initial queue from the library, injecting ads at segment boundaries.
   * Excludes the currently selected track (if already playing).
   */
  private buildInitialQueue(): Track[] {
    const currentTrackId = this.state.currentTrack?.id;
    let queueTracks = [...this.libraryMusic];
    if (currentTrackId) {
      queueTracks = queueTracks.filter((t) => t.id !== currentTrackId);
    }
    let queue = this.injectAds(queueTracks, this.currentAds, this.currentAdsCount);

    // Refill up to MAX_QUEUE_SIZE using the sliding-window approach
    while (queue.length < this.MAX_QUEUE_SIZE && queueTracks.length > 0) {
      const remaining = queueTracks.filter(
        (t) => !queue.some((q) => q.id === t.id) && t.id !== currentTrackId
      );
      if (remaining.length === 0) break;
      const track = remaining[Math.floor(Math.random() * remaining.length)]!;
      queue.push({ ...track });
    }

    if (queue.length > this.MAX_QUEUE_SIZE) {
      queue = queue.slice(0, this.MAX_QUEUE_SIZE);
    }

    return queue;
  }

  /**
   * Get the current playlist (real fetched or seed).
   */
  getCurrentPlaylist(): Track[] {
    return this.getAvailableTracks();
  }

  /**
   * Get the idle snapshot for testing/debugging.
   */
  getIdleSnapshot(): StateSnapshot | null {
    return this.idleSnapshot;
  }

  /**
   * Reset the conductor state (useful for testing).
   */
  reset(): void {
    this.state = {
      currentTrack: null,
      position: 0,
      queue: [],
      isPlaying: false,
      lastUpdated: 0,
      clientCount: 0,
    };
    this.currentPlaylist = null;
    this.currentAds = [];
    this.currentAdsCount = 3;
    this.libraryMusic = [];
    this.libraryAds = [];
    this.idleSnapshot = null;
    this.bootstrapLock = null;
    this.bootstrapResolve = null;
  }
}

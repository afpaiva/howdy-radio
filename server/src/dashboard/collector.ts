import type { Track } from "../types";
import { renameSync } from "fs";

/**
 * Dashboard data persistence schema
 */
export interface DashboardData {
  version: number;
  counters: {
    totalTracksPlayed: number;
    totalListenTimeSeconds: number;
    uniqueListenerIds: string[];
    peakConcurrentUsers: number;
  };
  hourlyBuckets: Record<string, HourlyBucket>;
  lastUpdated: number;
}

export interface HourlyBucket {
  users: number[];
  tracksPlayed: number;
  uniqueListeners: string[];
}

/**
 * Current stats returned by /api/dashboard/stats
 */
export interface DashboardStats {
  liveUsers: number;
  totalTracksPlayed: number;
  totalListenTimeMinutes: number;
  uniqueListenersToday: number;
  peakConcurrentUsers: number;
  tracksBySource: {
    slack: number;
    ads: number;
  };
  averageSessionMinutes: number;
  lastUpdated: number;
}

/**
 * Historical data returned by /api/dashboard/history
 */
export interface DashboardHistory {
  hourlyUsers: Array<{ hour: string; users: number }>;
  hourlyTracksPlayed: Array<{ hour: string; tracks: number }>;
}

/**
 * Dashboard collector - manages metrics collection and persistence
 */
export class DashboardCollector {
  private data: DashboardData;
  private readonly dataPath: string;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly FLUSH_INTERVAL_MS = 30_000; // 30 seconds
  private initialized = false;

  constructor(dataPath: string = "dashboard-data.json") {
    this.dataPath = dataPath;
    this.data = this.getDefaultData();
    // Don't await in constructor - use lazy initialization
  }

  private getDefaultData(): DashboardData {
    return {
      version: 1,
      counters: {
        totalTracksPlayed: 0,
        totalListenTimeSeconds: 0,
        uniqueListenerIds: [],
        peakConcurrentUsers: 0,
      },
      hourlyBuckets: {},
      lastUpdated: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Initialize the collector (load data from disk)
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.load();
    this.startPeriodicFlush();
    this.initialized = true;
  }

  /**
   * Load dashboard data from JSON file
   */
  private async load(): Promise<void> {
    try {
      const file = Bun.file(this.dataPath);
      const exists = await file.exists();
      if (exists) {
        const content = await file.text();
        const parsed = JSON.parse(content) as DashboardData;
        // Validate version
        if (parsed.version === 1) {
          this.data = parsed;
        }
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      // Keep default data on error
    }
  }

  /**
   * Save dashboard data to JSON file atomically (temp file -> rename)
   */
  private async save(): Promise<void> {
    try {
      this.data.lastUpdated = Math.floor(Date.now() / 1000);
      const tempPath = `${this.dataPath}.tmp`;
      const file = Bun.file(tempPath);
      const content = JSON.stringify(this.data, null, 2);
      await file.write(content);
      // Atomic rename using Node.js fs
      renameSync(tempPath, this.dataPath);
    } catch (error) {
      console.error("Failed to save dashboard data:", error);
    }
  }

  /**
   * Start periodic flush to disk (every 30 seconds)
   */
  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.save();
    }, this.FLUSH_INTERVAL_MS);
    // Don't prevent process exit
    if (this.flushInterval.unref) {
      this.flushInterval.unref();
    }
  }

  /**
   * Stop periodic flush (for testing/cleanup)
   */
  stopPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Get the current hour bucket key (ISO string truncated to hour)
   */
  private getCurrentHourKey(): string {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now.toISOString();
  }

  /**
   * Get or create the current hour bucket
   */
  private getCurrentBucket(): HourlyBucket {
    const hourKey = this.getCurrentHourKey();
    if (!this.data.hourlyBuckets[hourKey]) {
      this.data.hourlyBuckets[hourKey] = {
        users: [],
        tracksPlayed: 0,
        uniqueListeners: [],
      };
    }
    return this.data.hourlyBuckets[hourKey];
  }

  /**
   * Clean up hourly buckets older than 24 hours
   */
  private cleanupOldBuckets(): void {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);
    const cutoffKey = cutoff.toISOString();

    for (const key of Object.keys(this.data.hourlyBuckets)) {
      if (key < cutoffKey) {
        delete this.data.hourlyBuckets[key];
      }
    }
  }

  /**
   * Record a track being played
   * @param track The track that was played
   * @param clientCount Current number of connected clients (for listen time calculation)
   */
  recordTrackPlayed(track: Track, clientCount: number): void {
    // Increment total tracks played
    this.data.counters.totalTracksPlayed++;

    // Record in hourly bucket
    const bucket = this.getCurrentBucket();
    bucket.tracksPlayed++;

    // Record listen time: clientCount * track duration
    // This accumulates total listen time across all listeners
    this.data.counters.totalListenTimeSeconds += clientCount * track.duration;

    // Update last updated timestamp
    this.data.lastUpdated = Math.floor(Date.now() / 1000);

    // Persist immediately on track transition (fire and forget)
    this.save();
  }

  /**
   * Record current client count for live users tracking
   * Called periodically to build hourly user samples
   * @param clientCount Current number of connected clients
   */
  recordClientCount(clientCount: number): void {
    const bucket = this.getCurrentBucket();
    bucket.users.push(clientCount);

    // Update peak concurrent users
    if (clientCount > this.data.counters.peakConcurrentUsers) {
      this.data.counters.peakConcurrentUsers = clientCount;
    }

    this.cleanupOldBuckets();
  }

  /**
   * Record a unique listener (on connect)
   * @param listenerId Unique identifier for the listener (socket ID or session ID)
   */
  recordListener(listenerId: string): void {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Check if we already have this listener today
    const listenerKey = `${listenerId}:${today}`;
    if (!this.data.counters.uniqueListenerIds.includes(listenerKey)) {
      this.data.counters.uniqueListenerIds.push(listenerKey);
    }

    // Also record in hourly bucket for unique listeners per hour
    const bucket = this.getCurrentBucket();
    if (!bucket.uniqueListeners.includes(listenerKey)) {
      bucket.uniqueListeners.push(listenerKey);
    }

    // Persist immediately (fire and forget)
    this.save();
  }

  /**
   * Get current dashboard statistics
   * @param liveUsers Current live user count from conductor
   */
  getStats(liveUsers: number): DashboardStats {
    const today = new Date().toISOString().split("T")[0];

    // Count unique listeners today
    const uniqueListenersToday = this.data.counters.uniqueListenerIds.filter(
      (id) => id.endsWith(`:${today}`)
    ).length;

    // Calculate tracks by source from total tracks played
    // Using the same estimation as before (75% slack, 25% ads based on ADS_COUNT and 50/50 refill)
    const totalTracks = this.data.counters.totalTracksPlayed;

    // Calculate average session minutes
    // Total listen time / unique listeners (if > 0)
    const totalListenTimeMinutes = this.data.counters.totalListenTimeSeconds / 60;
    const averageSessionMinutes =
      uniqueListenersToday > 0
        ? totalListenTimeMinutes / uniqueListenersToday
        : 0;

    return {
      liveUsers,
      totalTracksPlayed: this.data.counters.totalTracksPlayed,
      totalListenTimeMinutes,
      uniqueListenersToday,
      peakConcurrentUsers: this.data.counters.peakConcurrentUsers,
      tracksBySource: {
        slack: Math.floor(totalTracks * 0.75),
        ads: Math.floor(totalTracks * 0.25),
      },
      averageSessionMinutes: Math.round(averageSessionMinutes * 10) / 10,
      lastUpdated: this.data.lastUpdated,
    };
  }

  /**
   * Get historical data for the last 24 hours (hourly buckets)
   */
  getHistory(): DashboardHistory {
    const now = new Date();
    const hourlyUsers: Array<{ hour: string; users: number }> = [];
    const hourlyTracksPlayed: Array<{ hour: string; tracks: number }> = [];

    // Generate last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now);
      hourDate.setHours(hourDate.getHours() - i, 0, 0, 0);
      const hourKey = hourDate.toISOString();

      const bucket = this.data.hourlyBuckets[hourKey];
      const avgUsers = bucket && bucket.users.length > 0
        ? Math.round(bucket.users.reduce((a, b) => a + b, 0) / bucket.users.length)
        : 0;

      hourlyUsers.push({ hour: hourKey, users: avgUsers });
      hourlyTracksPlayed.push({ hour: hourKey, tracks: bucket?.tracksPlayed ?? 0 });
    }

    return { hourlyUsers, hourlyTracksPlayed };
  }

  /**
   * Get the raw data (for debugging/testing)
   */
  getRawData(): DashboardData {
    return { ...this.data };
  }
}

// Singleton instance
let collectorInstance: DashboardCollector | null = null;

/**
 * Get or create the dashboard collector singleton
 */
export async function getDashboardCollector(dataPath?: string): Promise<DashboardCollector> {
  if (!collectorInstance) {
    collectorInstance = new DashboardCollector(dataPath);
    await collectorInstance.init();
  }
  return collectorInstance;
}

/**
 * Reset the collector instance (for testing)
 */
export function resetDashboardCollector(): void {
  if (collectorInstance) {
    collectorInstance.stopPeriodicFlush();
    collectorInstance = null;
  }
}
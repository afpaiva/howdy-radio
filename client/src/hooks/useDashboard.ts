/**
 * /client/src/hooks/useDashboard.ts
 *
 * Hook for dashboard data fetching and real-time updates.
 *
 * - Polls /api/dashboard/stats every 30s for metrics
 * - Fetches /api/dashboard/history once for historical charts
 * - Uses usePlayback() for real-time live users (state.clientCount)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { usePlayback } from "../lib/websocket";

/** Shape of /api/dashboard/stats response */
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

/** Shape of /api/dashboard/history response */
export interface DashboardHistory {
  hourlyUsers: Array<{ hour: string; users: number }>;
  hourlyTracksPlayed: Array<{ hour: string; tracks: number }>;
}

/** Combined dashboard data returned by the hook */
export interface UseDashboardResult {
  stats: DashboardStats | null;
  history: DashboardHistory | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/** API base URL - uses VITE_WS_URL env var or defaults to same origin */
const API_BASE = (import.meta as any).env.VITE_WS_URL || "";

/** Fetch JSON with credentials */
async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export function useDashboard(): UseDashboardResult {
  const { state } = usePlayback();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [history, setHistory] = useState<DashboardHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  /** Fetch current stats */
  const fetchStats = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const data = await fetchJson<DashboardStats>("/api/dashboard/stats");
      if (isMountedRef.current) {
        setStats(data);
        setError(null);
      }
    } catch (e) {
      if (isMountedRef.current) {
        setError(e instanceof Error ? e.message : "Failed to fetch stats");
      }
    }
  }, []);

  /** Fetch historical data */
  const fetchHistory = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const data = await fetchJson<DashboardHistory>("/api/dashboard/history");
      if (isMountedRef.current) {
        setHistory(data);
      }
    } catch {
      // History is non-critical; silently fail
    }
  }, []);

  /** Initial load + setup polling */
  useEffect(() => {
    isMountedRef.current = true;
    setLoading(true);

    async function initialLoad() {
      await Promise.all([fetchStats(), fetchHistory()]);
      if (isMountedRef.current) {
        setLoading(false);
      }
    }

    initialLoad();

    // Poll stats every 30 seconds
    pollIntervalRef.current = window.setInterval(fetchStats, 30_000);

    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [fetchStats, fetchHistory]);

  /** Refetch both stats and history */
  const refetch = useCallback(async () => {
    await Promise.all([fetchStats(), fetchHistory()]);
  }, [fetchStats, fetchHistory]);

  /** Live users from WebSocket state (real-time, no polling needed) */
  const liveUsers = state?.clientCount ?? 0;

  /** Merge live users into stats for display */
  const displayStats = stats
    ? { ...stats, liveUsers }
    : null;

  return {
    stats: displayStats,
    history,
    loading,
    error,
    refetch,
  };
}
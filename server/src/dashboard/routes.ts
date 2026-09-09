import type { IncomingMessage, ServerResponse } from "http";
import { getDashboardCollector } from "./collector";

/**
 * Dashboard API routes
 * Handles GET /api/dashboard/stats and GET /api/dashboard/history
 *
 * CORS for cross-origin dev requests is handled centrally by the main
 * request handler in server/index.ts (handleRequest) — the same mechanism
 * used by /auth/* and /health. It sets Access-Control-Allow-Origin to the
 * actual request origin (not "*") plus Access-Control-Allow-Credentials:
 * true, and short-circuits OPTIONS preflight before routing.
 *
 * These handlers intentionally do NOT set their own CORS headers. Setting
 * Access-Control-Allow-Origin: "*" here would overwrite the centralized
 * handler's origin-based value, and "*" is rejected by the browser whenever
 * credentials are involved (the client sends credentials: "include").
 */

let collectorPromise: Promise<DashboardCollector> | null = null;

function getCollector(): Promise<DashboardCollector> {
  if (!collectorPromise) {
    collectorPromise = getDashboardCollector();
  }
  return collectorPromise;
}

export type DashboardCollector = Awaited<ReturnType<typeof getDashboardCollector>>;

/**
 * Handle GET /api/dashboard/stats
 * Returns current dashboard statistics
 */
export async function handleDashboardStats(
  req: IncomingMessage,
  res: ServerResponse,
  conductorClientCount: number
): Promise<void> {
  try {
    const collector = await getCollector();
    const stats = collector.getStats(conductorClientCount);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
  } catch (error) {
    console.error("Error in /api/dashboard/stats:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

/**
 * Handle GET /api/dashboard/history
 * Returns historical data for charts (last 24 hours, 1-hour buckets)
 */
export async function handleDashboardHistory(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const collector = await getCollector();
    const history = collector.getHistory();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(history));
  } catch (error) {
    console.error("Error in /api/dashboard/history:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

/**
 * Main dashboard routes handler
 * Mount at /api/dashboard/*
 */
export async function handleDashboardRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  conductorClientCount: number
): Promise<boolean> {
  const url = req.url || "";

  if (url === "/api/dashboard/stats" || url.startsWith("/api/dashboard/stats?")) {
    await handleDashboardStats(req, res, conductorClientCount);
    return true;
  }

  if (url === "/api/dashboard/history" || url.startsWith("/api/dashboard/history?")) {
    await handleDashboardHistory(req, res);
    return true;
  }

  return false;
}

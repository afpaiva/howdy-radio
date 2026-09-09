import type { IncomingMessage, ServerResponse } from "http";
import { getDashboardCollector } from "./collector";

/**
 * Dashboard API routes
 * Handles GET /api/dashboard/stats and GET /api/dashboard/history
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
 * Set CORS headers for same-origin requests
 */
function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

/**
 * Handle GET /api/dashboard/stats
 * Returns current dashboard statistics
 */
export async function handleDashboardStats(
  req: IncomingMessage,
  res: ServerResponse,
  conductorClientCount: number
): Promise<void> {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const collector = await getCollector();
    const stats = collector.getStats(conductorClientCount);
    res.writeHead(200);
    res.end(JSON.stringify(stats));
  } catch (error) {
    console.error("Error in /api/dashboard/stats:", error);
    res.writeHead(500);
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
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const collector = await getCollector();
    const history = collector.getHistory();
    res.writeHead(200);
    res.end(JSON.stringify(history));
  } catch (error) {
    console.error("Error in /api/dashboard/history:", error);
    res.writeHead(500);
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
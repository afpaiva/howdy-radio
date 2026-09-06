/**
 * Howdy Radio Server
 * Single Bun process that:
 * 1. Serves static client build (/client/dist)
 * 2. Exposes WebSocket conductor endpoint on the same port
 * 3. Fetches/maintains playlist from Slack
 * 4. Fetches/injects ads from YouTube Shorts
 * 5. Owns authoritative playback timeline
 */

import { Server } from "socket.io";
import { createServer } from "http";
import path from "path";
import { createAuthProvider } from "./src/auth/authProvider";
import { Conductor } from "./src/conductor/conductor";
import { SlackService } from "./src/slack/slack";
import { YouTubeService } from "./src/youtube/youtube";
import { WsHandler } from "./src/ws/handler";
import type { ServerConfig } from "./src/types";
import jwt from "jsonwebtoken";

// JWT secret — reads from AUTH_JWT_SECRET in .env. Falls back to a random
// value only if not configured (sufficient for v1 stub auth; real SSO
// providers manage their own secrets in production).
// NOTE: the env var must be AUTH_JWT_SECRET to match the .env file — using
// a different name causes a new random secret on every server restart,
// invalidating all previously issued session cookies.
const JWT_SECRET = process.env.AUTH_JWT_SECRET ||"_secret_";
const JWT_EXPIRES_IN = "24h";

// Resolve the client dist directory (sibling of server/)
const CLIENT_DIST = path.resolve(import.meta.dirname, "../client/dist");

// Content type mapping for static file serving
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

// Fallback HTML shown when client/dist hasn't been built (dev mode).
// In production, the client will always be built before deployment.
const FALLBACK_HTML =
  '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Howdy Radio</title></head>' +
  "<body><h1>Howdy Radio</h1>" +
  '<p>Client build not found. Run <code>cd ../client && bun run build</code> to build.</p>' +
  "</body></html>";

// Load configuration from environment
const config: ServerConfig = {
  reconnectGracePeriodMinutes:
    Number.parseInt(process.env.RECONNECT_GRACE_PERIOD_MINUTES || "5") || 5,
  authProvider:
    (process.env.AUTH_PROVIDER as "stub" | "slack" | "google") || "stub",
  isMockMode: !process.env.SLACK_BOT_TOKEN,
  port: Number.parseInt(process.env.PORT || "3001") || 3001,
  botToken: process.env.SLACK_BOT_TOKEN,
  slackChannelId: process.env.SLACK_CHANNEL_ID,
  apiKey: process.env.YOUTUBE_API_KEY,
  youtubeChannelId: process.env.HOWDY_YOUTUBE_CHANNEL_ID,
  adsCount: Number.parseInt(process.env.ADS_COUNT || "3") || 3,
  maxTrackDurationSeconds:
    Number.parseInt(process.env.MAX_TRACK_DURATION_SECONDS || "720") || 720,
};

// Create services
const authProvider = createAuthProvider(config.authProvider);
const conductor = new Conductor(config.reconnectGracePeriodMinutes);
const slackService = new SlackService({
  botToken: config.botToken,
  channelId: config.slackChannelId,
});
const youtubeService = new YouTubeService({
  apiKey: config.apiKey,
  channelId: config.youtubeChannelId,
  adsCount: config.adsCount,
});

// Create HTTP server with request handler
const httpServer = createServer((req, res) => {
  handleRequest(req, res);
});

// Create Socket.io server
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

// Create WebSocket handler
const wsHandler = new WsHandler(io, conductor, slackService, youtubeService);

/**
 * Main request handler — routes to auth, health, or static file serving.
 */
function handleRequest(req: any, res: any): void {
  // Handle POST /auth/login
  if (req.method === "POST" && req.url === "/auth/login") {
    handleAuthLogin(req, res);
    return;
  }

  // Handle GET /auth/me — verify JWT session cookie and return user identity
  if (req.method === "GET" && req.url === "/auth/me") {
    handleAuthMe(req, res);
    return;
  }

  // Health check endpoint
  if (req.url?.startsWith("/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        clientCount: conductor.getClientCount(),
        isMockMode: config.isMockMode,
      })
    );
    return;
  }

  // Serve static files from client/dist
  serveStaticFile(req, res);
}

/**
 * Serve a static file from the client build directory.
 * Falls back to index.html for client-side routing (SPA pattern).
 * If the client build doesn't exist, serves a fallback page.
 */
async function serveStaticFile(req: any, res: any): Promise<void> {
  const urlPath = req.url || "/";
  let filePath: string;

  if (urlPath === "/" || urlPath === "/index.html") {
    filePath = path.join(CLIENT_DIST, "index.html");
  } else {
    // Strip query string and normalize path
    const cleanPath = urlPath.split("?")[0]?.replace(/^\//, "");
    filePath = path.join(CLIENT_DIST, cleanPath);
  }

  // Security: ensure the resolved path is within client/dist
  if (!filePath.startsWith(CLIENT_DIST)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = Bun.file(filePath);

    if (await file.exists()) {
      const buffer = await file.arrayBuffer();
      const contentType = getContentType(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(Buffer.from(buffer));
    } else {
      // For SPA routing: fall back to index.html if file not found
      const indexFile = Bun.file(path.join(CLIENT_DIST, "index.html"));
      if (await indexFile.exists()) {
        const buffer = await indexFile.arrayBuffer();
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(Buffer.from(buffer));
      } else {
        // client/dist doesn't exist (dev mode without build)
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(FALLBACK_HTML);
      }
    }
  } catch (error) {
    console.error("Error serving static file:", error);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}

/**
 * Handle POST /auth/login.
 * Validates the email via the configured AuthProvider (StubEmailProvider by default),
 * issues a signed JWT session cookie on success, rejects non-@howdy.com addresses.
 */
async function handleAuthLogin(req: any, res: any): Promise<void> {
  try {
    // Collect request body
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      let email: string;
      try {
        const parsed = JSON.parse(body);
        email = parsed.email;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return;
      }

      if (!email || typeof email !== "string") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Email is required" }));
        return;
      }

      // Validate via AuthProvider (StubEmailProvider validates @howdy.com domain)
      authProvider
        .authenticate({ email })
        .then((result) => {
          // Sign a JWT with the user's identity
          const token = jwt.sign(
            { email: result.email, name: result.name },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
          );

          // Set as a signed session cookie (HTTP-only, SameSite=Lax for dev)
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Set-Cookie": `session=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24}; SameSite=Lax`,
          });
          res.end(
            JSON.stringify({
              success: true,
              email: result.email,
              name: result.name,
            })
          );
        })
        .catch((error) => {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        });
    });
  } catch (error) {
    console.error("Auth login error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

/**
 * Extract the session token from the Cookie header.
 * Returns null if the cookie is absent.
 */
function getSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] ?? null : null;
}

/**
 * Handle GET /auth/me.
 * Verifies the JWT session cookie and returns the decoded user identity
 * ({ email, name? }). Returns 401 if the token is missing or invalid.
 */
function handleAuthMe(req: any, res: any): void {
  const token = getSessionToken(req.headers?.cookie);

  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not authenticated" }));
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      email: string;
      name?: string;
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ email: decoded.email, name: decoded.name }));
  } catch {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid or expired token" }));
  }
}

/**
 * Bootstrap: fetch initial playlist and ads, then store in conductor.
 * Runs periodically to keep playlist fresh.
 */
async function refreshPlaylist(): Promise<void> {
  try {
    const [tracks, ads] = await Promise.all([
      slackService.fetchPlaylist(),
      youtubeService.fetchShorts(),
    ]);

   // Fetch real video metadata (duration + title) for Slack-sourced tracks.
    // In mock mode, tracks already have correct durations and titles from seed data.
    // In production mode, tracks have duration: 0 and title set to the raw URL.
    const tracksNeedingMetadata = tracks.filter((t) => t.duration === 0);
    let updatedTracks = tracks;
    if (tracksNeedingMetadata.length > 0) {
      const videoIds = tracksNeedingMetadata.map((t) => t.id);
      const metadataMap = await youtubeService.fetchVideoMetadata(videoIds);
      updatedTracks = tracks.map((t) => {
        const metadata = metadataMap.get(t.id);
        return {
          ...t,
          // Use real duration if available; fall back to 180s default for music videos
          duration: metadata?.duration ?? (t.duration > 0 ? t.duration : 180),
          // Replace raw URL title with actual YouTube video title when available
          title: metadata?.title || t.title,
        };
      });
    }

    // Filter out tracks exceeding MAX_TRACK_DURATION_SECONDS.
    // Only applies to music tracks (ads are already capped at <= 60s).
    // Excluded tracks are simply skipped, not queued for later.
    const filteredTracks = updatedTracks.filter(
      (t) => t.isAd || t.duration <= config.maxTrackDurationSeconds
    );

    conductor.setPlaylist(filteredTracks, ads, config.adsCount);

    if (tracksNeedingMetadata.length > 0) {
      console.log(`Playlist refreshed: ${filteredTracks.length} tracks, ${ads.length} ads (durations fetched)`);
    } else {
      console.log(`Playlist refreshed: ${filteredTracks.length} tracks, ${ads.length} ads`);
    }
  } catch (error) {
    console.error("Failed to refresh playlist:", error);
  }
}

// Initial playlist load — must complete before accepting clients so the
// first `state` broadcast (on connect) includes the full queue. Otherwise
// clients see an empty "Up Next" list that briefly disappears and reappears
// when the playlist loads 1s later (queue flicker bug).
await refreshPlaylist().catch(console.error);

// Refresh playlist periodically (every 5 minutes)
setInterval(refreshPlaylist, 5 * 60 * 1000);

// Start state broadcasting
wsHandler.startTicking(1000);

// Start the server
httpServer.listen(config.port, () => {
  console.log(`Howdy Radio server running on port ${config.port}`);
  console.log(`Mock mode: ${config.isMockMode ? "enabled" : "disabled"}`);
  console.log(`Auth provider: ${config.authProvider}`);
});

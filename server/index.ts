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
import { Conductor } from "./src/conductor/conductor";
import { SlackService } from "./src/slack/slack";
import { YouTubeService } from "./src/youtube/youtube";
import { WsHandler } from "./src/ws/handler";
import type { ServerConfig } from "./src/types";

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
};

// Create HTTP server
const httpServer = createServer((req, res) => {
  // Serve static files
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<!DOCTYPE html><html><body>Loading...</body></html>");
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

// Create Socket.io server
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

// Create services
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

// Create WebSocket handler
const wsHandler = new WsHandler(io, conductor, slackService, youtubeService);

// Health check endpoint
const requestListeners = httpServer.listeners("request");
const originalHandler = requestListeners[0];
httpServer.removeAllListeners("request");
httpServer.on("request", (req, res) => {
  if (req.url === "/health") {
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
  if (originalHandler) {
    originalHandler(req, res);
  }
});

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

    conductor.setPlaylist(tracks, ads, config.adsCount);
    console.log(`Playlist refreshed: ${tracks.length} tracks, ${ads.length} ads`);
  } catch (error) {
    console.error("Failed to refresh playlist:", error);
  }
}

// Initial playlist load
refreshPlaylist().catch(console.error);

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
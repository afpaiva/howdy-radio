import type { Server, Socket } from "socket.io";
import { Conductor } from "../conductor/conductor";
import { SlackService } from "../slack/slack";
import { YouTubeService } from "../youtube/youtube";

export class WsHandler {
  private io: Server;
  private conductor: Conductor;
  private slack: SlackService;
  private youtube: YouTubeService;

  constructor(
    io: Server,
    conductor: Conductor,
    slack: SlackService,
    youtube: YouTubeService
  ) {
    this.io = io;
    this.conductor = conductor;
    this.slack = slack;
    this.youtube = youtube;

    this.setupConnection();
  }

  /**
   * Set up Socket.io connection handling.
   */
  private setupConnection(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Handle the connect flow — emits full state snapshot on connect
      this.handleConnect(socket);

      // Handle the 'join-broadcast' event directly (client emits this after tuning in)
      socket.on("join-broadcast", () => {
        this.handleJoin(socket);
      });

      // Handle disconnect
      socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
        const wasLast = this.conductor.onClientDisconnect();
        if (wasLast) {
          // Playback clock halts — emit idle signal to any remaining sockets
          this.io.emit("idle");
        }
      });
    });
  }

  /**
   * Handle a new client connection.
   * Implements the bootstrap lock for first connections after idle.
   * Emits a full `state` snapshot immediately.
   */
  private async handleConnect(socket: Socket): Promise<void> {
    try {
      // This will trigger bootstrap lock if we're returning from idle
      const state = await this.conductor.onClientConnect();
      socket.emit("state", state);
    } catch (error) {
      console.error("Error during client connect:", error);
      socket.emit("error", { message: "Failed to connect" });
    }
  }

  /**
   * Handle the 'join-broadcast' control intent from a client.
   * Per SPEC.md: client emits 'join-broadcast' to satisfy autoplay interaction
   * requirement and signal readiness. Server rebroadcasts current state in response.
   */
  private handleJoin(socket: Socket): void {
    // Client has acknowledged they want to start playback.
    // Send them the current full state so they can sync.
    const state = this.conductor.getCurrentState();
    socket.emit("state", state);
  }

  /**
   * Broadcast the current state to all connected clients.
   */
  broadcastState(): void {
    const state = this.conductor.getCurrentState();
    this.io.emit("state", state);
  }

  /**
   * Start periodic state broadcasting (called when clients are connected).
   * Emits `tick` (position-only updates) on each interval to keep clients'
   * clocks advancing in real time. When a track transition is detected
   * (currentTrack changes — e.g. an ad finishes and the next music track
   * begins), emits a full `state` snapshot so the client receives the
   * updated currentTrack and queue instead of stale data.
   */
  startTicking(intervalMs: number = 1000): void {
    const state = this.conductor.getCurrentState();
    let lastTrackId = state.currentTrack?.id ?? null;

    setInterval(() => {
      if (this.conductor.getClientCount() > 0) {
        // Persist any track transition to internal state so the next
        // tick doesn't recompute the same transition from the stale base.
        this.conductor.advanceIfNeeded();

        const state = this.conductor.getCurrentState();
        const trackId = state.currentTrack?.id ?? null;

        if (trackId !== lastTrackId) {
          // Track transition! Emit full state so the client's queue and
          // currentTrack are updated — not just position/isPlaying.
          lastTrackId = trackId;
          this.io.emit("state", state);
        } else {
          // Same track — cheap position-only update so clients advance their clock.
          this.io.emit("tick", {
            position: state.position,
            isPlaying: state.isPlaying,
          });
        }
      }
    }, intervalMs);
  }
}

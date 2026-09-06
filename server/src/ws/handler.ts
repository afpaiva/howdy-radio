import type { Server, Socket } from "socket.io";
import { Conductor } from "../conductor/conductor";
import { SlackService } from "../slack/slack";
import { YouTubeService } from "../youtube/youtube";

export class WsHandler {
  private io: Server;
  private conductor: Conductor;
  private slack: SlackService;
  private youtube: YouTubeService;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

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
   * clocks advancing in real time, and `state` on significant changes
   * (track transitions) so clients know to switch to the new track.
   */
  startTicking(intervalMs: number = 1000): void {
    let lastTrackId: string | null = null;
    this.tickInterval = setInterval(() => {
      if (this.conductor.getClientCount() > 0) {
        const state = this.conductor.getCurrentState();

        // On track change, emit full state so clients switch to the new track.
        // Without this, clients only see position reset to 0 via `tick` and
        // restart the SAME track from the beginning (the "plays in a loop" bug).
        const currentTrackId = state.currentTrack?.id ?? null;
        if (currentTrackId !== lastTrackId) {
          this.io.emit("state", state);
          lastTrackId = currentTrackId;
        }

        // Emit tick — cheap position-only update so clients advance their clock
        this.io.emit("tick", {
          position: state.position,
          isPlaying: state.isPlaying,
        });
      }
     }, intervalMs);
  }

  /**
   * Stop the periodic state broadcasting.
   */
  stopTicking(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}

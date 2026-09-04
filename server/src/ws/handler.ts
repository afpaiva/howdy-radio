import type { Server, Socket } from "socket.io";
import type { WsMessage } from "../types";
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

      // Handle the connect flow
      this.handleConnect(socket);

      // Handle disconnect
      socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
        this.conductor.onClientDisconnect();
      });

      // Handle client messages (control intents)
      socket.on("message", (data: WsMessage) => {
        this.handleMessage(socket, data);
      });
    });
  }

  /**
   * Handle a new client connection.
   * Implements the bootstrap lock for first connections after idle.
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
   * Handle incoming messages from clients.
   * Clients can only send control intents, never state.
   */
  private handleMessage(socket: Socket, data: WsMessage): void {
    switch (data.type) {
      case "get-state":
        this.broadcastState();
        break;
      case "join-broadcast":
        // Client acknowledges they want to start playback
        // (satisfies autoplay interaction requirement)
        this.broadcastState();
        break;
      case "pause":
        // Client intent to pause - in v1, server may ignore for radio-like experience
        // or could implement pause that applies to all
        this.broadcastState();
        break;
      case "seek":
        // Seeking is not supported in v1 - server is authoritative
        // Just rebroadcast current state
        this.broadcastState();
        break;
      default:
        console.warn(`Unknown message type: ${data.type}`);
        break;
    }
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
   */
  startTicking(intervalMs: number = 1000): void {
    setInterval(() => {
      if (this.conductor.getClientCount() > 0) {
        this.broadcastState();
      }
    }, intervalMs);
  }
}

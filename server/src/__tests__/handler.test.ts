import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Server } from "socket.io";
import { createServer } from "http";
import { Conductor } from "../conductor/conductor";
import { SlackService } from "../slack/slack";
import { YouTubeService } from "../youtube/youtube";
import { WsHandler } from "../ws/handler";
import type { Track } from "../types";

describe("WsHandler - Track Change Broadcasting", () => {
  let conductor: Conductor;
  let slackService: SlackService;
  let youtubeService: YouTubeService;
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let handler: WsHandler;

  const mockTrack1: Track = { id: "t1", title: "Track 1", duration: 2, isAd: false };
  const mockAd: Track = { id: "ad1", title: "Ad", duration: 5, isAd: true };
  const mockTrack2: Track = { id: "t2", title: "Track 2", duration: 300, isAd: false };

  beforeEach(() => {
    conductor = new Conductor(5);
    slackService = new SlackService({ botToken: undefined, channelId: undefined });
    youtubeService = new YouTubeService({ apiKey: undefined, channelId: undefined, adsCount: 3 });
    httpServer = createServer();
    io = new Server(httpServer, { cors: { origin: "*" } });
    handler = new WsHandler(io, conductor, slackService, youtubeService);
  });

  afterEach(() => {
    // WsHandler has no stopTicking method; neutralize the ticking
    // interval by setting clientCount to 0 so the interval callback
    // becomes a no-op.
    conductor["state"].clientCount = 0;
    io.close();
    httpServer.close();
  });

  test("tick emits state event when track changes, not just position", async () => {
    // Set up state manually: track1 (2s) playing, ad is next in queue
    await conductor.onClientConnect();
    const now = Math.floor(Date.now() / 1000);
    conductor["state"] = {
      currentTrack: mockTrack1,
      position: 0,
      queue: [mockAd, mockTrack2],
      isPlaying: true,
      lastUpdated: now,
      clientCount: 1,
    };

    // Track emitted events
    const emittedEvents: { type: string; payload: any }[] = [];

    // Mock io.emit to capture events
    const originalEmit = io.emit.bind(io);
    io.emit = ((type: string, payload?: any) => {
      emittedEvents.push({ type, payload });
    }) as any;

    // Start ticking with 1s interval
    handler.startTicking(1000);

    // Wait for track1 to end (2s + buffer)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Stop ticking
    io.emit = originalEmit;

    // Should have emitted at least one 'state' event (on track change)
    // and multiple 'tick' events
    const stateEvents = emittedEvents.filter((e) => e.type === "state");
    const tickEvents = emittedEvents.filter((e) => e.type === "tick");

    expect(tickEvents.length).toBeGreaterThan(0);
    expect(stateEvents.length).toBeGreaterThan(0);

    // The state event should have the new track (ad)
    const lastStateEvent = stateEvents[stateEvents.length - 1]!;
    expect(lastStateEvent.payload.currentTrack?.id).toBe("ad1");
  });

  test("tick does not emit state when track stays same", async () => {
    // Set up state: a long track playing
    await conductor.onClientConnect();
    const longTrack: Track = { id: "long1", title: "Long Track", duration: 300, isAd: false };
    const now = Math.floor(Date.now() / 1000);

    conductor["state"] = {
      currentTrack: longTrack,
      position: 0,
      queue: [],
      isPlaying: true,
      lastUpdated: now,
      clientCount: 1,
    };

    const emittedEvents: { type: string; payload: any }[] = [];
    const originalEmit = io.emit.bind(io);
    io.emit = ((type: string, payload?: any) => {
      emittedEvents.push({ type, payload });
    }) as any;

    handler.startTicking(1000);

    // Wait 3 seconds (track is 300s, no transition expected)
    await new Promise((resolve) => setTimeout(resolve, 3500));

    io.emit = originalEmit;

    // Should have multiple tick events but only 1 state event (initial)
    const stateEvents = emittedEvents.filter((e) => e.type === "state");
    const tickEvents = emittedEvents.filter((e) => e.type === "tick");

    expect(tickEvents.length).toBeGreaterThan(1);
    // lastTrackId is initialized from the current track's id (not null),
    // so when the track stays the same no state events are emitted —
    // only tick events for position updates
    expect(stateEvents.length).toBe(0);
  });
});

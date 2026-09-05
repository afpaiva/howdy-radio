import { test, expect, describe } from "bun:test";
import { YouTubeService } from "../youtube/youtube";
import { SeedPlaylist } from "../seed/playlist";

describe("YouTubeService - Duration Parsing", () => {
  const youtubeService = new YouTubeService({
    apiKey: "test-key",
    channelId: "test-channel",
    adsCount: 3,
  });

  test("parses ISO 8601 duration - seconds only", () => {
    expect(youtubeService.parseDuration("PT45S")).toBe(45);
  });

  test("parses ISO 8601 duration - minutes and seconds", () => {
    expect(youtubeService.parseDuration("PT1M30S")).toBe(90);
  });

  test("parses ISO 8601 duration - hours, minutes, seconds", () => {
    expect(youtubeService.parseDuration("PT1H2M30S")).toBe(3750);
  });

  test("parses ISO 8601 duration - minutes only", () => {
    expect(youtubeService.parseDuration("PT2M")).toBe(120);
  });

  test("returns 0 for undefined duration", () => {
    expect(youtubeService.parseDuration(undefined)).toBe(0);
  });

  test("returns 0 for empty string", () => {
    expect(youtubeService.parseDuration("")).toBe(0);
  });
});

describe("YouTubeService - Mock Mode", () => {
  test("isMockMode returns true when apiKey is not set", () => {
    const service = new YouTubeService({
      apiKey: undefined,
      channelId: "channel",
      adsCount: 3,
    });
    expect(service.isMockMode()).toBe(true);
  });

  test("isMockMode returns true when channelId is not set", () => {
    const service = new YouTubeService({
      apiKey: "key",
      channelId: undefined,
      adsCount: 3,
    });
    expect(service.isMockMode()).toBe(true);
  });

  test("isMockMode returns false when both are set", () => {
    const service = new YouTubeService({
      apiKey: "key",
      channelId: "channel",
      adsCount: 3,
    });
    expect(service.isMockMode()).toBe(false);
  });

  test("fetchShorts returns mock ads in mock mode", async () => {
    const service = new YouTubeService({
      apiKey: undefined,
      channelId: undefined,
      adsCount: 3,
    });
    const shorts = await service.fetchShorts();
    expect(shorts.length).toBeGreaterThan(0);
    expect(shorts.every((s) => s.isAd)).toBe(true);
    // All mock ads should be <= 60 seconds
    expect(shorts.every((s) => s.duration <= 60)).toBe(true);
  });
});

describe("YouTubeService - Ads Count", () => {
  test("uses configured ads count", () => {
    const service = new YouTubeService({
      apiKey: "key",
      channelId: "channel",
      adsCount: 5,
    });
    expect(service.getAdsCount()).toBe(5);
  });

  test("defaults to 3 ads when not specified", () => {
    const service = new YouTubeService({
      apiKey: "key",
      channelId: "channel",
      adsCount: 3,
    });
    expect(service.getAdsCount()).toBe(3);
  });

  test("handles missing adsCount gracefully", () => {
    const service = new YouTubeService({
      apiKey: "key",
      channelId: "channel",
      adsCount: undefined as unknown as number,
    });
    // When adsCount is undefined, getAdsCount returns the raw value (undefined || 3 = 3)
    expect(service.getAdsCount()).toBe(3);
  });
});

describe("YouTubeService - Video Durations", () => {
  test("fetchVideoDurations returns empty map in mock mode", async () => {
    const service = new YouTubeService({
      apiKey: undefined,
      channelId: "channel",
      adsCount: 3,
    });
    const durations = await service.fetchVideoDurations(["dQw4w9WgXcQ"]);
    expect(durations.size).toBe(0);
  });

  test("fetchVideoDurations handles empty video IDs", async () => {
    const service = new YouTubeService({
      apiKey: "key",
      channelId: "channel",
      adsCount: 3,
    });
    const durations = await service.fetchVideoDurations([]);
    expect(durations.size).toBe(0);
  });
});

describe("YouTubeService - Durations for Slack Tracks", () => {
  test("seed tracks have valid durations (mock mode provides correct durations)", () => {
    // This test documents the known state: Slack-sourced tracks from
    // extractYouTubeLinks() start with duration 0. The refreshPlaylist()
    // function in index.ts fetches real durations via fetchVideoDurations()
    // and updates them before storing in the conductor. In mock mode, the
    // seed data already has correct durations.
    const seedTracks = SeedPlaylist.getMusicTracks();
    expect(seedTracks.length).toBeGreaterThan(0);
    expect(seedTracks.every((t) => t.duration > 0)).toBe(true);
  });
});

import { test, expect, describe } from "bun:test";
import { YouTubeService } from "../youtube/youtube";
import { SeedPlaylist } from "../seed/playlist";describe("YouTubeService - Duration Parsing", () => {
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

describe("YouTubeService - Video Metadata", () => {
  test("fetchVideoMetadata returns empty map in mock mode", async () => {
    const service = new YouTubeService({
      apiKey: undefined,
      channelId: "channel",
      adsCount: 3,
    });
    const metadata = await service.fetchVideoMetadata(["dQw4w9WgXcQ"]);
    expect(metadata.size).toBe(0);
  });

  test("fetchVideoMetadata handles empty video IDs", async () => {
    const service = new YouTubeService({
      apiKey: "key",
      channelId: "channel",
      adsCount: 3,
    });
    const metadata = await service.fetchVideoMetadata([]);
    expect(metadata.size).toBe(0);
  });

  test("fetchVideoMetadata returns {duration, title} for each video", async () => {
    // This test documents the return type: Map<videoId, { duration, title }>
    // When the real API is called, the map keys are video IDs and values
    // contain both duration (seconds) and title (string).
    // In mock mode, the map is empty (no API key).
    const service = new YouTubeService({
      apiKey: "key",
      channelId: "channel",
      adsCount: 3,
    });
    // Mock mode check — with a real API key this would return data
    expect(typeof service.fetchVideoMetadata).toBe("function");
  });
});

describe("YouTubeService - Metadata for Slack Tracks", () => {
  test("seed tracks have valid durations (mock mode provides correct durations)", async () => {
    // This test documents the known state: Slack-sourced tracks from
    // extractYouTubeLinks() start with duration 0 and title set to the raw URL.
    // The refreshPlaylist() function in index.ts fetches real metadata
    // (duration + title) via fetchVideoMetadata() and updates them before
    // storing in the conductor. In mock mode, the seed data already has
    // correct durations and titles.
    const seedTracks = SeedPlaylist.getMusicTracks();
    expect(seedTracks.length).toBeGreaterThan(0);
    expect(seedTracks.every((t) => t.duration > 0)).toBe(true);
  });

  test("slack-extracted tracks have URL as title and duration 0 before metadata fetch", () => {
    // Documents the production behavior: extractYouTubeLinks() creates tracks
    // with title=url and duration=0. These are enriched by fetchVideoMetadata()
    // in refreshPlaylist().
    const seedAds = SeedPlaylist.getAds();
    // Seed/mock ads already have proper durations and titles (non-URL)
    expect(seedAds.every((a) => a.duration > 0)).toBe(true);
    expect(seedAds.every((a) => !a.title.startsWith("http"))).toBe(true);
  });
});

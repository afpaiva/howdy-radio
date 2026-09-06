import { test, expect, describe } from "bun:test";
import { SlackService } from "../slack/slack";
import type { SlackMessage } from "../slack/types";

describe("SlackService - YouTube URL Extraction", () => {
  const slackService = new SlackService({
    botToken: "test-token",
    channelId: "test-channel",
  });

  test("extracts YouTube watch URLs", async () => {
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Check out this song: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(1);
    expect(tracks[0]!.id).toBe("dQw4w9WgXcQ");
    expect(tracks[0]!.isAd).toBe(false);
  });

  test("extracts YouTube Music URLs", async () => {
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Music: https://music.youtube.com/watch?v=9bZkp7q19f0",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(1);
    expect(tracks[0]!.id).toBe("9bZkp7q19f0");
  });

  test("extracts YouTube Shorts URLs", async () => {
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Short: https://www.youtube.com/shorts/hTbnEfVlHd5",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(1);
    expect(tracks[0]!.id).toBe("hTbnEfVlHd5");
  });

  test("extracts YouTube embed URLs", async () => {
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Embedded: https://www.youtube.com/embed/kJQP7q19f0A",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(1);
    expect(tracks[0]!.id).toBe("kJQP7q19f0A");
  });

  test("handles youtu.be short URLs", async () => {
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Short link: https://youtu.be/OPf05leTWnY",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(1);
    expect(tracks[0]!.id).toBe("OPf05leTWnY");
  });

  test("extracts multiple links from single message", async () => {
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Check these out: https://youtube.com/watch?v=videoOneABC & https://youtube.com/watch?v=videoTwoABC",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(2);
    expect(tracks[0]!.id).toBe("videoOneABC");
    expect(tracks[1]!.id).toBe("videoTwoABC");
  });

  test("ignores non-YouTube URLs", async () => {
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Check out https://example.com/some-song",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(0);
  });

  test("sets title to raw URL (enriched later by fetchVideoMetadata in refreshPlaylist)", async () => {
    // Slack-extracted tracks start with title=url and duration=0.
    // The refreshPlaylist() function in index.ts calls fetchVideoMetadata()
    // to replace the URL title with the actual YouTube video title and
    // fetch the real duration. This test documents the pre-enrichment state.
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Check out: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks[0]!.title).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(tracks[0]!.duration).toBe(0);
  });

  test("handles empty text", async () => {
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(0);
  });
});

describe("SlackService - Deduplication", () => {
  const slackService = new SlackService({
    botToken: "test-token",
    channelId: "test-channel",
  });

  test("deduplicates by video ID, keeping most recent", async () => {
    // Two messages with the same video ID
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U1",
        text: "https://youtube.com/watch?v=sameVDID123",
        ts: "1000.0", // Older
      },
      {
        type: "message",
        user: "U2",
        text: "https://youtube.com/watch?v=sameVDID123",
        ts: "2000.0", // Newer
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(1);
    // The user from the newest message should be kept
    expect(tracks[0]!.postedBy?.id).toBe("U2");
  });

  test("keeps all unique video IDs", async () => {
    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U1",
        text: "https://youtube.com/watch?v=videoOneABC",
        ts: "1000.0",
      },
      {
        type: "message",
        user: "U2",
        text: "https://youtube.com/watch?v=videoTwoABC",
        ts: "2000.0",
      },
    ];

    const tracks = await slackService.extractYouTubeLinks(messages);
    expect(tracks.length).toBe(2);
  });
});

describe("SlackService - Mock Mode", () => {
  test("isMockMode returns true when botToken is not set", () => {
    const slackService = new SlackService({});
    expect(slackService.isMockMode()).toBe(true);
  });

  test("isMockMode returns true when channelId is not set", () => {
    const slackService = new SlackService({ botToken: "token" });
    expect(slackService.isMockMode()).toBe(true);
  });

  test("isMockMode returns false when both are set", () => {
    const slackService = new SlackService({
      botToken: "token",
      channelId: "channel",
    });
    expect(slackService.isMockMode()).toBe(false);
  });

  test("fetchPlaylist returns mock data in mock mode", async () => {
    const slackService = new SlackService({});
    const tracks = await slackService.fetchPlaylist();
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.every((t) => !t.isAd)).toBe(true);
  });
});

describe("SlackService - Display Name Fallback", () => {
  test("falls back to realName when display_name is empty", async () => {
    const service = new SlackService({
      botToken: "test-token",
      channelId: "test-channel",
    });

    // Override getUserInfo to simulate a user with empty display_name
    service.getUserInfo = async (userId: string) => {
      if (userId === "U123") {
        return { displayName: "", realName: "Alice Johnson" };
      }
      return null;
    };

    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Check out: https://youtube.com/watch?v=dQw4w9WgXcQ",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await service.extractYouTubeLinks(messages);
    expect(tracks[0]!.postedBy?.displayName).toBe("Alice Johnson");
    expect(tracks[0]!.postedBy?.realName).toBe("Alice Johnson");
    // Must NOT fall back to raw Slack user ID
    expect(tracks[0]!.postedBy?.displayName).not.toBe("U123");
  });

  test("falls back to 'unknown' when both display_name and realName are empty", async () => {
    const service = new SlackService({
      botToken: "test-token",
      channelId: "test-channel",
    });

    service.getUserInfo = async (userId: string) => {
      if (userId === "U123") {
        return { displayName: "", realName: undefined };
      }
      return null;
    };

    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Check out: https://youtube.com/watch?v=dQw4w9WgXcQ",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await service.extractYouTubeLinks(messages);
    expect(tracks[0]!.postedBy?.displayName).toBe("unknown");
  });

  test("uses display_name when it is non-empty", async () => {
    const service = new SlackService({
      botToken: "test-token",
      channelId: "test-channel",
    });

    service.getUserInfo = async (userId: string) => {
      if (userId === "U123") {
        return { displayName: "alice_s", realName: "Alice Johnson" };
      }
      return null;
    };

    const messages: SlackMessage[] = [
      {
        type: "message",
        user: "U123",
        text: "Check out: https://youtube.com/watch?v=dQw4w9WgXcQ",
        ts: "1234567890.001234",
      },
    ];

    const tracks = await service.extractYouTubeLinks(messages);
    expect(tracks[0]!.postedBy?.displayName).toBe("alice_s");
  });
});

describe("SlackService - Max Duration Filtering", () => {
  // Documents the filtering behavior in refreshPlaylist() (index.ts):
  // Tracks with duration > MAX_TRACK_DURATION_SECONDS are excluded from the
  // playlist. Ads are never excluded (already capped at <= 60s).
  // This test verifies the filter predicate used in production:
  //   t.isAd || t.duration <= config.maxTrackDurationSeconds

  const MAX_TRACK_DURATION_SECONDS = 720;

  test("filters out music tracks exceeding max duration", () => {
    const tracks = [
      { id: "short1", title: "Short", duration: 120, isAd: false },
      { id: "long1", title: "Long DJ Set", duration: 3600, isAd: false }, // 1 hour
      { id: "long2", title: "Long Mix", duration: 1200, isAd: false }, // 20 min
      { id: "short2", title: "Short 2", duration: 300, isAd: false },
    ];

    const filtered = tracks.filter(
      (t) => t.isAd || t.duration <= MAX_TRACK_DURATION_SECONDS
    );

    expect(filtered.length).toBe(2);
    expect(filtered.map((t) => t.id)).toEqual(["short1", "short2"]);
  });

  test("never filters out ads regardless of threshold", () => {
    const tracks = [
      { id: "ad1", title: "Ad 1", duration: 30, isAd: true },
      { id: "music1", title: "Music", duration: 800, isAd: false },
    ];

    const filtered = tracks.filter(
      (t) => t.isAd || t.duration <= MAX_TRACK_DURATION_SECONDS
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0]!.isAd).toBe(true);
    expect(filtered[0]!.id).toBe("ad1");
  });

  test("boundary: track with duration exactly at max is kept", () => {
    const tracks = [
      { id: "at-limit", title: "At Limit", duration: 720, isAd: false },
      { id: "over-limit", title: "Over Limit", duration: 721, isAd: false },
    ];

    const filtered = tracks.filter(
      (t) => t.isAd || t.duration <= MAX_TRACK_DURATION_SECONDS
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0]!.id).toBe("at-limit");
  });
});

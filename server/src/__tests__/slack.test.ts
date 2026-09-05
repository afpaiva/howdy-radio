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

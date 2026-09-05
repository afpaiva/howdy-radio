import type { Track, YouTubeConfig } from "../types";
import { SeedPlaylist } from "../seed/playlist";

export class YouTubeService {
  private config: YouTubeConfig;

  constructor(config: YouTubeConfig) {
    this.config = config;
  }

  /**
   * Fetch YouTube Shorts from the Howdy channel for ads.
   * Falls back to mock ads if YOUTUBE_API_KEY is not set.
   */
  async fetchShorts(): Promise<Track[]> {
    if (!this.config.apiKey || !this.config.channelId) {
      return SeedPlaylist.getAds();
    }

    try {
      return await this.fetchShortsFromAPI();
    } catch (error) {
      console.error("Failed to fetch YouTube Shorts, using mock:", error);
      return SeedPlaylist.getAds();
    }
  }

  /**
   * Batch-fetch video durations from the YouTube Data API v3.
   * Returns a map of videoId → duration in seconds.
   * Returns an empty map if the API key is not configured (mock mode).
   */
  async fetchVideoDurations(videoIds: string[]): Promise<Map<string, number>> {
    if (!this.config.apiKey || videoIds.length === 0) {
      return new Map();
    }

    try {
      // YouTube API allows up to 50 IDs per request
      const batches: string[][] = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        batches.push(videoIds.slice(i, i + 50));
      }

      const durationMap = new Map<string, number>();

      for (const batch of batches) {
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batch.join(",")}&key=${this.config.apiKey}`
        );

        if (!response.ok) {
          console.warn(`YouTube API error: ${response.status}`);
          continue;
        }

        const data = (await response.json()) as YouTubeVideosResponse;
        for (const item of data.items) {
          const duration = this.parseDuration(item.contentDetails?.duration);
          if (duration > 0) {
            durationMap.set(item.id, duration);
          }
        }
      }

      return durationMap;
    } catch (error) {
      console.error("Failed to fetch video durations:", error);
      return new Map();
    }
  }

  /**
   * Fetch Shorts from YouTube Data API v3.
   * Filters by duration <= 60s (industry standard proxy for Shorts).
   * Returns the ADS_COUNT most recent Shorts.
   */
  private async fetchShortsFromAPI(): Promise<Track[]> {
    // Step 1: Get the channel's uploads playlist ID
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${this.config.channelId}&key=${this.config.apiKey}`
    );

    if (!channelResponse.ok) {
      throw new Error(`YouTube API error: ${channelResponse.status}`);
    }

    const channelData = (await channelResponse.json()) as YouTubeChannelResponse;
    if (!channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads) {
      throw new Error("Could not find uploads playlist for channel");
    }

    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

    // Step 2: Get videos from the uploads playlist (most recent first)
    const playlistResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${this.config.apiKey}`
    );

    if (!playlistResponse.ok) {
      throw new Error(`YouTube API error: ${playlistResponse.status}`);
    }

    const playlistData = (await playlistResponse.json()) as YouTubePlaylistResponse;
    const videoIds = playlistData.items
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean) as string[];

    if (videoIds.length === 0) {
      return [];
    }

    // Step 3: Fetch video details to get duration
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds.join(",")}&key=${this.config.apiKey}`
    );

    if (!videosResponse.ok) {
      throw new Error(`YouTube API error: ${videosResponse.status}`);
    }

    const videosData = (await videosResponse.json()) as YouTubeVideosResponse;

    // Step 4: Filter by duration (<= 60s) and convert to Tracks
    const shorts: Track[] = [];
    for (const item of videosData.items) {
      const duration = this.parseDuration(item.contentDetails?.duration);
      if (duration > 0 && duration <= 60) {
        shorts.push({
          id: item.id,
          title: item.snippet?.title || "Untitled Short",
          channelTitle: item.snippet?.channelTitle,
          duration,
          isAd: true,
        });
      }
    }

    // Return the ADS_COUNT most recent Shorts
    return shorts.slice(0, this.config.adsCount || 3).map((s) => ({
      ...s,
      postedBy: {
        id: "youtube-channel",
        displayName: s.channelTitle || "Howdy",
      },
    }));
  }

  /**
   * Parse ISO 8601 duration to seconds.
   * Example: "PT45S" -> 45, "PT1M30S" -> 90
   */
  parseDuration(isoDuration: string | undefined): number {
    if (!isoDuration) return 0;

    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Check if the service is in mock mode.
   */
  isMockMode(): boolean {
    return !this.config.apiKey || !this.config.channelId;
  }

  /**
   * Get the number of ads to inject per bootstrap.
   */
  getAdsCount(): number {
    return this.config.adsCount || 3;
  }
}

// YouTube API response types
interface YouTubeChannelResponse {
  items?: Array<{
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
}

interface YouTubePlaylistResponse {
  items: Array<{
    contentDetails?: {
      videoId?: string;
    };
  }>;
}

interface YouTubeVideosResponse {
  items: Array<{
    id: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
}

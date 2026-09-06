import type { Track, SlackConfig } from "../types";
import type { SlackMessage, SlackHistoryResponse, SlackUserInfoResponse } from "./types";
import { SeedPlaylist } from "../seed/playlist";

export class SlackService {
  private config: SlackConfig;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  /**
   * Fetch the playlist from Slack channel.
   * Returns mock playlist if SLACK_BOT_TOKEN is not set.
   */
  async fetchPlaylist(): Promise<Track[]> {
    if (!this.config.botToken || !this.config.channelId) {
      return SeedPlaylist.getMusicTracks();
    }

    try {
      const messages = await this.fetchChannelHistory();
      return this.extractYouTubeLinks(messages);
    } catch (error) {
      console.error("Failed to fetch Slack playlist, using mock:", error);
      return SeedPlaylist.getMusicTracks();
    }
  }

  /**
   * Fetch channel history using Slack Bot API.
   * Uses channels:history scope.
   */
  private async fetchChannelHistory(
    cursor?: string
  ): Promise<SlackMessage[]> {
    const params = new URLSearchParams({
      channel: this.config.channelId!,
      limit: "1000",
    });

    if (cursor) {
      params.append("cursor", cursor);
    }

    const response = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.botToken!}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    const data = (await response.json()) as SlackHistoryResponse;
    return data.messages || [];
  }

   /**
    * Extract YouTube/YouTube Music links from Slack messages.
    * Deduplicates by video ID, keeping the most recent post.
    * Resolves display names via getUserInfo(), falling back to real_name or
    * the raw user ID.
    */
   async extractYouTubeLinks(messages: SlackMessage[]): Promise<Track[]> {
     const videoMap = new Map<string, Track>();
     const resolvedUsers = new Map<string, { displayName: string; realName?: string } | null>();

     // Process messages in reverse order (newest first) so dedup keeps most recent
     for (const msg of [...messages].reverse()) {
       if (msg.subtype && msg.subtype !== "message") {
         continue; // Skip non-message types
       }

       const youtubeUrls = this.extractYouTubeUrls(msg.text);

       for (const { videoId, url } of youtubeUrls) {
         if (!videoMap.has(videoId)) {
           // Resolve the user's display name, caching the result
           if (!resolvedUsers.has(msg.user)) {
             resolvedUsers.set(msg.user, await this.getUserInfo(msg.user));
           }
            const userInfo = resolvedUsers.get(msg.user);
            const realName = userInfo?.realName;
            // Fallback chain: displayName → realName → "unknown"
            // (previously fell back to raw Slack user ID, which is not a display name)
            const displayName = userInfo?.displayName || realName || "unknown";

           const track: Track = {
             id: videoId,
             title: url,
             duration: 0, // Duration is fetched from YouTube API when needed
             isAd: false,
             postedBy: {
               id: msg.user || "unknown",
               displayName,
               ...(realName ? { realName } : {}),
             },
           };

           videoMap.set(videoId, track);
         }
       }
     }

     return Array.from(videoMap.values());
   }

  /**
   * Extract YouTube video IDs and URLs from text.
   * Handles YouTube and YouTube Music URLs.
   */
  extractYouTubeUrls(text: string): { videoId: string; url: string }[] {
    const urls: { videoId: string; url: string }[] = [];

    // YouTube watch URL: youtube.com/watch?v=VIDEO_ID
    const watchRegex = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g;
    let match;
    while ((match = watchRegex.exec(text)) !== null) {
      const videoId = match[1];
      if (videoId) {
        urls.push({ videoId, url: match[0] });
      }
    }

    // youtu.be short URL: youtu.be/VIDEO_ID
    const shortRegex = /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})/g;
    while ((match = shortRegex.exec(text)) !== null) {
      const videoId = match[1];
      if (videoId) {
        urls.push({ videoId, url: match[0] });
      }
    }

    // YouTube Music URL: music.youtube.com/watch?v=VIDEO_ID
    const musicRegex = /https?:\/\/music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g;
    while ((match = musicRegex.exec(text)) !== null) {
      const videoId = match[1];
      if (videoId) {
        urls.push({ videoId, url: match[0] });
      }
    }

    // Shorts URL: youtube.com/shorts/VIDEO_ID
    const shortsRegex = /https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/g;
    while ((match = shortsRegex.exec(text)) !== null) {
      const videoId = match[1];
      if (videoId) {
        urls.push({ videoId, url: match[0] });
      }
    }

    // Embed URL: youtube.com/embed/VIDEO_ID or youtube.com/v/VIDEO_ID
    const embedRegex = /https?:\/\/(?:www\.)?youtube\.com\/(?:embed|v)\/([a-zA-Z0-9_-]{11})/g;
    while ((match = embedRegex.exec(text)) !== null) {
      const videoId = match[1];
      if (videoId) {
        urls.push({ videoId, url: match[0] });
      }
    }

    return urls;
  }

  /**
   * Fetch user info from Slack API.
   * Returns display name, falling back to real name if display name is empty.
   */
  async getUserInfo(userId: string): Promise<{ displayName: string; realName?: string } | null> {
    if (!this.config.botToken) {
      return null;
    }

    try {
      const response = await fetch(
        `https://slack.com/api/users.info?user=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.botToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as SlackUserInfoResponse;
      if (!data.ok || !data.user) {
        return null;
      }

      const user = data.user;
      return {
        displayName: user.profile?.display_name || "",
        realName: user.real_name || user.profile?.real_name,
      };
    } catch (error) {
      console.error(`Failed to fetch user info for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Check if the service is in mock mode.
   */
  isMockMode(): boolean {
    return !this.config.botToken || !this.config.channelId;
  }
}



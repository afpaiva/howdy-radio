// Shared types for Howdy Radio server

export interface Track {
  id: string; // YouTube video ID
  title: string;
  channelTitle?: string;
  duration: number; // seconds
  postedBy?: {
    id: string;
    displayName: string;
    realName?: string;
  };
  isAd: boolean;
}

export interface PlaybackState {
  currentTrack: Track | null;
  position: number; // seconds into the current track
  queue: Track[]; // upcoming tracks including ads
  isPlaying: boolean;
  lastUpdated: number; // Unix timestamp (seconds)
  clientCount: number;
}

export interface AuthInput {
  email: string;
}

export interface AuthResult {
  email: string;
  name?: string;
}

export interface AuthProvider {
  authenticate(input: AuthInput): Promise<AuthResult>;
}

export interface WsMessage {
  type: string;
  payload?: unknown;
}

export interface StateSnapshot {
  trackId: string | null;
  position: number;
  disconnectedAt: number; // Unix timestamp (seconds)
}

export interface SlackConfig {
  botToken?: string;
  channelId?: string;
}

export interface YouTubeConfig {
  apiKey?: string;
  channelId?: string;
  adsCount: number;
}

export interface VideoMetadata {
  duration: number;
  title: string;
}

export interface ServerConfig {
  reconnectGracePeriodMinutes: number;
  authProvider: "stub" | "slack" | "google";
  isMockMode: boolean;
  port: number;
  botToken?: string;
  slackChannelId?: string;
  apiKey?: string;
  youtubeChannelId?: string;
  adsCount: number;
  maxTrackDurationSeconds: number;
}

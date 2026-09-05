import type { Track } from "../types";
import playlistData from "./playlist.json";

export class SeedPlaylist {
  static getTracks(): Track[] {
    return playlistData as unknown as Track[];
  }

  static getAds(): Track[] {
    return (playlistData as unknown as Track[]).filter((t) => t.isAd);
  }

  static getMusicTracks(): Track[] {
    return (playlistData as unknown as Track[]).filter((t) => !t.isAd);
  }
}

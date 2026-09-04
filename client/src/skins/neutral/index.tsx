/**
 * /client/src/skins/neutral/index.tsx
 *
 * Neutral, unstyled skin.
 *
 * This is the Skeleton Implementer's baseline skin. It is intentionally
 * free of visual styling — it emits semantic HTML with `data-testid`
 * and `data-skin` attributes so the end-to-end data path
 * (server -> Socket.io -> PlaybackState -> render) can be validated
 * before any visual theming begins.
 *
 * It implements the shared `Skin` contract from `../types.ts` exactly,
 * with no skin-specific required props.
 */

import type { ReactElement } from "react";
import type { PlaybackState, Skin, Track } from "../types";

/** Format a whole-second duration as `M:SS`. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Render a single queued track as a plain list row. */
function QueueRow({ track }: { track: Track }): ReactElement {
  return (
    <li data-testid="queue-item" data-ad={track.isAd ? "true" : "false"}>
      {track.isAd ? "[ad] " : ""}
      {track.title}
    </li>
  );
}

/** Render the currently playing track block. */
function CurrentTrack({
  state,
}: {
  state: PlaybackState;
}): ReactElement {
  const { currentTrack, position, isPlaying } = state;

  // currentTrack is guaranteed to be non-null at this point
  const safeTrack = currentTrack as Track;
  const progress = `${formatTime(position)} / ${formatTime(safeTrack.duration)}`;

  return (
    <section data-testid="current-track" aria-label="Now playing">
      <h1 data-testid="track-title">{safeTrack.title}</h1>
      <p data-testid="track-meta">
        <span data-testid="posted-by">posted by {safeTrack.postedBy}</span>
        {" · "}
        <span data-testid="play-state">
          {isPlaying ? "Playing" : "Paused"}
        </span>
      </p>
      <p data-testid="position">{progress}</p>
      <a
        data-testid="track-link"
        href={safeTrack.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {safeTrack.title} on YouTube
      </a>
    </section>
  );
}

/** The neutral skin object, conforming to the `Skin` contract. */
export const neutralSkin: Skin = {
  id: "neutral",
  name: "Neutral",
  render(state: PlaybackState): ReactElement {
    const { connectionStatus, queue } = state;
    return (
      <div data-skin="neutral">
        <header data-testid="connection-status">
          <span data-testid="connection-label">{connectionStatus}</span>
        </header>

        {state.currentTrack ? (
          <CurrentTrack state={state} />
        ) : (
          <p data-testid="no-track">Nothing playing right now.</p>
        )}

        {queue.length > 0 && (
          <section aria-label="Up next">
            <h2>Up next ({queue.length})</h2>
            <ul data-testid="queue">
              {queue.map((track) => (
                <QueueRow key={track.videoId} track={track} />
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  },
};
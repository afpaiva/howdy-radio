/**
 * /client/src/skins/neutral/index.tsx
 *
 * Neutral skin — clean, structured styling using the global design system
 * (docs/frontend_scope/DESIGN_DIRECTIONS.md). Uses the overall fonts,
 * colors, bento panels, pill badges, and soft shadows without strong theming.
 */

import type { ReactElement } from "react";
import type { PlaybackState, Skin, Track } from "../types";
import "./neutral.css";

/** Format a whole-second duration as `M:SS`. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Render a single queued track as a styled list row. */
function QueueRow({ track, index }: { track: Track; index: number }): ReactElement {
  return (
    <li
      className="neutral-queue-item"
      data-testid="queue-item"
      data-ad={track.isAd ? "true" : "false"}
    >
      <span className="neutral-queue-index">{index + 1}</span>
      <div className="neutral-queue-info">
        <h3 className="neutral-queue-item-title">{track.title}</h3>
        <div className="neutral-queue-item-meta">
          {track.isAd && <span className="neutral-queue-ad-badge">ad</span>}
          <span>posted by {track.postedBy.displayName}</span>
        </div>
      </div>
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
  const progressPercent = safeTrack.duration > 0
    ? Math.min(100, (position / safeTrack.duration) * 100)
    : 0;

  return (
    <section className="neutral-now-playing" data-testid="current-track" aria-label="Now playing">
      <div className="neutral-track-card">
        <h1 className="neutral-track-title" data-testid="track-title">{safeTrack.title}</h1>
        <div className="neutral-track-meta">
          <span className="neutral-track-poster" data-testid="posted-by">posted by {safeTrack.postedBy.displayName}</span>
          <span className="neutral-track-divider" aria-hidden="true">·</span>
          <span className={`neutral-play-state${isPlaying ? " neutral-play-state--playing" : " neutral-play-state--paused"}`} data-testid="play-state">
            <span className={`neutral-play-indicator${isPlaying ? " neutral-play-indicator--playing" : " neutral-play-indicator--paused"}`} aria-hidden="true" />
            {isPlaying ? "Playing" : "Paused"}
          </span>
        </div>
        <div className="neutral-track-progress">
          <div className="neutral-progress-bar" role="progressbar" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100} aria-label="Playback progress">
            <div className="neutral-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="neutral-progress-time" data-testid="position">{progress}</span>
        </div>
        <a
          className="neutral-track-link"
          data-testid="track-link"
          href={safeTrack.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on YouTube
        </a>
      </div>
    </section>
  );
}

/** The neutral skin object, conforming to the `Skin` contract. */
export const neutralSkin: Skin = {
  id: "neutral",
  name: "Neutral",
  render(state: PlaybackState): ReactElement {
    const { connectionStatus, queue } = state;

    // Connection status dot variant
    const statusVariant = connectionStatus === "connected"
      ? "connected"
      : connectionStatus === "connecting"
        ? "connecting"
        : "disconnected";

    return (
      <div className="neutral-skin" data-skin="neutral">
        <header className="neutral-connection" data-testid="connection-status">
          <span className="neutral-connection-label">Status</span>
          <div className="neutral-connection-status">
            <span className={`neutral-status-dot neutral-status-dot--${statusVariant}`} aria-hidden="true" />
            <span data-testid="connection-label">{connectionStatus}</span>
          </div>
        </header>

        {state.currentTrack ? (
          <CurrentTrack state={state} />
        ) : (
          <div className="neutral-empty" data-testid="no-track">
            <div className="neutral-empty-icon" aria-hidden="true">♪</div>
            <h2 className="neutral-empty-title">Nothing playing right now</h2>
            <p className="neutral-empty-text">Tune in and wait for the next track to start.</p>
          </div>
        )}

        {queue.length > 0 && (
          <section className="neutral-queue" aria-label="Up next">
            <div className="neutral-queue-header">
              <h2 className="neutral-queue-title">Up next</h2>
              <span className="neutral-queue-count">{queue.length}</span>
            </div>
            <ul className="neutral-queue-list" data-testid="queue">
              {queue.map((track, i) => (
                <QueueRow
                  key={`${track.videoId}-${i}`}
                  track={track}
                  index={i}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  },
};
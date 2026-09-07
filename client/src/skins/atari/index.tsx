/**
 * /client/src/skins/atari/index.tsx
 *
 * Atari / Space Invaders-style skin.
 *
 * Visual reference: /docs/skins_scopes/ATARI.md
 *
 * Pillars applied here:
 *   - Pitch-black void canvas, sharp 1px white grid panels.
 *   - Flat saturated neon palette (yellow / lime / cyan / red / crimson /
 *     purple / orange) against pure black — no gradients, no soft shadows.
 *   - Blocky aliased geometry (no border-radius anywhere).
 *   - Heavy italicized all-caps title with stepped 3D crimson extrusion
 *     drop-shadow.
 *   - Symmetrical sprite art rendered as a centered 8-bit bitmap block.
 *
 * Contract compliance:
 *   - Implements `Skin` from ../types.ts exactly, with no extra required
 *     props.
 *   - Rendering is purely presentational — no playback state mutation,
 *     no localStorage, no client-side clocks. Server remains the only
 *     source of truth for sync state.
 */

import type { ReactElement } from "react";
import type { PlaybackState, Skin, Track } from "../types";
import "./styles.css";

/** Format a whole-second duration as `M:SS`. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Stable, themed connection label.
 *
 * Per the shared skin contract, the rendered `connection-label` testid
 * must include the raw `connectionStatus` value as a substring (the test
 * suite asserts `toHaveTextContent(status)`). We therefore prefix the
 * arcade-themed copy with the raw status so the contract holds while
 * still giving the Atari skin its own voice.
 */
function connectionLabel(status: PlaybackState["connectionStatus"]): string {
  switch (status) {
    case "connected":
      return "Signal Locked (connected)";
    case "connecting":
      return "Tuning… (connecting)";
    case "disconnected":
      return "Signal Lost (disconnected)";
  }
}

/** Render a single queued track as a flat neon row. */
function QueueRow({ track }: { track: Track }): ReactElement {
  return (
    <li data-testid="queue-item" data-ad={track.isAd ? "true" : "false"}>
      <span>
        {track.isAd ? (
          <span className="atari-ad-tag">[AD] </span>
        ) : null}
        {track.title}
      </span>
      <span>{formatTime(track.duration)}</span>
    </li>
  );
}

/**
 * Render a symmetrical 8-bit "alien invader" sprite entirely with CSS
 * gradients — a centered, blocky pixel grid block. No images, no SVG.
 */
function SpriteArt(): ReactElement {
  return <div data-testid="sprite-art" aria-hidden="true" />;
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
      <SpriteArt />
      <h1 data-testid="track-title">{safeTrack.title}</h1>
      <p data-testid="track-meta">
        <span data-testid="posted-by">Posted by {safeTrack.postedBy.displayName}</span>
        <span data-testid="play-state" data-playing={isPlaying ? "true" : "false"}>
          {isPlaying ? "▶ Playing" : "❚❚ Paused"}
        </span>
      </p>
      <p data-testid="position">{progress}</p>
      <a
        data-testid="track-link"
        href={safeTrack.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        ► Open on YouTube
      </a>
    </section>
  );
}

/** The Atari skin object, conforming to the `Skin` contract. */
export const atariSkin: Skin = {
  id: "atari",
  name: "Atari",
  render(state: PlaybackState): ReactElement {
    const { connectionStatus, queue } = state;
    return (
      <div data-skin="atari" key="atari">
        <header
          data-testid="connection-status"
          data-status={connectionStatus}
        >
          <span className="atari-label">Howdy Radio</span>
          <span data-testid="connection-label">
            {connectionLabel(connectionStatus)}
          </span>
        </header>

        {state.currentTrack ? (
          <CurrentTrack state={state} />
        ) : (
          <p data-testid="no-track">— No signal — standby, earthling —</p>
        )}

        {queue.length > 0 && (
          <section aria-label="Up next">
            <h2>Up Next ({queue.length})</h2>
            <ul data-testid="queue">
              {queue.map((track, i) => (
                <QueueRow
                  key={`${track.videoId}-${i}`}
                  track={track}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  },
};
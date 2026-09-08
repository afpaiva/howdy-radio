/**
 * /client/src/skins/walkman/index.tsx
 *
 * Classic Sony Walkman skin — late-1970s/1980s industrial consumer
 * electronics aesthetic (see docs/skins_scopes/WALKMAN.md).
 *
 * Visual elements:
 *   - Dual-tone blocky chassis: brushed-aluminum top plate over a
 *     metallic pacific blue body.
 *   - Recessed cassette window showing two sprockets and a tape label.
 *   - Vertical white "SONY" / "WALKMAN" branding printed on the edges.
 *   - Hollow white left-arrow functional indicator.
 *   - Matte-black transport buttons flanking a chunky orange
 *     play/pause toggle (the iconic safety-orange accent).
 *   - Mechanical-style tape-counter readout for position.
 *   - LED-style connection status indicator.
 *
 * Implements the shared `Skin` contract from `../types.ts` exactly —
 * no skin-specific required props.
 *
 * Per SPEC.md (Skin System): the playlist itself is never shown.
 * Per client/AGENTS.md rule #3: confined to this directory, no cross-skin
 * imports. Styles are scoped under `.walkman-skin` so nothing leaks.
 */

import type { ReactElement } from "react";
import type { PlaybackState, Skin, Track } from "../types";
import "./styles.css";

/* ──────────────────────── formatting helpers ─────────────────────── */

/** Format a whole-second duration as `M:SS`, mirroring the neutral skin. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Convert a position in seconds to a 3-digit mechanical counter value. */
function counterValue(position: number): string {
  // Clamp non-finite / negative input to 0 — the contract guarantees the
  // position readout never renders NaN. Visual value is otherwise
  // unchanged: map seconds onto a 0–999 range, proportional to 5 minutes
  // (typical cassette side length). For longer tracks it caps at 999,
  // evoking the way real mechanical counters simply rolled over.
  const safe = Number.isFinite(position) && position > 0 ? position : 0;
  const minutes = safe / 60;
  const v = Math.floor((minutes / 5) * 999) % 1000;
  return String(v).padStart(3, "0");
}

/* ──────────────────────── presentational atoms ───────────────────── */

/**
 * Hollow white left-arrow graphic — the spec's "functional indicator"
 * printed directly onto the faceplate.
 */
function ArrowGlyph(): ReactElement {
  return (
    <svg
      className="walkman-arrow"
      viewBox="0 0 56 22"
      role="presentation"
      aria-hidden="true"
    >
      <polyline
        points="40,3 14,11 40,19"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

/** A matte-black transport button with an inline SVG glyph. */
function TransportButton({
  glyph,
  label,
}: {
  glyph: ReactElement;
  label: string;
}): ReactElement {
  return (
    <button
      type="button"
      className="walkman-button"
      aria-label={label}
      tabIndex={-1}
    >
      {glyph}
    </button>
  );
}

/** Rewind glyph (two left-pointing triangles). */
function RewindGlyph(): ReactElement {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      <polygon points="9,1 1,7 9,13" fill="#ffffff" />
      <polygon points="15,1 7,7 15,13" fill="#ffffff" />
    </svg>
  );
}

/** Fast-forward glyph (two right-pointing triangles). */
function ForwardGlyph(): ReactElement {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      <polygon points="1,1 9,7 1,13" fill="#ffffff" />
      <polygon points="7,1 15,7 7,13" fill="#ffffff" />
    </svg>
  );
}

/* ──────────────────────── chassis sub-components ─────────────────── */

/**
 * Brushed-aluminum top plate with a recessed cassette window.
 * Renders two animated tape reels that spin while `isPlaying` is true
 * and pause when idle/paused, behind the existing sprockets and label.
 * Purely presentational — no playback data beyond the play/pause state.
 */
function TopPlate({ isPlaying }: { isPlaying: boolean }): ReactElement {
  const spinState = isPlaying ? "true" : "false";
  return (
    <div className="walkman-top-plate">
      <div className="walkman-window-frame">
        <div
          className="walkman-window"
          role="img"
          aria-label="Cassette tape window"
        >
          {/* Animated tape reels — sit behind the sprockets and label. */}
          <div
            className="walkman-reel walkman-reel--left"
            data-spinning={spinState}
            aria-hidden="true"
          />
          <div
            className="walkman-reel walkman-reel--right"
            data-spinning={spinState}
            aria-hidden="true"
          />
          <div className="walkman-sprocket walkman-sprocket--left" />
          <div className="walkman-sprocket walkman-sprocket--right" />
          <div className="walkman-tape-label" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

/** The blue faceplate with its printed branding and arrow glyph. */
function Faceplate({
  arrow,
  children,
}: {
  arrow: ReactElement;
  children: ReactElement;
}): ReactElement {
  return (
    <div className="walkman-faceplate">
      <span className="walkman-brand-sony" aria-label="Sony">
        SONY
      </span>
      <span className="walkman-brand-walkman" aria-label="Walkman">
        WALKMAN
      </span>
      {arrow}
      {children}
    </div>
  );
}

/* ──────────────────────── connection LED ─────────────────────────── */

function ConnectionStatus({
  status,
}: {
  status: PlaybackState["connectionStatus"];
}): ReactElement {
  // The shared Skin contract requires `connection-label` to surface the
  // raw status value as its text content (the test suite asserts the
  // label text matches the status string verbatim). The walkman keeps
  // its 1980s theming via the LED color class and an accessible label,
  // while the visible label text itself is the status string.
  return (
    <div
      className="walkman-status"
      data-testid="connection-status"
      data-connection={status}
    >
      <span
        className={`walkman-led walkman-led--${status}`}
        aria-hidden="true"
      />
      <span data-testid="connection-label">{status}</span>
    </div>
  );
}

/* ──────────────────────── now-playing body ───────────────────────── */

function NowPlaying({ track }: { track: Track }): ReactElement {
  return (
    <div className="walkman-track" data-testid="current-track">
      <h1 className="walkman-track-title" data-testid="track-title">
        {track.title}
      </h1>
      <p className="walkman-track-meta" data-testid="track-meta">
        <span data-testid="posted-by">Posted by {track.postedBy.displayName}</span>
      </p>
    </div>
  );
}

function Controls({
  isPlaying,
}: {
  isPlaying: boolean;
}): ReactElement {
  return (
    <div
      className="walkman-controls"
      data-testid="play-state"
      data-playing={isPlaying}
    >
      <TransportButton glyph={<RewindGlyph />} label="Rewind" />
      <div
        className="walkman-toggle"
        data-playing={isPlaying ? "true" : "false"}
        role="img"
        aria-label={isPlaying ? "Playing" : "Paused"}
      >
        <div className="walkman-toggle-knob" />
      </div>
      <TransportButton glyph={<ForwardGlyph />} label="Fast forward" />
      {/* The shared Skin contract requires `play-state` to surface
          "Playing" / "Paused" as text content. Keep a screen-reader-only
          copy so the visual transport row is unchanged. */}
      <span className="walkman-visually-hidden">
        {isPlaying ? "Playing" : "Paused"}
      </span>
    </div>
  );
}

function PositionReadout({
  position,
  duration,
}: {
  position: number;
  duration: number;
}): ReactElement {
  return (
    <div className="walkman-position" data-testid="position">
      <span className="walkman-counter" data-testid="position-counter">
        {counterValue(position)}
      </span>
      <span className="walkman-position-divider">·</span>
      <span data-testid="position-text">
        {formatTime(position)} / {formatTime(duration)}
      </span>
    </div>
  );
}

/* ──────────────────────── up-next list ───────────────────────────── */

/**
 * Compact "up next" list. The shared Skin contract requires a `queue`
 * container with one `queue-item` per upcoming entry, each carrying
 * `data-ad="true"|"false"`. The walkman keeps its industrial vibe with
 * a small etched panel — purely presentational copy, the contract
 * testids are the only structural requirement.
 */
function Queue({ queue }: { queue: PlaybackState["queue"] }): ReactElement {
  return (
    <ol className="walkman-queue" data-testid="queue" aria-label="Up next">
      {queue.map((track, i) => (
        <li
          key={`${track.videoId}-${i}`}
          className="walkman-queue-item"
          data-testid="queue-item"
          data-ad={track.isAd ? "true" : "false"}
        >
          <span className="walkman-queue-title">{track.title}</span>
        </li>
      ))}
    </ol>
  );
}

/* ──────────────────────── main skin object ───────────────────────── */

/** The walkman skin object, conforming to the `Skin` contract. */
export const walkmanSkin: Skin = {
  id: "walkman",
  name: "Walkman",
  render(state: PlaybackState): ReactElement {
    const { currentTrack, position, isPlaying, connectionStatus, queue } =
      state;

    const trackBody: ReactElement = currentTrack ? (
      <>
        <NowPlaying track={currentTrack} />
        <Controls isPlaying={isPlaying} />
        <PositionReadout position={position} duration={currentTrack.duration} />
        <a
          className="walkman-source"
          data-testid="track-link"
          href={currentTrack.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open on YouTube ↗
        </a>
      </>
    ) : (
      <p className="walkman-idle" data-testid="no-track">
        Insert a cassette
      </p>
    );

    return (
      <div className="walkman-skin" data-skin="walkman" key="walkman">
        <div className="walkman-chassis">
          <TopPlate isPlaying={isPlaying} />
          <Faceplate arrow={<ArrowGlyph />}>{trackBody}</Faceplate>
        </div>
        <ConnectionStatus status={connectionStatus} />
        {queue.length > 0 && <Queue queue={queue} />}
      </div>
    );
  },
};
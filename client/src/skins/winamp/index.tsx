/**
 * /client/src/skins/winamp/index.tsx
 *
 * Winamp skin.
 *
 * Implements the early-2000s "industrial-meets-skeuomorphic" aesthetic
 * described in `docs/skins_scopes/WINAMP.md`. The interface is rendered
 * as a stack of beveled rectangular modules with:
 *     - textured, dark grey / desaturated indigo "chassis" frames
 *     - recessed title bars with screen-printed off-white text
 *     - inset, deep-black VFD/LED display panes
 *     - neon/lime green pixelated display text
 *     - tarnished-brass-yellow fader handles
 *
 * Per SPEC.md ("The playlist itself is never shown in the UI"), the
 * playlist-editor window described in the design doc is intentionally
 * omitted; only the player and equalizer modules are rendered. A small
 * "up next" readout is exposed via the queue testid to satisfy the
 * shared skin contract.
 *
 * The skin implements the shared `Skin` contract exactly — no skin-
 * specific required props — and never owns or computes playback state:
 * it only renders the {@link PlaybackState} handed to it.
 */

import type { ReactElement, ReactNode } from "react";
import type { PlaybackState, Skin, Track } from "../types";
import "./styles.css";

/* ──────────────────────── Formatting helpers ──────────────────────── */

/** Format a whole-second duration as `M:SS`. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format seconds as `MM:SS:SS` clock string (Winamp clock style). */
function formatClock(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();
  const hh = String(((h + 11) % 12) + 1).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Human-readable label for a connection status (matches the contract). */
function connectionLabel(status: PlaybackState["connectionStatus"]): string {
  return status;
}

/** Capitalize the first letter (e.g. "playing" -> "Playing"). */
function titleCase(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/* ──────────────────────── Sub-components ─────────────────────────── */

/** Recessed title bar used at the top of every module. */
function TitleBar({ text }: { text: string }): ReactElement {
  return (
    <div className="winamp-titlebar">
      <span className="winamp-titlebar-text">{text}</span>
    </div>
  );
}

/** Recessed black VFD/LED display pane with neon-green text. */
function Display({
  children,
  variant,
  testId,
}: {
  children: ReactNode;
  variant?: "orange" | "indigo";
  testId?: string;
}): ReactElement {
  const cls = [
    "winamp-display",
    variant === "orange" && "winamp-display-orange",
    variant === "indigo" && "winamp-display-indigo",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} data-testid={testId}>
      <div className="winamp-display-text">{children}</div>
    </div>
  );
}

/**
 * Position display: shows the contract-required `M:SS / M:SS` text inside
 * a `data-testid="position"` element, while also rendering the segmented
 * LED progress bar beneath.
 */
function PositionBlock({
  position,
  duration,
}: {
  position: number;
  duration: number;
}): ReactElement {
  const total = 20;
  const filled =
    duration > 0
      ? Math.min(total, Math.floor((position / duration) * total))
      : 0;
  const text = `${formatTime(position)} / ${formatTime(duration)}`;
  return (
    <div className="winamp-position-block">
      <div
        className="winamp-progress"
        aria-hidden="true"
      >
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={
              "winamp-progress-seg" +
              (i < filled ? " winamp-progress-seg-on" : "")
            }
          />
        ))}
      </div>
      {/* Contract-required position text. The visual time readout still
          lives in the indigo display below; this hidden span carries the
          exact M:SS / M:SS text for the contract test. */}
      <span data-testid="position" className="winamp-position-text">
        {text}
      </span>
    </div>
  );
}

/** Equalizer spectrum visualizer — synthetic bars driven by isPlaying. */
function EqualizerSpectrum({
  isPlaying,
}: {
  isPlaying: boolean;
}): ReactElement {
  // 14 bands, each with a synthetic 16-segment height driven by index +
  // a pseudo-random factor. Stable across re-renders of the same tick.
  const bands = 14;
  const segs = 16;
  const bandsArr = Array.from({ length: bands }, (_, i) => {
    // Center-weighted pattern so middle bands are taller (V-shape in EQ).
    const centerWeight = 1 - Math.abs(i - bands / 2) / (bands / 2);
    const seed = (i * 9301 + 49297) % 233280;
    const rand = seed / 233280;
    const base = isPlaying ? centerWeight * 0.6 + rand * 0.4 : 0.05;
    return Math.max(1, Math.floor(base * segs));
  });

  return (
    <div className="winamp-eq-bands" data-testid="spectrum">
      {bandsArr.map((filled, i) => (
        <div key={i} className="winamp-eq-band" aria-hidden="true">
          {Array.from({ length: segs }, (_, j) => {
            const isOn = j < filled;
            const isPeak = j === filled - 1 && isOn && i % 3 === 0;
            const cls = isPeak
              ? "winamp-eq-seg winamp-eq-seg-peak"
              : isOn
                ? "winamp-eq-seg winamp-eq-seg-on"
                : "winamp-eq-seg";
            return <div key={j} className={cls} />;
          })}
        </div>
      ))}
    </div>
  );
}

/** Equalizer fader column: a recessed rail with a brass handle. */
function Fader({
  label,
  position,
}: {
  label: string;
  position: number; // 0 (bottom) .. 1 (top)
}): ReactElement {
  const clamped = Math.max(0, Math.min(1, position));
  return (
    <div className="winamp-eq-fader">
      <div className="winamp-eq-fader-rail" aria-hidden="true">
        <div
          className="winamp-eq-fader-handle"
          style={{ top: `${(1 - clamped) * 100}%` }}
        />
      </div>
      <span className="winamp-eq-fader-label">{label}</span>
    </div>
  );
}

/** Marquee-scrolling track title in the orange display. */
function MarqueeText({ text }: { text: string }): ReactElement {
  // Repeat the text so the marquee has something to scroll through even
  // for short titles. CSS animation handles the loop.
  const repeated = `${text}   •   ${text}   •   ${text}   •   `;
  return (
    <div className="winamp-marquee">
      <span className="winamp-marquee-text">{repeated}</span>
    </div>
  );
}

/* ──────────────────────── Connection status ───────────────────────── */

/**
 * Connection status panel.
 *
 * Contract requires:
 *   - always renders a `data-testid="connection-status"` element
 *   - always renders a `data-testid="connection-label"` element whose
 *     text content matches the connectionStatus value (e.g. "connected")
 */
function ConnectionStatusPanel({
  status,
}: {
  status: PlaybackState["connectionStatus"];
}): ReactElement {
  const labelText = connectionLabel(status);
  // Visual glyph: filled circle for connected, half for connecting, empty
  // for disconnected. Decorative only — the contract reads from the label.
  const glyph =
    status === "connected" ? "●" : status === "connecting" ? "◐" : "○";
  return (
    <div className="winamp-connection" data-testid="connection-status">
      <span className="winamp-connection-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span data-testid="connection-label" className="winamp-connection-label">
        {labelText}
      </span>
    </div>
  );
}

/* ──────────────────────── Now-playing block ───────────────────────── */

/**
 * Renders the full "now playing" block required by the skin contract.
 *
 * Wrapped in `data-testid="current-track"` and includes the canonical
 * `track-title`, `posted-by`, `play-state`, `position`, `track-link`
 * testids with text content matching the contract assertions.
 */
function NowPlaying({ state }: { state: PlaybackState }): ReactElement {
  const { currentTrack, position, isPlaying } = state;
  // Caller guarantees currentTrack is non-null when this renders.
  const safeTrack = currentTrack as Track;
  const duration = safeTrack.duration;
  const time = `${formatTime(position)} / ${formatTime(duration)}`;

  return (
    <div className="winamp-module winamp-now-playing" data-testid="current-track">
      <TitleBar text="Winamp" />

      {/* Top metadata line: bitrate / kHz / stereo */}
      <div className="winamp-meta-row">
        <span className={isPlaying ? "winamp-meta-on" : ""}>128</span>
        <span>kbps</span>
        <span>44</span>
        <span>kHz</span>
        <span className={isPlaying ? "winamp-meta-on" : ""}>STEREO</span>
      </div>

      {/* Track title — orange display, scrolling marquee.
          The h1 with data-testid="track-title" carries the canonical
          title text for the contract test. */}
      <Display variant="orange" testId="track-title-display">
        <h1 data-testid="track-title" className="winamp-track-title-hidden">
          {safeTrack.title}
        </h1>
        <MarqueeText text={safeTrack.title} />
      </Display>

      {/* Segmented LED progress bar + contract `position` text */}
      <PositionBlock position={position} duration={duration} />

      {/* Clock / position time display (visual readout only — the
          contract's M:SS / M:SS text is in the `position` testid above) */}
      <Display variant="indigo" testId="clock">
        <span className="winamp-display-text-dim">{time}</span>
      </Display>

      {/* Controls row — purely cosmetic (skin-only; no playback logic) */}
      <div className="winamp-controls">
        <button className="winamp-btn" type="button" aria-label="Previous">
          |◀
        </button>
        <button className="winamp-btn" type="button" aria-label="Play">
          ▶
        </button>
        <button className="winamp-btn" type="button" aria-label="Pause">
          ❚❚
        </button>
        <button className="winamp-btn" type="button" aria-label="Stop">
          ■
        </button>
        <button className="winamp-btn" type="button" aria-label="Next">
          ▶|
        </button>
        {/* Contract requires the literal "Playing" / "Paused" text. */}
        <span
          className="winamp-playstate"
          data-testid="play-state"
          aria-label="Playback state"
        >
          {titleCase(isPlaying ? "playing" : "paused")}
        </span>
        <span className="winamp-playstate" aria-hidden="true">
          {isPlaying ? "PLAY" : "PAUSE"}
        </span>
      </div>

      {/* Source link & posted-by — required by SPEC.md */}
      <div className="winamp-meta-row">
        <span data-testid="posted-by" className="winamp-meta-on">
          posted by {safeTrack.postedBy.displayName}
        </span>
        <a
          data-testid="track-link"
          href={safeTrack.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--winamp-display-green)" }}
        >
          source ↗
        </a>
      </div>
    </div>
  );
}

/** Renders the idle "no track" block when currentTrack is null. */
function NoTrack(): ReactElement {
  return (
    <div className="winamp-module winamp-no-track-module">
      <TitleBar text="Winamp" />

      <div className="winamp-meta-row">
        <span className="winamp-meta-on">000</span>
        <span>kbps</span>
        <span>00</span>
        <span>kHz</span>
        <span className="winamp-meta-on">MONO</span>
      </div>

      <Display variant="orange" testId="track-title-display">
        <span className="winamp-display-text-dim">
          Winamp — Nothing playing
        </span>
      </Display>

      <Display variant="indigo" testId="clock">
        <span className="winamp-display-text-dim">
          {formatClock(new Date())}
        </span>
      </Display>

      <p className="winamp-idle" data-testid="no-track">
        — Broadcast idle — awaiting transmission —
      </p>
    </div>
  );
}

/* ──────────────────────── Equalizer module ────────────────────────── */

function Equalizer({ state }: { state: PlaybackState }): ReactElement {
  const { isPlaying } = state;
  // Fixed EQ band labels — purely decorative per the design doc.
  const labels = ["60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K"];
  // Slight V-shape pattern for the fader positions.
  return (
    <div className="winamp-module" data-testid="equalizer">
      <TitleBar text="Winamp Equalizer" />

      <EqualizerSpectrum isPlaying={isPlaying} />

      <div className="winamp-eq-faders">
        {labels.map((label, i) => {
          const v = Math.abs(i - (labels.length - 1) / 2);
          const max = (labels.length - 1) / 2;
          // V-shape: middle faders higher than edges.
          const position = 0.4 + ((max - v) / max) * 0.5;
          return <Fader key={i} label={label} position={position} />;
        })}
      </div>
    </div>
  );
}

/* ──────────────────────── Queue list ───────────────────────────────── */

/** A small "up next" readout displayed in a recessed VFD pane. */
function QueueList({ queue }: { queue: Track[] }): ReactElement | null {
  if (queue.length === 0) return null;
  return (
    <div className="winamp-module winamp-queue">
      <TitleBar text="Up Next" />
      <ul data-testid="queue" className="winamp-queue-list">
         {queue.map((track, i) => (
          <li
            key={`${track.videoId}-${i}`}
            data-testid="queue-item"
            data-ad={track.isAd ? "true" : "false"}
            className={
              "winamp-queue-item" +
              (track.isAd ? " winamp-queue-item-ad" : "")
            }
          >
            {track.isAd ? "[ad] " : ""}
            {track.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ──────────────────────── Skin contract ──────────────────────────── */

/** The Winamp skin object, conforming to the `Skin` contract. */
export const winampSkin: Skin = {
  id: "winamp",
  name: "Winamp",
  render(state: PlaybackState): ReactElement {
    const { connectionStatus, currentTrack, queue } = state;
    return (
      <div className="winamp-skin" data-skin="winamp" key="winamp">
        <ConnectionStatusPanel status={connectionStatus} />

        {currentTrack ? (
          <NowPlaying state={state} />
        ) : (
          <NoTrack />
        )}

        <Equalizer state={state} />

        <QueueList queue={queue} />
      </div>
    );
  },
};

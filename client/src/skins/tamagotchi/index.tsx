/**
 * /client/src/skins/tamagotchi/index.tsx
 *
 * Tamagotchi skin.
 *
 * Visual direction (per docs/skins_scopes/TAMAGOTCHI.md):
 *   - Late-1990s handheld virtual-pet hardware.
 *   - Smooth egg-shaped plastic shell (sky-blue body, magenta/yellow
 *     Memphis-pop graphics, jagged starburst screen bezel).
 *   - Inset square monochrome LCD window with an olive-yellow tint,
 *     a faint wavy "screen-print" pattern, and light-grey fixed icon
 *     strips at the top and bottom.
 *   - Coarse black-on-olive pixel-art sprites and hand-doodled icon
 *     outlines — no antialiasing, no greys.
 *
 * Implements the shared `Skin` contract from `../types.ts` exactly,
 * with no skin-specific required props.
 */

import type { CSSProperties, ReactElement } from "react";
import type { PlaybackState, Skin, Track } from "../types";
import "./styles.css";

/* ───────────────────────────── Tokens ───────────────────────────── */

/** Plastic toy palette (see docs/skins_scopes/TAMAGOTCHI.md §4). */
const PALETTE = {
  shellSky: "#2DBAEB",        // Sky Blue
  shellSkyDeep: "#1F9BC4",    // shadow side of the shell
  shellPink: "#D61380",       // Magenta / Hot Pink (bezel + accents)
  shellPinkDeep: "#A60E64",   // shadow side of the bezel
  shellYellow: "#FCE013",     // Bright Yellow (lightning + accents)
  shellWhite: "#FBF7EE",      // plastic highlight
  screenGlassLight: "#E1E897",
  screenGlass: "#C5CE73",     // unlit LCD background
  screenGlassDeep: "#9DA84E", // wavy pattern lines
  iconStrip: "#B7B7A8",       // fixed top/bottom icon strips
  pixelBlack: "#000000",
} as const;

/* ───────────────────────────── Helpers ───────────────────────────── */

/** Whole-second duration → `M:SS`. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Poster label for the LCD. The wire adapter currently supplies
 * `postedBy` as a string; the Skin Track type still describes an object.
 * Accept both so a live broadcast cannot crash the skin.
 */
function postedByName(postedBy: Track["postedBy"] | string | undefined): string {
  if (typeof postedBy === "string" && postedBy.length > 0) return postedBy;
  if (postedBy && typeof postedBy === "object") {
    const name = postedBy.displayName || postedBy.realName || postedBy.id;
    if (name) return name;
  }
  return "unknown";
}

/**
 * Build the 90s handheld-pet sprite:
 *  - Big rounded head with droopy ears (when idle)
 *  - Mouth opens/closes with the play/pause state
 *  - Eyes blink by frame index
 *
 * Rendered as inline SVG so each "pixel" is a sharp `<rect>`, no
 * antialiasing — matches the LCD aesthetic exactly.
 */
function PetSprite({
  isPlaying,
  blink,
}: {
  isPlaying: boolean;
  blink: boolean;
}): ReactElement {
  // 24×24 logical pixel grid; "pixelSize" scales the sprite.
  const P = 4; // logical pixel size
  const W = 24;
  const H = 24;

  type Cell = [number, number];
  const head: Cell[] = [
    // rounded outline
    [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2],
    [4, 3], [5, 3], [18, 3], [19, 3],
    [3, 4], [20, 4],
    [2, 5], [21, 5],
    [2, 6], [21, 6],
    [1, 7], [22, 7],
    [1, 8], [22, 8],
    [1, 9], [22, 9],
    [1, 10], [22, 10],
    [1, 11], [22, 11],
    [1, 12], [22, 12],
    [2, 13], [21, 13],
    [2, 14], [21, 14],
    [3, 15], [20, 15],
    [4, 16], [5, 16], [18, 16], [19, 16],
    [6, 17], [7, 17], [8, 17], [9, 17], [10, 17], [11, 17], [12, 17], [13, 17], [14, 17], [15, 17], [16, 17], [17, 17],
  ];

  // Ears (droopy ovals)
  const ears: Cell[] = [
    [3, 3], [4, 3], [3, 4], [4, 4],
    [5, 5], [4, 5],
    [19, 3], [20, 3], [19, 4], [20, 4],
    [18, 5], [19, 5],
  ];

  // Cheek dots
  const cheeks: Cell[] = [
    [5, 12], [18, 12],
  ];

  // Eyes (square dots). When blinking, a single line of pixels per eye.
  const eyes: Cell[] = blink
    ? [
        [7, 8], [8, 8], [9, 8],
        [14, 8], [15, 8], [16, 8],
      ]
    : [
        [7, 7], [8, 7], [9, 7],
        [14, 7], [15, 7], [16, 7],
      ];

  // Mouth: open when playing, closed when paused.
  const mouth: Cell[] = isPlaying
    ? [
        [9, 13], [10, 13], [11, 13], [12, 13], [13, 13], [14, 13],
        [9, 14], [14, 14],
        [9, 15], [14, 15],
        [10, 16], [11, 16], [12, 16], [13, 16],
      ]
    : [
        [10, 14], [11, 14], [12, 14], [13, 14],
      ];

  const cells: Cell[] = [...head, ...ears, ...eyes, ...mouth, ...cheeks];

  return (
    <svg
      viewBox={`0 0 ${W * P} ${H * P}`}
      width={W * P}
      height={H * P}
      shapeRendering="crispEdges"
      role="img"
      aria-label={isPlaying ? "Pet singing" : "Pet resting"}
    >
      {cells.map(([x, y], i) => (
        <rect
          key={i}
          x={x * P}
          y={y * P}
          width={P}
          height={P}
          fill={PALETTE.pixelBlack}
        />
      ))}
    </svg>
  );
}

/**
 * Decorative "wavy" pattern printed on the LCD glass. Drawn as a few
 * low-contrast sine-ish paths so the screen reads as a passive-matrix
 * panel rather than a flat color.
 */
function LcdBackgroundPattern(): ReactElement {
  const stroke = PALETTE.screenGlassDeep;
  return (
    <svg
      className="tamagotchi-lcd-pattern"
      viewBox="0 0 200 200"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 40 Q 25 25 50 40 T 100 40 T 150 40 T 200 40"
        fill="none"
        stroke={stroke}
        strokeWidth="1.2"
        opacity="0.35"
      />
      <path
        d="M0 80 Q 25 65 50 80 T 100 80 T 150 80 T 200 80"
        fill="none"
        stroke={stroke}
        strokeWidth="1.2"
        opacity="0.3"
      />
      <path
        d="M0 120 Q 25 105 50 120 T 100 120 T 150 120 T 200 120"
        fill="none"
        stroke={stroke}
        strokeWidth="1.2"
        opacity="0.35"
      />
      <path
        d="M0 160 Q 25 145 50 160 T 100 160 T 150 160 T 200 160"
        fill="none"
        stroke={stroke}
        strokeWidth="1.2"
        opacity="0.3"
      />
    </svg>
  );
}

/**
 * Hand-doodled pixel-outline status icons. Each icon is a tiny 7×7
 * monochrome line drawing — matches the "thin, hand-doodled pixel
 * outlines" described in the spec.
 */
type IconName = "feed" | "light" | "play" | "medicine" | "bathroom" | "status" | "discipline" | "attention";

function StatusIcon({ name }: { name: IconName }): ReactElement {
  const fill = PALETTE.pixelBlack;
  // Each path is rendered as filled rect "pixels" via tiny SVG rects.
  const P = 1;
  const W = 7;
  const H = 7;
  const cells: [number, number][] = (() => {
    switch (name) {
      case "feed": // little bowl with a crumb
        return [
          [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
          [1, 3], [5, 3],
          [1, 4], [5, 4],
          [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5],
          [3, 0], [4, 0],
          [3, 1], [4, 1],
        ];
      case "light": // sun
        return [
          [3, 1],
          [1, 2], [5, 2],
          [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
          [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4],
          [1, 5], [5, 5],
          [3, 6],
        ];
      case "play": // triangle
        return [
          [2, 1], [2, 2], [2, 3], [2, 4], [2, 5],
          [3, 2], [3, 3], [3, 4],
          [4, 3],
        ];
      case "medicine": // cross
        return [
          [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6],
          [1, 3], [2, 3], [4, 3], [5, 3],
        ];
      case "bathroom": // drop / toilet-ish
        return [
          [3, 0], [2, 1], [4, 1], [1, 2], [5, 2],
          [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
          [2, 4], [3, 4], [4, 4],
          [3, 5],
        ];
      case "status": // bar chart
        return [
          [1, 5], [1, 4], [1, 3],
          [3, 5], [3, 4], [3, 3], [3, 2],
          [5, 5], [5, 4], [5, 3], [5, 2], [5, 1],
        ];
      case "discipline": // scroll / hand
        return [
          [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
          [0, 2], [6, 2],
          [1, 3], [5, 3],
          [2, 4], [4, 4],
          [3, 5],
        ];
      case "attention": // heart
        return [
          [1, 2], [2, 1], [3, 1], [4, 1], [5, 2],
          [1, 2], [1, 3], [2, 4], [3, 5], [4, 4], [5, 3], [5, 2],
        ];
    }
  })();

  return (
    <svg
      viewBox={`0 0 ${W * P} ${H * P}`}
      width={W * P + 2}
      height={H * P + 2}
      shapeRendering="crispEdges"
      role="img"
      aria-label={name}
    >
      {cells.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  );
}

/**
 * Jagged starburst polygon used as the screen-bezel border.
 *
 * The points are computed from a many-pointed "explosion" silhouette —
 * alternating long/short radii gives the toy-hardware look described
 * in the spec ("sharp, multi-pointed starburst or jagged polygon").
 */
function StarburstBezel(): ReactElement {
  const spikes = 18; // alternating long/short points
  const cx = 50;
  const cy = 50;
  const rLong = 49;
  const rShort = 45;
  let d = "";
  for (let i = 0; i <= spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? rLong : rShort;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    d += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  d += "Z";
  return (
    <svg
      className="tamagotchi-bezel"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d} fill={PALETTE.shellPink} />
      <path
        d={d}
        fill="none"
        stroke={PALETTE.shellPinkDeep}
        strokeWidth="0.8"
        opacity="0.6"
      />
    </svg>
  );
}

/** Decorative lightning-bolt + starburst graphics on the outer shell. */
function ShellDecor(): ReactElement {
  return (
    <svg
      className="tamagotchi-shell-decor"
      viewBox="0 0 200 280"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Left lightning bolt */}
      <path
        d="M30 60 L48 60 L36 92 L52 92 L20 150 L36 110 L20 110 Z"
        fill={PALETTE.shellYellow}
        stroke={PALETTE.shellPinkDeep}
        strokeWidth="1"
        strokeLinejoin="miter"
      />
      {/* Right lightning bolt */}
      <path
        d="M170 50 L152 50 L164 82 L148 82 L180 140 L164 100 L180 100 Z"
        fill={PALETTE.shellYellow}
        stroke={PALETTE.shellPinkDeep}
        strokeWidth="1"
        strokeLinejoin="miter"
      />
      {/* Top starburst */}
      <g transform="translate(100 24)">
        <polygon
          points="0,-10 3,-3 10,0 3,3 0,10 -3,3 -10,0 -3,-3"
          fill={PALETTE.shellPink}
        />
      </g>
      {/* Bottom starburst */}
      <g transform="translate(100 250)">
        <polygon
          points="0,-10 3,-3 10,0 3,3 0,10 -3,3 -10,0 -3,-3"
          fill={PALETTE.shellPink}
        />
      </g>
      {/* Small yellow stars */}
      <g fill={PALETTE.shellYellow} stroke={PALETTE.shellPinkDeep} strokeWidth="0.5">
        <polygon points="38,200 40,206 46,206 41,210 43,216 38,212 33,216 35,210 30,206 36,206" />
        <polygon points="162,200 164,206 170,206 165,210 167,216 162,212 157,216 159,210 154,206 160,206" />
      </g>
    </svg>
  );
}

/* ───────────────────────────── Pieces ───────────────────────────── */

function Bezel({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div className="tamagotchi-bezel-frame">
      <StarburstBezel />
      <div className="tamagotchi-screen">{children}</div>
    </div>
  );
}

function StatusBar({
  side,
  connectionStatus,
  isAd,
  blink,
}: {
  side: "top" | "bottom";
  connectionStatus: PlaybackState["connectionStatus"];
  isAd: boolean;
  blink: boolean;
}): ReactElement {
  const topIcons: IconName[] = ["feed", "light", "play", "medicine"];
  const bottomIcons: IconName[] = ["bathroom", "status", "discipline", "attention"];

  // Left-most icon doubles as a "signal" indicator: lit when connected.
  const signalLit = connectionStatus === "connected";
  const signalBlink = blink && connectionStatus !== "connected";

  const icons = side === "top" ? topIcons : bottomIcons;

  return (
    <div className={`tamagotchi-status tamagotchi-status-${side}`}>
      {/* Signal dot — first slot, "off" while blinking on disconnect */}
      <span
        className="tamagotchi-signal-dot"
        data-on={signalLit ? "true" : "false"}
        data-blink={signalBlink ? "true" : "false"}
        aria-label={`signal ${connectionStatus}`}
      />
      {icons.map((name, i) => (
        <StatusIcon key={i} name={name} />
      ))}
      {side === "bottom" && (
        <span
          className="tamagotchi-ad-flag"
          data-on={isAd ? "true" : "false"}
          aria-label={isAd ? "ad playing" : "music playing"}
        >
          {isAd ? "AD" : "TRK"}
        </span>
      )}
    </div>
  );
}

function CurrentTrackBlock({
  state,
  blink,
}: {
  state: PlaybackState;
  blink: boolean;
}): ReactElement {
  const { currentTrack, position, isPlaying, connectionStatus } = state;
  const safeTrack = currentTrack as Track;
  const progress = `${formatTime(position)} / ${formatTime(safeTrack.duration)}`;
  const title = safeTrack.title ?? "";
  const by = postedByName(safeTrack.postedBy);
  // Truncate so the title and poster fit the LCD.
  const shortTitle = title.length > 22 ? `${title.slice(0, 21)}…` : title;
  const shortBy = by.length > 12 ? `${by.slice(0, 11)}…` : by;

  return (
    <div className="tamagotchi-lcd-content" data-testid="current-track">
      <StatusBar
        side="top"
        connectionStatus={connectionStatus}
        isAd={safeTrack.isAd}
        blink={blink}
      />

      <div className="tamagotchi-screen-middle">
        <div className="tamagotchi-pet">
          <PetSprite isPlaying={isPlaying} blink={blink} />
        </div>

        <div className="tamagotchi-track-info">
          <div
            className="tamagotchi-title"
            data-testid="track-title"
            title={safeTrack.title}
          >
            {shortTitle}
          </div>
          <div className="tamagotchi-meta" data-testid="posted-by">
            @{shortBy}
          </div>
          <div className="tamagotchi-progress" data-testid="position">
            {progress}
          </div>
          <div className="tamagotchi-state" data-testid="play-state">
            {isPlaying ? "▶ Playing" : "❚❚ Paused"}
          </div>
          <a
            className="tamagotchi-link"
            data-testid="track-link"
            href={safeTrack.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            open on youtube →
          </a>
        </div>
      </div>

      <StatusBar
        side="bottom"
        connectionStatus={connectionStatus}
        isAd={safeTrack.isAd}
        blink={blink}
      />
    </div>
  );
}

function IdleBlock({
  connectionStatus,
  blink,
}: {
  connectionStatus: PlaybackState["connectionStatus"];
  blink: boolean;
}): ReactElement {
  return (
    <div className="tamagotchi-lcd-content">
      <StatusBar
        side="top"
        connectionStatus={connectionStatus}
        isAd={false}
        blink={blink}
      />
      <div className="tamagotchi-screen-middle">
        <div className="tamagotchi-pet">
          <PetSprite isPlaying={false} blink={blink} />
        </div>
        <div className="tamagotchi-track-info">
          <div className="tamagotchi-title" data-testid="no-track">
            … quiet airwaves …
          </div>
          <div className="tamagotchi-meta">awaiting broadcast</div>
        </div>
      </div>
      <StatusBar
        side="bottom"
        connectionStatus={connectionStatus}
        isAd={false}
        blink={blink}
      />
    </div>
  );
}

/* ───────────────────────────── Skin ───────────────────────────── */

/** The tamagotchi skin object, conforming to the `Skin` contract. */
export const tamagotchiSkin: Skin = {
  id: "tamagotchi",
  name: "Tamagotchi",
  render(state: PlaybackState): ReactElement {
    const { connectionStatus, currentTrack, queue } = state;

    // Blinking is purely presentational — does NOT touch playback sync
    // state (rule #1 in AGENTS.md: client is dumb). It only drives the
    // pet sprite / status-bar blink within a single render call.
    // Since `render` is called fresh on every state tick, we approximate
    // a blink by alternating on whether position crosses an integer.
    const tick = Math.floor(state.position * 2);
    const blink = tick % 2 === 0;

    const wrapperStyle: CSSProperties = {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      background:
        "repeating-linear-gradient(45deg, #f4f0e6 0 8px, #ece6d4 8px 16px)",
      minHeight: "100%",
      gap: "12px",
    };

    return (
      <div data-skin="tamagotchi" style={wrapperStyle} key="tamagotchi">
        {/* Connection status — surfaced as required by the shared skin
            contract. Rendered as a small pill above the toy so the
            observable testid exists without disturbing the LCD. */}
        <div
          className="tamagotchi-connection"
          data-testid="connection-status"
          aria-label="connection status"
        >
          <span className="tamagotchi-connection-dot" aria-hidden="true" />
          <span data-testid="connection-label">{connectionStatus}</span>
        </div>

        <div className="tamagotchi-shell" data-testid="tamagotchi-shell">
          <ShellDecor />

          <Bezel>
            <LcdBackgroundPattern />
            {currentTrack ? (
              <CurrentTrackBlock state={state} blink={blink} />
            ) : (
              <IdleBlock connectionStatus={connectionStatus} blink={blink} />
            )}
          </Bezel>

          {/* The three physical hardware buttons below the screen.
              They are decorative here — playback control lives on the
              server side, not in the skin. */}
          <div className="tamagotchi-buttons" aria-hidden="true">
            <div className="tamagotchi-button">
              <div className="tamagotchi-button-cap" />
            </div>
            <div className="tamagotchi-button">
              <div className="tamagotchi-button-cap" />
            </div>
            <div className="tamagotchi-button">
              <div className="tamagotchi-button-cap" />
            </div>
          </div>

          <div className="tamagotchi-brand" aria-hidden="true">
            howdy·gotchi
          </div>
        </div>

        {/* Queue — required by the shared skin contract. Rendered as a
            small "inbox" panel beneath the toy in the same pixel-art
            aesthetic so the toy UI stays compact on the LCD itself. */}
        {queue.length > 0 && (
          <section
            className="tamagotchi-queue-panel"
            aria-label="Up next"
          >
            <h3 className="tamagotchi-queue-heading">
              inbox ({queue.length})
            </h3>
            <ul data-testid="queue" className="tamagotchi-queue-list">
              {queue.map((track, i) => (
                <li
                  key={track.videoId}
                  data-testid="queue-item"
                  data-ad={track.isAd ? "true" : "false"}
                  className="tamagotchi-queue-row"
                >
                  {track.isAd ? "[ad] " : ""}
                  {track.title}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  },
};
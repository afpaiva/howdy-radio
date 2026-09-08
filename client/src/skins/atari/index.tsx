/**
 * /client/src/skins/atari/index.tsx
 *
 * Atari 2600 — Space Invaders mini-game skin.
 *
 * Layout (two zones):
 *   TOP:    a compact, wood-paneled Atari-2600-style player bar — connection
 *           status, track title, play state, position, source link, and "Up
 *           Next". Every contract data-testid lives here, kept visually
 *           compact so it never dominates the page.
 *   BELOW:  a self-contained Space Invaders canvas mini-game filling the
 *           remaining viewport. Purely decorative/interactive — it never
 *           touches playback, sync, localStorage, or any shared state.
 *
 * Contract compliance: implements `Skin` from ../types.ts exactly, honoring
 * every data-testid the shared suite asserts (data-skin, connection-status /
 * connection-label, no-track vs current-track, track-title, posted-by,
 * play-state, position, track-link, queue, queue-item[data-ad]).
 *
 * The game loop bails out cleanly in jsdom (no real canvas surface) via a
 * one-time feature probe, so tests render the shell with zero side effects.
 */

import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import type { PlaybackState, Skin, Track } from "../types";
import "./styles.css";

/* ──────────────────────── Time formatting ──────────────────────── */

/** Format a whole-second duration as `M:SS`. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ────────────────────── Connection label ──────────────────────── */

/**
 * Themed connection label that still embeds the raw `connectionStatus` value.
 * Per the shared contract, the rendered `connection-label` testid must
 * include the raw status as a substring (the suite asserts
 * `toHaveTextContent(status)`), so we wrap the raw value in themed copy.
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

/* ──────────────────────── Queue row ──────────────────────── */

/** Render a single queued track as a compact, neon-labeled row. */
function QueueRow({ track }: { track: Track }): ReactElement {
  return (
    <li data-testid="queue-item" data-ad={track.isAd ? "true" : "false"}>
      <span className="atari-q-led">{track.isAd ? "[AD] " : "▶"}</span>
      <span className="atari-q-title">{track.title}</span>
      <span className="atari-q-meta">{formatTime(track.duration)}</span>
    </li>
  );
}

/* ──────────────── Compact Atari-2600 player bar ──────────────── */

/**
 * Top-of-screen player bar: a chunky wood-cabinet panel with beveled
 * physical-looking buttons. All contract testids are rendered here, kept
 * compact so the game below dominates the view.
 */
function CompactPlayer({ state }: { state: PlaybackState }): ReactElement {
  const { connectionStatus, currentTrack, position, isPlaying, queue } =
    state;
  return (
    <header
      data-testid="connection-status"
      data-status={connectionStatus}
      className="atari-cabinet"
    >
      <div className="atari-cabinet__top">
        <div className="atari-cabinet__cluster atari-cabinet__cluster--left">
          <button
            type="button"
            className={`atari-btn atari-led atari-led--${connectionStatus}`}
            aria-label={`Connection: ${connectionStatus}`}
          />
          <span className="atari-brand">howdy radio</span>
          <span data-testid="connection-label" className="atari-conn">
            {connectionLabel(connectionStatus)}
          </span>
        </div>

        {currentTrack ? (
          <section
            data-testid="current-track"
            className="atari-nowcompact"
            aria-label="Now playing"
          >
            <h1 data-testid="track-title" className="atari-title">
              {currentTrack.title}
            </h1>
            <div className="atari-meta">
              <span data-testid="posted-by">
                ▸ {currentTrack.postedBy.displayName}
              </span>
              <span
                data-testid="play-state"
                data-playing={isPlaying ? "true" : "false"}
                className="atari-btn atari-btn--pill"
              >
                {isPlaying ? "▶ Playing" : "❚❚ Paused"}
              </span>
              <span data-testid="position" className="atari-pos">
                {formatTime(position)} / {formatTime(currentTrack.duration)}
              </span>
              <a
                data-testid="track-link"
                className="atari-btn atari-btn--ghost"
                href={currentTrack.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                ► open
              </a>
            </div>
          </section>
        ) : (
          <p data-testid="no-track" className="atari-idle">
            — no signal — standby, earthling —
          </p>
        )}
      </div>

      <div className="atari-cabinet__strip">
        <span className="atari-upnext-label">up next</span>
        {queue.length > 0 && (
          <ul data-testid="queue" className="atari-queue">
            {queue.map((t, i) => (
              <QueueRow key={`${t.videoId}-${i}`} track={t} />
            ))}
          </ul>
        )}
      </div>
    </header>
  );
}

/* ──────────────── Space Invaders mini-game ──────────────── */

type Alien = { x: number; y: number; sprite: string[]; color: string };
type Shot = { x: number; y: number; w: number; h: number; vy: number };

// Geometry (CSS pixels).
const ALIEN_PX = 3; // canvas px per sprite pixel → 8×8 sprites = 24×24
const ALIEN_W = 8 * ALIEN_PX;
const ALIEN_H = 8 * ALIEN_PX;
const ALIEN_COLS = 10;
const ALIEN_GRID_ROWS = 4;
const ALIEN_GAP_X = 30;
const ALIEN_GAP_Y = 26;
const ALIEN_TOP_PAD = 16;
const SHIP_W = 8 * ALIEN_PX;
const SHIP_H = 8 * ALIEN_PX;
const SHOT_W = 4;
const SHOT_H = 10;

// Pixel-art sprites — 8×8, '1' = lit pixel.
const SPRITE_SHIP: string[] = [
  "00011000",
  "00111100",
  "01111110",
  "11111111",
  "01111110",
  "00111100",
  "00100100",
  "01100110",
];
const SPRITE_ALIEN_A: string[] = [
  "00111100",
  "00111100",
  "01111110",
  "11111111",
  "10011001",
  "01111110",
  "00111100",
  "01000010",
];
const SPRITE_ALIEN_B: string[] = [
  "01111110",
  "11111111",
  "00110011",
  "00111100",
  "00111100",
  "00110011",
  "01111110",
  "01000010",
];
const SPRITE_ALIEN_C: string[] = [
  "00111100",
  "01000010",
  "01111110",
  "10000001",
  "01100110",
  "01111110",
  "00111100",
  "01100110",
];

const ALIEN_ROWS: { sprite: string[]; color: string }[] = [
  { sprite: SPRITE_ALIEN_A, color: "#00ffff" }, // cyan  — top rows
  { sprite: SPRITE_ALIEN_A, color: "#00ffff" },
  { sprite: SPRITE_ALIEN_B, color: "#ff8800" }, // orange — middle
  { sprite: SPRITE_ALIEN_C, color: "#00ff00" }, // lime   — bottom
];

/**
 * One-time feature probe: a real `<canvas>` 2D context.
 *
 * In jsdom (the Vitest test environment) `getContext('2d')` returns `null` and
 * reports a "Not implemented: HTMLCanvasElement's getContext()" warning through
 * jsdom's internal virtual console. We detect jsdom via its `_virtualConsole`
 * marker (which a real browser never has) and skip the probe entirely there,
 * so tests render the skin shell with zero console noise. In a real browser
 * this is `true` and the game loop below runs normally.
 */
const supportsCanvas2D: boolean = (() => {
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
    return false;
  }
  const probe = document.createElement("canvas");
  const win = (probe.ownerDocument?.defaultView ?? window) as Window & {
    _virtualConsole?: unknown;
  };
  // jsdom-only marker → no real canvas surface available.
  if (win._virtualConsole !== undefined) return false;
  try {
    return probe.getContext("2d") !== null;
  } catch {
    return false;
  }
})();

/**
 * Self-contained Space Invaders mini-game.
 *
 * - Aliens drift horizontally as a block and descend on wall-bounce
 *   (descent capped so they never reach the ship → no game-over).
 * - The ship follows the mouse's horizontal position.
 * - Click or SPACE fires an upward shot; hitting an alien removes it.
 * - Cleared waves respawn, faster, so it stays playable indefinitely.
 *
 * Everything lives in refs/local closures inside a single effect; the loop
 * never mutates playback state or any shared/skin state.
 */
function SpaceInvadersGame(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !supportsCanvas2D) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* ── Starfield (static, regenerated for the current size) ── */
    let stars: Array<[number, number]> = [];
    const buildStars = () => {
      const w = canvas.width;
      const h = canvas.height;
      stars = [];
      for (let i = 0; i < 96; i++) {
        stars.push([Math.random() * w, Math.random() * h * 0.65]);
      }
    };
    buildStars();

    /* ── Sizing ── */
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
        buildStars();
      }
    };
    resize();

    /* ── Game state (mutable, local only) ── */
    const game = {
      aliens: [] as Alien[],
      shots: [] as Shot[],
      shipX: canvas.width / 2,
      mouseX: canvas.width / 2,
      dir: 1,
      speed: 0,
      speedCap: 200,
      dropStep: 10,
      score: 0,
      wave: 1,
      lastShot: 0,
      paused: false,
    };

    const shipY = (): number => canvas.height - SHIP_H - 12;

    const initWave = (): void => {
      const w = canvas.width;
      const waveW = (ALIEN_COLS - 1) * ALIEN_GAP_X + ALIEN_W;
      const startX = (w - waveW) / 2;
      for (let r = 0; r < ALIEN_GRID_ROWS; r++) {
        const row = ALIEN_ROWS[r];
        for (let c = 0; c < ALIEN_COLS; c++) {
          game.aliens.push({
            x: startX + c * ALIEN_GAP_X,
            y: ALIEN_TOP_PAD + r * ALIEN_GAP_Y,
            sprite: row.sprite,
            color: row.color,
          });
        }
      }
      game.dir = 1;
      game.speed = 60 + game.wave * 8;
    };
    initWave();

    /* ── Rendering helpers ── */
    const drawSprite = (
      sprite: string[],
      x: number,
      y: number,
      color: string,
      glow = false,
    ): void => {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = color;
      for (let ry = 0; ry < sprite.length; ry++) {
        const row = sprite[ry];
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === "1") {
            ctx.fillRect(x + rx * ALIEN_PX, y + ry * ALIEN_PX, ALIEN_PX, ALIEN_PX);
          }
        }
      }
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    };

    /* ── Game logic ── */
    const shoot = (): void => {
      if (performance.now() - game.lastShot < 240) return;
      game.lastShot = performance.now();
      game.shots.push({
        x: game.shipX - SHOT_W / 2,
        y: shipY(),
        w: SHOT_W,
        h: SHOT_H,
        vy: -480,
      });
    };

    const descend = (): void => {
      // Never let aliens descend past the ship — no game over.
      const cap = shipY() - ALIEN_H * 2;
      let maxY = 0;
      for (const a of game.aliens) maxY = Math.max(maxY, a.y);
      const drop = Math.min(game.dropStep, Math.max(0, cap - maxY));
      if (drop > 0) {
        for (const a of game.aliens) a.y += drop;
        game.speed = Math.min(game.speedCap, game.speed * 1.06);
      }
    };

    const update = (dt: number): void => {
      // Ship follows the mouse, clamped to the canvas.
      let sx = game.mouseX;
      const half = SHIP_W / 2;
      sx = Math.max(half, Math.min(sx, canvas.width - half));
      game.shipX = sx;

      // Advance shots.
      for (let i = game.shots.length - 1; i >= 0; i--) {
        const s = game.shots[i];
        s.y += s.vy * dt;
        if (s.y < -SHOT_H) game.shots.splice(i, 1);
      }

      // Advance the alien block.
      if (game.aliens.length === 0) {
        game.wave += 1;
        initWave();
        return;
      }

      const dx = game.dir * game.speed * dt;
      const margin = 8;
      let minX = Infinity;
      let maxX = -Infinity;
      for (const a of game.aliens) {
        minX = Math.min(minX, a.x);
        maxX = Math.max(maxX, a.x + ALIEN_W);
      }

      if (game.dir > 0 && maxX + dx >= canvas.width - margin) {
        game.dir = -1;
        descend();
      } else if (game.dir < 0 && minX + dx <= margin) {
        game.dir = 1;
        descend();
      } else {
        for (const a of game.aliens) a.x += dx;
      }
    };

    const collide = (): void => {
      for (let i = game.shots.length - 1; i >= 0; i--) {
        const s = game.shots[i];
        for (let j = game.aliens.length - 1; j >= 0; j--) {
          const a = game.aliens[j];
          if (
            s.x < a.x + ALIEN_W &&
            s.x + s.w > a.x &&
            s.y < a.y + ALIEN_H &&
            s.y + s.h > a.y
          ) {
            game.aliens.splice(j, 1);
            game.shots.splice(i, 1);
            game.score += 10;
            i--;
            break;
          }
        }
      }
    };

    /* ── Drawing ── */
    const draw = (): void => {
      const w = canvas.width;
      const h = canvas.height;

      // Starfield + faint grid (CRT void).
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#000d1a";
      ctx.fillRect(0, 0, w, h * 0.62);
      ctx.fillStyle = "#0cffb8";
      for (const [sx, sy] of stars) ctx.fillRect(sx, sy, 1, 1);
      ctx.strokeStyle = "rgba(0,255,184,0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Aliens.
      for (const a of game.aliens) drawSprite(a.sprite, a.x, a.y, a.color);

      // Shots (neon tracer).
      ctx.fillStyle = "#fff200";
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 8;
      for (const s of game.shots) ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.shadowBlur = 0;

      // Player ship.
      drawSprite(SPRITE_SHIP, game.shipX - SHIP_W / 2, shipY(), "#00ff88", true);

      // HUD.
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#00ff00";
      ctx.font = "12px 'Courier New', monospace";
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(
        `SCORE ${String(game.score).padStart(4, "0")}`,
        8,
        6,
      );
      ctx.textAlign = "right";
      ctx.fillText(` WAVE 0${game.wave}`, w - 8, 6);
    };

    /* ── Input ── */
    const onMove = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect();
      game.mouseX = e.clientX - rect.left;
    };
    const onPointerDown = (): void => shoot();
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === "Space") {
        e.preventDefault();
        shoot();
      }
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onPointerDown);
    canvas.addEventListener("click", onPointerDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", resize);
    const onVis = (): void => {
      game.paused = document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);

    /* ── Main loop ── */
    let rafId = 0;
    let last = 0;
    const loop = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.04);
      last = now;
      if (!game.paused) {
        update(dt);
        collide();
      }
      draw();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onPointerDown);
      canvas.removeEventListener("click", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="atari-game-wrap" data-testid="atari-game">
      <canvas ref={canvasRef} className="atari-canvas" />
      <div className="atari-scanlines" aria-hidden="true" />
      <div className="atari-game-hint">► steer with mouse · click or SPACE to fire</div>
    </div>
  );
}

/* ──────────────── The Atari skin object ──────────────── */

/** The Atari skin object, conforming to the `Skin` contract. */
export const atariSkin: Skin = {
  id: "atari",
  name: "Atari",
  render(state: PlaybackState): ReactElement {
    return (
      <div data-skin="atari" key="atari">
        <CompactPlayer state={state} />
        <SpaceInvadersGame />
      </div>
    );
  },
};

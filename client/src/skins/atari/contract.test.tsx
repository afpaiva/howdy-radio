/**
 * /client/src/skins/atari/contract.test.tsx
 *
 * Atari-specific contract smoke tests.
 *
 * Mirrors the parameterized assertions in
 * `/client/src/__tests__/skin-contract.test.tsx` (the global suite driven
 * by `getSkins()`), but runs entirely inside the Atari skin's directory.
 * This lets the skin implementer verify contract compliance during
 * development without depending on registry wiring.
 *
 * Per `client/AGENTS.md` rule #3, the Atari skin implementer is confined
 * to this directory and may not modify the global registry / shared
 * test file. These tests therefore duplicate the contract locally so we
 * can prove the skin honors it.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { atariSkin } from "./index";
import type {
  ConnectionStatus,
  PlaybackState,
  Track,
} from "../types";

/* ──────────────────────────── Fixtures ─────────────────────────── */

/** Build a Track with sensible defaults; override any field. */
function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    videoId: "abc123",
    title: "Test Track Title",
    url: "https://www.youtube.com/watch?v=abc123",
    postedBy: {
      id: "user123",
      displayName: "alice",
    },
    duration: 65,
    isAd: false,
    ...overrides,
  };
}

const track: Track = makeTrack();

const idleState: PlaybackState = {
  isPlaying: false,
  currentTrack: null,
  position: 0,
  queue: [],
  connectionStatus: "connected",
};

const playingState: PlaybackState = {
  isPlaying: true,
  currentTrack: track,
  position: 65,
  queue: [
    makeTrack({ videoId: "q1", title: "First In Queue", isAd: false }),
    makeTrack({ videoId: "q2", title: "Sponsored Short", isAd: true }),
  ],
  connectionStatus: "connected",
};

const pausedState: PlaybackState = { ...playingState, isPlaying: false };

const allConnectionStatuses: ConnectionStatus[] = [
  "connecting",
  "connected",
  "disconnected",
];

/* ──────────────────────── Contract checks ─────────────────────── */

describe('Atari skin contract', () => {
  /* ── 1. Skin shape ────────────────────────────────────────────── */

  it('has a non-empty string id, name, and a function render', () => {
    expect(typeof atariSkin.id).toBe('string');
    expect(atariSkin.id.length).toBeGreaterThan(0);
    expect(typeof atariSkin.name).toBe('string');
    expect(atariSkin.name.length).toBeGreaterThan(0);
    expect(typeof atariSkin.render).toBe('function');
    expect(atariSkin.id).toBe('atari');
    expect(atariSkin.name).toBe('Atari');
  });

  /* ── 2. Root data-skin attribute ───────────────────────────────── */

  it('renders a root element with data-skin equal to skin.id', () => {
    const { container } = render(atariSkin.render(idleState));
    const root = container.querySelector(`[data-skin="${atariSkin.id}"]`);
    expect(root).not.toBeNull();
  });

  /* ── 3. Connection status label ────────────────────────────────── */

  it('always renders connection-status and connection-label testids', () => {
    render(atariSkin.render(idleState));
    expect(screen.getByTestId('connection-status')).toBeInTheDocument();
    expect(screen.getByTestId('connection-label')).toBeInTheDocument();
  });

  it.each(allConnectionStatuses)(
    'shows connection-label text containing raw status "%s"',
    (status) => {
      render(atariSkin.render({ ...idleState, connectionStatus: status }));
      expect(screen.getByTestId('connection-label')).toHaveTextContent(status);
    },
  );

  /* ── 4. Idle state ────────────────────────────────────────────── */

  it('renders no-track and NOT current-track when currentTrack is null', () => {
    render(atariSkin.render(idleState));
    expect(screen.getByTestId('no-track')).toBeInTheDocument();
    expect(screen.queryByTestId('current-track')).toBeNull();
  });

  /* ── 5. Now playing ───────────────────────────────────────────── */

  it('renders the full current-track block when currentTrack is set', () => {
    render(atariSkin.render(playingState));

    expect(screen.getByTestId('current-track')).toBeInTheDocument();
    expect(screen.getByTestId('track-title')).toHaveTextContent(track.title);
    expect(screen.getByTestId('posted-by')).toHaveTextContent(track.postedBy.displayName);
    expect(screen.getByTestId('play-state')).toHaveTextContent('Playing');
    expect(screen.getByTestId('position')).toHaveTextContent('1:05 / 1:05');

    const link = screen.getByTestId('track-link');
    expect(link).toHaveAttribute('href', track.url);
    expect(link).toHaveAttribute('target', '_blank');
    const rel = link.getAttribute('rel') ?? '';
    expect(rel.split(/\s+/)).toContain('noopener');
  });

  /* ── 6. Paused state ──────────────────────────────────────────── */

  it('shows Paused in play-state when isPlaying is false', () => {
    render(atariSkin.render(pausedState));
    expect(screen.getByTestId('play-state')).toHaveTextContent('Paused');
  });

  /* ── 7. Position / time format ────────────────────────────────── */

  it('formats position as M:SS / M:SS for position=65, duration=183', () => {
    const state: PlaybackState = {
      ...playingState,
      currentTrack: makeTrack({ duration: 183 }),
      position: 65,
    };
    render(atariSkin.render(state));
    expect(screen.getByTestId('position')).toHaveTextContent('1:05 / 3:03');
  });

  it('zero-pads seconds (position=5, duration=5 → "0:05 / 0:05")', () => {
    const state: PlaybackState = {
      ...playingState,
      currentTrack: makeTrack({ duration: 5 }),
      position: 5,
    };
    render(atariSkin.render(state));
    expect(screen.getByTestId('position')).toHaveTextContent('0:05 / 0:05');
  });

  it('renders "0:00 / 0:00" when position and duration are both 0', () => {
    const state: PlaybackState = {
      ...playingState,
      currentTrack: makeTrack({ duration: 0 }),
      position: 0,
    };
    render(atariSkin.render(state));
    expect(screen.getByTestId('position')).toHaveTextContent('0:00 / 0:00');
  });

  it('clamps non-finite position/duration to 0 without rendering NaN', () => {
    const state: PlaybackState = {
      ...playingState,
      currentTrack: makeTrack({ duration: Number.NaN }),
      position: Number.NaN,
    };
    render(atariSkin.render(state));
    const pos = screen.getByTestId('position');
    expect(pos.textContent).not.toContain('NaN');
    expect(pos.textContent).not.toContain('Infinity');
  });

  it('clamps negative position to 0', () => {
    const state: PlaybackState = {
      ...playingState,
      currentTrack: makeTrack({ duration: 65 }),
      position: -10,
    };
    render(atariSkin.render(state));
    expect(screen.getByTestId('position')).toHaveTextContent('0:00 / 1:05');
  });

  /* ── 8. Empty queue ───────────────────────────────────────────── */

  it('omits the queue element when queue is empty', () => {
    render(atariSkin.render({ ...playingState, queue: [] }));
    expect(screen.queryByTestId('queue')).toBeNull();
  });

  /* ── 9. Non-empty queue ───────────────────────────────────────── */

  it('renders one queue-item per entry with correct data-ad values', () => {
    render(atariSkin.render(playingState));

    expect(screen.getByTestId('queue')).toBeInTheDocument();

    const items = screen.getAllByTestId('queue-item');
    expect(items).toHaveLength(playingState.queue.length);

    items.forEach((item) => {
      const val = item.getAttribute('data-ad');
      expect(['true', 'false']).toContain(val);
    });

    const adCount = items.filter(
      (i) => i.getAttribute('data-ad') === 'true',
    ).length;
    const nonAdCount = items.filter(
      (i) => i.getAttribute('data-ad') === 'false',
    ).length;
    expect(adCount).toBe(playingState.queue.filter((t) => t.isAd).length);
    expect(nonAdCount).toBe(playingState.queue.filter((t) => !t.isAd).length);
  });

  /* ── 10. Full fixture sanity ──────────────────────────────────── */

  it('renders without throwing on a full fixture', () => {
    expect(() => render(atariSkin.render(playingState))).not.toThrow();
  });
});
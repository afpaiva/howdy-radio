/**
 * /client/src/skins/walkman/walkman.test.tsx
 *
 * Walkman-skin contract suite — mirrors the shared skin contract from
 * `client/src/__tests__/skin-contract.test.tsx`, but lives inside the
 * walkman skin's own directory so the skin implementer can validate
 * its own skin against the shared `Skin` interface contract without
 * touching the registry or any other skin.
 *
 * Per client/AGENTS.md rule #3 (skin isolation), this file imports
 * only from the walkman skin's own directory and the shared
 * `types.ts`. It does NOT import `../skins/registry` or any other
 * skin's implementation.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { walkmanSkin } from './index';
import type {
  PlaybackState,
  ConnectionStatus,
  Track,
} from '../types';

/* ──────────────────────────── Fixtures ─────────────────────────── */

/** Build a Track with sensible defaults; override any field. */
function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    videoId: 'abc123',
    title: 'Test Track Title',
    url: 'https://www.youtube.com/watch?v=abc123',
    postedBy: {
      id: 'user123',
      displayName: 'alice',
    },
    duration: 65,
    isAd: false,
    ...overrides,
  };
}

const track: Track = makeTrack();

/** Idle state: no track, no queue, connected. */
const idleState: PlaybackState = {
  isPlaying: false,
  currentTrack: null,
  position: 0,
  queue: [],
  connectionStatus: 'connected',
};

/** Full playing state: a current track at 65s with a 2-item queue. */
const playingState: PlaybackState = {
  isPlaying: true,
  currentTrack: track,
  position: 65,
  queue: [
    makeTrack({ videoId: 'q1', title: 'First In Queue', isAd: false }),
    makeTrack({ videoId: 'q2', title: 'Sponsored Short', isAd: true }),
  ],
  connectionStatus: 'connected',
};

/** Same fixture but paused. */
const pausedState: PlaybackState = {
  ...playingState,
  isPlaying: false,
};

/** All valid ConnectionStatus values, for parameterized tests. */
const allConnectionStatuses: ConnectionStatus[] = [
  'connecting',
  'connected',
  'disconnected',
];

/* ──────────────────────────── Contract ─────────────────────────── */

const skin = walkmanSkin;

describe('Skin contract: walkman "Walkman"', () => {
  /* ── 1. Skin shape ────────────────────────────────────────────── */

  it('has a non-empty string id, name, and a function render', () => {
    expect(typeof skin.id).toBe('string');
    expect(skin.id.length).toBeGreaterThan(0);
    expect(typeof skin.name).toBe('string');
    expect(skin.name.length).toBeGreaterThan(0);
    expect(typeof skin.render).toBe('function');
  });

  /* ── 2. Root data-skin attribute ───────────────────────────────── */

  it('renders a root element with data-skin equal to skin.id', () => {
    const { container } = render(skin.render(idleState));
    const root = container.querySelector(`[data-skin="${skin.id}"]`);
    expect(root).not.toBeNull();
  });

  /* ── 3. Connection status label ────────────────────────────────── */

  it('always renders connection-status and connection-label testids', () => {
    render(skin.render(idleState));
    expect(screen.getByTestId('connection-status')).toBeInTheDocument();
    expect(screen.getByTestId('connection-label')).toBeInTheDocument();
  });

  it.each(allConnectionStatuses)(
    'shows connection-label text matching "%s"',
    (status) => {
      render(skin.render({ ...idleState, connectionStatus: status }));
      expect(screen.getByTestId('connection-label')).toHaveTextContent(status);
    },
  );

  /* ── 4. Idle state (currentTrack === null) ─────────────────────── */

  it('renders no-track and NOT current-track when currentTrack is null', () => {
    render(skin.render(idleState));
    expect(screen.getByTestId('no-track')).toBeInTheDocument();
    expect(screen.queryByTestId('current-track')).toBeNull();
  });

  /* ── 5. Now playing (currentTrack set) ─────────────────────────── */

  it('renders the full current-track block when currentTrack is set', () => {
    render(skin.render(playingState));

    // current-track container
    expect(screen.getByTestId('current-track')).toBeInTheDocument();

    // track-title contains the track title
    expect(screen.getByTestId('track-title')).toHaveTextContent(track.title);

    // posted-by includes the poster's display name
    expect(screen.getByTestId('posted-by')).toHaveTextContent(track.postedBy.displayName);

    // play-state reflects isPlaying
    expect(screen.getByTestId('play-state')).toHaveTextContent('Playing');

    // position is formatted M:SS / M:SS (65s → 1:05, duration 65s → 1:05)
    expect(screen.getByTestId('position')).toHaveTextContent('1:05 / 1:05');

    // track-link: href matches url, opens in new tab, rel includes noopener
    const link = screen.getByTestId('track-link');
    expect(link).toHaveAttribute('href', track.url);
    expect(link).toHaveAttribute('target', '_blank');
    const rel = link.getAttribute('rel') ?? '';
    expect(rel.split(/\s+/)).toContain('noopener');
  });

  /* ── 6. Paused state ───────────────────────────────────────────── */

  it('shows Paused in play-state when isPlaying is false', () => {
    render(skin.render(pausedState));
    expect(screen.getByTestId('play-state')).toHaveTextContent('Paused');
  });

  /* ── 7. Position / time format ─────────────────────────────────── */

  it('formats position as M:SS / M:SS for position=65, duration=183', () => {
    const state: PlaybackState = {
      ...playingState,
      currentTrack: makeTrack({ duration: 183 }),
      position: 65,
    };
    render(skin.render(state));
    // 65s → 1:05, 183s → 3:03
    expect(screen.getByTestId('position')).toHaveTextContent('1:05 / 3:03');
  });

  it('zero-pads seconds (position=5, duration=5 → "0:05 / 0:05")', () => {
    const state: PlaybackState = {
      ...playingState,
      currentTrack: makeTrack({ duration: 5 }),
      position: 5,
    };
    render(skin.render(state));
    expect(screen.getByTestId('position')).toHaveTextContent('0:05 / 0:05');
  });

  it('renders "0:00 / 0:00" when position and duration are both 0', () => {
    const state: PlaybackState = {
      ...playingState,
      currentTrack: makeTrack({ duration: 0 }),
      position: 0,
    };
    render(skin.render(state));
    expect(screen.getByTestId('position')).toHaveTextContent('0:00 / 0:00');
  });

  it('clamps non-finite position/duration to 0 without rendering NaN', () => {
    const state: PlaybackState = {
      ...playingState,
      currentTrack: makeTrack({ duration: Number.NaN }),
      position: Number.NaN,
    };
    render(skin.render(state));
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
    render(skin.render(state));
    expect(screen.getByTestId('position')).toHaveTextContent('0:00 / 1:05');
  });

  /* ── 8. Empty queue ────────────────────────────────────────────── */

  it('omits the queue element when queue is empty', () => {
    render(skin.render({ ...playingState, queue: [] }));
    expect(screen.queryByTestId('queue')).toBeNull();
  });

  /* ── 9. Non-empty queue ───────────────────────────────────────── */

  it('renders one queue-item per entry with correct data-ad values', () => {
    render(skin.render(playingState));

    expect(screen.getByTestId('queue')).toBeInTheDocument();

    const items = screen.getAllByTestId('queue-item');
    expect(items).toHaveLength(playingState.queue.length);

    // Every item must carry a valid data-ad token
    items.forEach((item) => {
      const val = item.getAttribute('data-ad');
      expect(['true', 'false']).toContain(val);
    });

    // Counts of ad vs. non-ad items must match the queue
    const adCount = items.filter(
      (i) => i.getAttribute('data-ad') === 'true',
    ).length;
    const nonAdCount = items.filter(
      (i) => i.getAttribute('data-ad') === 'false',
    ).length;
    expect(adCount).toBe(playingState.queue.filter((t) => t.isAd).length);
    expect(nonAdCount).toBe(playingState.queue.filter((t) => !t.isAd).length);
  });

  /* ── 10. Full fixture sanity ───────────────────────────────────── */

  it('renders without throwing on a full fixture', () => {
    expect(() => render(skin.render(playingState))).not.toThrow();
  });
});
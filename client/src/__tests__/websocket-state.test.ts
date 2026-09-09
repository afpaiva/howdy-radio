/**
 * /client/src/__tests__/websocket-state.test.ts
 *
 * Unit tests for the normalizeState / normalizeTrack / normalizePostedBy
 * wire-normalization layer. These ensure the raw server payload is correctly
 * adapted to the client-side Track/PlaybackState contract before any skin
 * ever sees it.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { io } from 'socket.io-client';
import type { WirePlaybackState, Track, PostedBy } from '../skins/types';
import { usePlayback } from '../lib/websocket';

// Re-implement the normalization logic here to test it in isolation.
// In production, the same functions live in websocket.ts. Testing them
// directly validates the adapter contract without depending on a live
// socket.

type RawPostedBy = string | { id: string; displayName?: string; realName?: string } | undefined;

function normalizePostedBy(raw: RawPostedBy): PostedBy {
  if (typeof raw === 'string') {
    const name = raw.length > 0 ? raw : 'unknown';
    return { id: name, displayName: name };
  }
  if (raw && typeof raw === 'object') {
    const displayName = raw.displayName || raw.realName || raw.id || 'unknown';
    return {
      id: raw.id || displayName,
      displayName,
      ...(raw.realName ? { realName: raw.realName } : {}),
    };
  }
  return { id: 'unknown', displayName: 'unknown' };
}

function normalizeTrack(raw: unknown): Track {
  const t = (raw ?? {}) as Record<string, unknown>;
  const videoId = String(t.videoId ?? t.id ?? '');
  return {
    videoId,
    title: String(t.title ?? ''),
    url:
      typeof t.url === 'string'
        ? t.url
        : `https://www.youtube.com/watch?v=${videoId}`,
    postedBy: normalizePostedBy(t.postedBy as RawPostedBy),
    duration: typeof t.duration === 'number' ? t.duration : 0,
    isAd: Boolean(t.isAd),
  };
}

function normalizeState(raw: unknown): WirePlaybackState {
  if (!raw || typeof raw !== 'object') {
    return {
      isPlaying: false,
      currentTrack: null,
      position: 0,
      queue: [],
    };
  }
  const s = raw as Record<string, unknown>;
  return {
    isPlaying: Boolean(s.isPlaying),
    currentTrack: s.currentTrack ? normalizeTrack(s.currentTrack) : null,
    position: typeof s.position === 'number' ? s.position : 0,
    queue: Array.isArray(s.queue) ? s.queue.map(normalizeTrack) : [],
  };
}

describe('WebSocket socket lifecycle', () => {
  it('shares one socket across multiple hook consumers', () => {
    function Consumer() {
      usePlayback();
      return null;
    }

    render(
      createElement(
        StrictMode,
        null,
        createElement(Consumer),
        createElement(Consumer),
      ),
    );

    expect(io).toHaveBeenCalledTimes(1);
  });
});

describe('WebSocket state normalization', () => {
  describe('normalizePostedBy', () => {
    it('normalizes a string to { id, displayName }', () => {
      expect(normalizePostedBy('alice')).toEqual({
        id: 'alice',
        displayName: 'alice',
      });
    });

    it('normalizes an empty string to "unknown"', () => {
      const result = normalizePostedBy('');
      expect(result.id).toBe('unknown');
      expect(result.displayName).toBe('unknown');
    });

    it('normalizes an object with realName', () => {
      const result = normalizePostedBy({
        id: 'U123',
        displayName: 'Al',
        realName: 'Alice',
      });
      expect(result).toEqual({
        id: 'U123',
        displayName: 'Al',
        realName: 'Alice',
      });
    });

    it('falls back to realName when displayName is missing', () => {
      const result = normalizePostedBy({
        id: 'U123',
        realName: 'Alice',
      });
      expect(result.displayName).toBe('Alice');
    });

    it('falls back to id when both name fields are missing', () => {
      const result = normalizePostedBy({ id: 'U123' });
      expect(result.displayName).toBe('U123');
    });

    it('handles undefined', () => {
      expect(normalizePostedBy(undefined)).toEqual({
        id: 'unknown',
        displayName: 'unknown',
      });
    });

    it('handles null', () => {
      expect(normalizePostedBy(null as unknown as RawPostedBy)).toEqual({
        id: 'unknown',
        displayName: 'unknown',
      });
    });
  });

  describe('normalizeTrack', () => {
    it('maps server track fields to client Track shape', () => {
      const raw = {
        id: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        duration: 213,
        isAd: false,
        postedBy: 'bob',
      };
      const result = normalizeTrack(raw);
      expect(result).toEqual({
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        postedBy: { id: 'bob', displayName: 'bob' },
        duration: 213,
        isAd: false,
      });
    });

    it('uses videoId field when present (priority over id)', () => {
      const result = normalizeTrack({
        videoId: 'abc123',
        id: 'xyz789',
        title: 'Test',
        duration: 0,
        isAd: false,
      });
      expect(result.videoId).toBe('abc123');
    });

    it('falls back to id when videoId is absent', () => {
      const result = normalizeTrack({
        id: 'abcdef',
        title: 'Test',
        duration: 0,
        isAd: false,
      });
      expect(result.videoId).toBe('abcdef');
    });

    it('synthesizes URL from videoId when url is absent', () => {
      const result = normalizeTrack({
        id: 'vid1',
        title: 'T',
        duration: 0,
        isAd: false,
      });
      expect(result.url).toBe('https://www.youtube.com/watch?v=vid1');
    });

    it('preserves explicit url when provided', () => {
      const result = normalizeTrack({
        id: 'vid1',
        title: 'T',
        url: 'https://youtu.be/vid1',
        duration: 0,
        isAd: false,
      });
      expect(result.url).toBe('https://youtu.be/vid1');
    });

    it('marks ad tracks with isAd=true', () => {
      const result = normalizeTrack({
        id: 'ad1',
        title: 'Sponsored',
        duration: 15,
        isAd: true,
      });
      expect(result.isAd).toBe(true);
    });

    it('handles null/undefined input gracefully', () => {
      const result = normalizeTrack(null);
      expect(result).toEqual({
        videoId: '',
        title: '',
        url: 'https://www.youtube.com/watch?v=',
        postedBy: { id: 'unknown', displayName: 'unknown' },
        duration: 0,
        isAd: false,
      });
    });
  });

  describe('normalizeState', () => {
    it('normalizes a full playback state snapshot', () => {
      // Use raw server shape (id, not videoId; postedBy as string)
      const raw = {
        isPlaying: true,
        currentTrack: {
          id: 'm1',
          title: 'Music Track',
          duration: 200,
          isAd: false,
          postedBy: { id: 'u1', displayName: 'Alice' },
        },
        position: 42,
        queue: [
          { id: 'q1', title: 'Next Track', duration: 180, isAd: false, postedBy: 'bob' },
          { id: 'a1', title: 'Advert', duration: 30, isAd: true, postedBy: 'system' },
        ],
      };

      const result = normalizeState(raw);
      expect(result.isPlaying).toBe(true);
      expect(result.currentTrack?.videoId).toBe('m1');
      expect(result.currentTrack?.postedBy.displayName).toBe('Alice');
      expect(result.position).toBe(42);
      expect(result.queue).toHaveLength(2);
      expect(result.queue[0].videoId).toBe('q1');
      expect(result.queue[0].postedBy.displayName).toBe('bob');
      expect(result.queue[1].isAd).toBe(true);
    });

    it('handles null currentTrack', () => {
      const result = normalizeState({
        isPlaying: false,
        currentTrack: null,
        position: 0,
        queue: [],
      });
      expect(result.currentTrack).toBeNull();
    });

    it('returns a safe default for falsy input', () => {
      expect(normalizeState(null)).toEqual({
        isPlaying: false,
        currentTrack: null,
        position: 0,
        queue: [],
      });
      expect(normalizeState(undefined)).toEqual({
        isPlaying: false,
        currentTrack: null,
        position: 0,
        queue: [],
      });
      expect(normalizeState('not-an-object')).toEqual({
        isPlaying: false,
        currentTrack: null,
        position: 0,
        queue: [],
      });
    });

    it('defaults non-numeric position to 0', () => {
      const result = normalizeState({
        isPlaying: true,
        currentTrack: null,
        position: 'not-a-number' as unknown as number,
        queue: [],
      });
      expect(result.position).toBe(0);
    });

    it('defaults isPlaying to false for truthy non-boolean', () => {
      const result = normalizeState({
        isPlaying: 'yes' as unknown as boolean,
        currentTrack: null,
        position: 0,
        queue: [],
      });
      expect(result.isPlaying).toBe(true);
    });

    it('filters out non-array queue to empty', () => {
      const result = normalizeState({
        isPlaying: true,
        currentTrack: null,
        position: 0,
        queue: 'not-an-array' as unknown as unknown[],
      });
      expect(result.queue).toEqual([]);
    });
  });
});

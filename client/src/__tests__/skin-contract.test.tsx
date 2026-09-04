import { describe, it, expect } from 'vitest';
import { neutralSkin } from '../skins/neutral';

describe('neutralSkin contract', () => {
  it('implements the Skin interface exactly', () => {
    expect(typeof neutralSkin.id).toBe('string');
    expect(typeof neutralSkin.name).toBe('string');
    expect(typeof neutralSkin.render).toBe('function');

    const mockState: import('../skins/types').PlaybackState = {
      isPlaying: false,
      currentTrack: null,
      position: 0,
      queue: [],
      connectionStatus: 'connected',
    };
    const rendered = neutralSkin.render(mockState);
    expect(rendered).toBeDefined();
  });
});
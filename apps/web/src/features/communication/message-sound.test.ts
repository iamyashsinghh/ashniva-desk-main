import { afterEach, describe, expect, it, vi } from 'vitest';

import { playMessageSound, resetMessageSoundForTests, unlockMessageSound } from './message-sound';

describe('message sound', () => {
  afterEach(() => {
    resetMessageSoundForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('plays a short ping through the Web Audio API once audio is unlocked', () => {
    const oscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const resume = vi.fn(async () => undefined);
    const audio = {
      state: 'running',
      currentTime: 1,
      resume,
      createOscillator: () => oscillator,
      createGain: () => gain,
      destination: {},
    };
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return audio;
      }),
    );

    unlockMessageSound();
    playMessageSound();

    expect(oscillator.start).toHaveBeenCalledWith(1);
    expect(oscillator.stop).toHaveBeenCalled();
    expect(gain.connect).toHaveBeenCalledWith(audio.destination);
  });

  it('does not throw when the browser has no AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => playMessageSound()).not.toThrow();
  });
});

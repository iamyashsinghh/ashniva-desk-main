/**
 * The ping that plays when a message arrives and this tab is not already looking at it.
 *
 * A short two-tone generated in the Web Audio API rather than a file: there is nothing to host,
 * nothing to cache, and a missing asset cannot silently take the sound away. Autoplay policy
 * still applies — `unlockMessageSound` must have run after a click before a ping will be heard.
 */

let context: AudioContext | null = null;

/** Drops the cached context so tests do not leak audio from one case into the next. */
export function resetMessageSoundForTests(): void {
  context = null;
}

function audioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  context ??= new Ctor();
  return context;
}

/** Call from the first pointer/keyboard gesture so later pings are allowed to play. */
export function unlockMessageSound(): void {
  const audio = audioContext();
  if (audio?.state === 'suspended') {
    void audio.resume();
  }
}

/** A short rising ping. No-ops when the browser has not unlocked audio yet. */
export function playMessageSound(): void {
  try {
    unlockMessageSound();
    const audio = audioContext();
    if (!audio || audio.state !== 'running') {
      return;
    }
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1174.66, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  } catch {
    // Autoplay, a missing AudioContext, or a closed context — the badge still updates.
  }
}

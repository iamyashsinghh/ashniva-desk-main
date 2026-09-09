import type { Tone } from '../../tokens/status-tone';

/** The tones an initials avatar can take. Not `danger` — a colleague is not a failure. */
const AVATAR_TONES: readonly Tone[] = ['neutral', 'info', 'progress', 'success', 'review'];

/** First letter of the first two words, which is what a person recognises at 24px. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Picks a tone from the name.
 *
 * Deterministic, so the same person is the same colour on every screen and in every session — an
 * avatar whose colour changes on reload is worse than one colour for everybody, because the eye
 * learns it and then it lies. A sum of char codes is enough: the only requirement is stability.
 */
export function avatarTone(name: string): Tone {
  let sum = 0;
  for (let index = 0; index < name.length; index += 1) {
    sum += name.charCodeAt(index);
  }
  return AVATAR_TONES[sum % AVATAR_TONES.length] ?? 'neutral';
}

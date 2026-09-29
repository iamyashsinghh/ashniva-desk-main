import { AVATAR_PRESETS, type AvatarPreset } from '@ashniva/types';

import type { IconName, IconTone } from './Icon';

/**
 * How each built-in avatar is drawn on the phone.
 *
 * The API stores only the key, so the picture and its colour are this app's choice. The colour is
 * an icon tone rather than a hex value: tones come from the theme, so a preset follows dark mode
 * and the tenant's brand colour like every other tile.
 */
export const AVATAR_PRESET_STYLES: Record<
  AvatarPreset,
  { icon: IconName; tone: IconTone; label: string }
> = {
  rocket: { icon: 'rocket', tone: 'primary', label: 'Rocket' },
  leaf: { icon: 'leaf', tone: 'success', label: 'Leaf' },
  planet: { icon: 'planet', tone: 'violet', label: 'Planet' },
  flame: { icon: 'flame', tone: 'danger', label: 'Flame' },
  star: { icon: 'star', tone: 'warning', label: 'Star' },
  heart: { icon: 'heart', tone: 'pink', label: 'Heart' },
  music: { icon: 'musical-notes', tone: 'teal', label: 'Music' },
  coffee: { icon: 'cafe', tone: 'orange', label: 'Coffee' },
  bicycle: { icon: 'bicycle', tone: 'info', label: 'Bicycle' },
  code: { icon: 'code-slash', tone: 'violet', label: 'Code' },
  paw: { icon: 'paw', tone: 'orange', label: 'Paw' },
  sun: { icon: 'sunny', tone: 'warning', label: 'Sun' },
};

export { AVATAR_PRESETS, type AvatarPreset };

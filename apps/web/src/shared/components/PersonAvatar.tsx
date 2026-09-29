import { AVATAR_PRESETS, type AvatarPreset, type UserAvatar } from '@ashniva/types';
import { useState, type ReactNode } from 'react';

import { useAvatarPhotoUrl } from '../lib/avatar-photo';
import { PresetIcon } from './avatar-presets';

import './person-avatar.css';

export type PersonAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface PersonAvatarProps {
  name: string;
  /** Whose photo to fetch. Without it a photo cannot be drawn and the initials stand in. */
  userId?: string | null | undefined;
  avatar?: UserAvatar | null | undefined;
  size?: PersonAvatarSize;
  /**
   * Announce the name, for the places it is not written beside the picture.
   *
   * Off by default: next to a name, an avatar that reads the name again makes every list twice as
   * long to somebody using a screen reader.
   */
  labelled?: boolean;
  className?: string;
}

/**
 * A person as their photo, the built-in picture they chose, or their initials — in that order of
 * preference, and always the initials while a photo is on its way or if it cannot be fetched.
 */
export function PersonAvatar({
  name,
  userId,
  avatar,
  size = 'sm',
  labelled = false,
  className,
}: PersonAvatarProps) {
  const photoUrl = useAvatarPhotoUrl(userId, avatar?.kind === 'photo' ? avatar.version : null);
  // An image the browser could not decode falls back to the initials rather than a broken icon.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const preset = avatar?.kind === 'preset' && isKnownPreset(avatar.preset) ? avatar.preset : null;

  let variant = 'initials';
  let modifier = 'person-avatar--initials';
  let picture: ReactNode = initialsOf(name);
  if (photoUrl !== null && photoUrl !== brokenUrl) {
    variant = 'photo';
    modifier = 'person-avatar--photo';
    picture = <img src={photoUrl} alt="" onError={() => setBrokenUrl(photoUrl)} />;
  } else if (preset) {
    variant = `preset:${preset}`;
    modifier = `person-avatar--preset person-avatar--preset-${preset}`;
    picture = <PresetIcon preset={preset} />;
  }

  return (
    <span
      className={['person-avatar', `person-avatar--${size}`, modifier, className]
        .filter(Boolean)
        .join(' ')}
      data-avatar={variant}
      {...(labelled ? { role: 'img', 'aria-label': name } : { 'aria-hidden': true })}
    >
      {picture}
    </span>
  );
}

/** At most two letters, from the first and last word of a name. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/** A key a newer API might send that this build has no drawing for is drawn as initials. */
function isKnownPreset(value: string): value is AvatarPreset {
  return (AVATAR_PRESETS as readonly string[]).includes(value);
}

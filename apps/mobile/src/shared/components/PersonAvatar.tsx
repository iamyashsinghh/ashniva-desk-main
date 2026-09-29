import type { UserAvatar } from '@ashniva/types';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { mobileEnv } from '../../config/env';
import { useAccessTokenForImages } from '../attachments/attachments';
import { useTheme } from '../theme/ThemeProvider';
import { AVATAR_PRESET_STYLES } from './avatar-presets';
import { Avatar } from './Avatar';
import { iconToneColors } from './Icon';

/** The least a payload has to carry for its person to be drawn with their own picture. */
export interface AvatarPerson {
  id: string;
  name: string;
  avatar?: UserAvatar | null;
}

export interface PersonAvatarProps {
  /** Whose picture. Wins over `name` when both are given. */
  person?: AvatarPerson | null;
  /** The name alone, for a caller that has no person — what `Avatar` takes. */
  name?: string;
  size?: number;
  shape?: 'person' | 'group';
  /** For a group tile: the colour it sits on, which its cut corner shows through to. */
  cutColor?: string;
}

/**
 * Somebody's picture: their photo, the preset they chose, or their initials.
 *
 * A drop-in for `Avatar` — the same `name`, `size`, `shape` and `cutColor` — that also takes the
 * person, so a screen can switch over without changing how anything else is laid out.
 *
 * A photo streams through `GET /users/:id/avatar` after the API's access checks, so `Image` is
 * handed the bearer token the way attachment images are, and the token is subscribed to: an image
 * request cannot take the API client's refresh path, so a picture whose token expired would stay
 * broken until the screen remounted. The `v` in the URL changes with every upload, so a cached
 * image is never an old face.
 *
 * Anything that goes wrong with a photo — no token yet, a 404, no network — draws the initials
 * rather than an empty circle. A group has no picture of a person, so it is always the tile.
 */
export function PersonAvatar({
  person,
  name,
  size = 40,
  shape = 'person',
  cutColor,
}: PersonAvatarProps) {
  const theme = useTheme();
  const token = useAccessTokenForImages();
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const displayName = person?.name ?? name ?? '';
  const avatar = shape === 'person' ? (person?.avatar ?? null) : null;
  const initials = (
    <Avatar
      name={displayName}
      size={size}
      shape={shape}
      {...(cutColor !== undefined ? { cutColor } : {})}
    />
  );

  if (avatar?.kind === 'preset') {
    const preset = AVATAR_PRESET_STYLES[avatar.preset];
    if (!preset) {
      return initials;
    }
    const tint = iconToneColors(theme, preset.tone);
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="person-avatar-preset"
        style={{
          alignItems: 'center',
          backgroundColor: tint.background,
          borderRadius: size / 2,
          height: size,
          justifyContent: 'center',
          width: size,
        }}
      >
        <Ionicons name={preset.icon} size={Math.round(size * 0.52)} color={tint.color} />
      </View>
    );
  }

  if (avatar?.kind === 'photo' && person && token) {
    const source = avatarPhotoSource(person.id, avatar.version, mobileEnv.apiBaseUrl, token);
    // Keyed by the token as well as the address: a photo refused with an expired token is worth
    // asking for again once the shared refresh has committed a new one.
    const attempt = `${source.uri}|${token}`;
    if (failedSource !== attempt) {
      return (
        <Image
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="person-avatar-photo"
          source={source}
          resizeMode="cover"
          onError={() => setFailedSource(attempt)}
          style={{
            backgroundColor: theme.colors.pillBackground,
            borderRadius: size / 2,
            height: size,
            width: size,
          }}
        />
      );
    }
  }

  return initials;
}

/** Where a person's photo is, with the header the API needs to hand it over. */
export function avatarPhotoSource(
  userId: string,
  version: string,
  baseUrl: string,
  token: string | null,
): { uri: string; headers: Record<string, string> } {
  return {
    uri: `${baseUrl}/users/${encodeURIComponent(userId)}/avatar?v=${encodeURIComponent(version)}`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

import { useEffect, useState } from 'react';

import { ApiError, apiBlob } from './api-client';

/** Enough for every face on a busy screen, and a ceiling on what one long session can hold. */
const MAX_CACHED_PHOTOS = 200;

/**
 * Photo bytes by `userId:version`, shared by every avatar on the page.
 *
 * Blobs rather than object URLs: each avatar makes its own URL from the shared blob and revokes it
 * when it goes away, so one avatar unmounting can never pull the picture out from under another.
 * The version changes with every upload, so an entry never goes stale — it only stops being asked
 * for — and the oldest is dropped once the cache is full.
 */
const photos = new Map<string, Promise<Blob | null>>();

function photoBlob(userId: string, version: string): Promise<Blob | null> {
  const key = `${userId}:${version}`;
  const cached = photos.get(key);
  if (cached) {
    return cached;
  }
  const pending = apiBlob(
    `/users/${encodeURIComponent(userId)}/avatar?v=${encodeURIComponent(version)}`,
  ).catch((cause: unknown) => {
    // A 404 is an answer — there is no photo — and asking again would get the same one. Anything
    // else may be the network, so the next avatar to need this photo tries again.
    if (!(cause instanceof ApiError && cause.status === 404)) {
      photos.delete(key);
    }
    return null;
  });
  photos.set(key, pending);
  if (photos.size > MAX_CACHED_PHOTOS) {
    const oldest = photos.keys().next().value;
    if (oldest !== undefined) {
      photos.delete(oldest);
    }
  }
  return pending;
}

/** Empties the cache. For tests, which must not see each other's photos. */
export function forgetAvatarPhotos(): void {
  photos.clear();
}

/**
 * A person's photo as something `<img src>` can point at, or null while it loads or if it cannot.
 *
 * Fetched through the api client because the photo sits behind the bearer token like every other
 * route, and an `<img>` pointed straight at it would send no token and get a 401.
 */
export function useAvatarPhotoUrl(
  userId: string | null | undefined,
  version: string | null | undefined,
): string | null {
  const key = userId && version ? `${userId}:${version}` : null;
  // The key is held beside the url so that a change of person reads as "no photo yet" on the very
  // next render, rather than showing the previous person's face until the effect catches up.
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!userId || !version) {
      return undefined;
    }
    let objectUrl: string | undefined;
    let cancelled = false;
    void photoBlob(userId, version).then((blob) => {
      if (cancelled || !blob) {
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ key: `${userId}:${version}`, url: objectUrl });
    });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [userId, version]);

  return loaded && loaded.key === key ? loaded.url : null;
}

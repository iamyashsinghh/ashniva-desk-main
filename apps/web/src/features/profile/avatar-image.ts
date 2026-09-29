import { AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES } from '@ashniva/types';

/** Sharp at the largest size any screen draws an avatar, and small enough to upload in a moment. */
const AVATAR_EDGE_PX = 512;
const JPEG_QUALITY = 0.88;

export type PreparedAvatar =
  { ok: true; photo: Blob; fileName: string } | { ok: false; message: string };

/** Past this a file is not a photo worth decoding in a tab; a phone camera shot is well under it. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/**
 * Makes a chosen file a small square JPEG, then checks it against what the API accepts.
 *
 * Shrinking comes first, so a 6 MB photo straight off a phone becomes a few hundred kilobytes and
 * goes through, rather than being refused for a size the upload would never have had. The size
 * check repeats the server's so somebody hears "too large" before waiting on an upload that was
 * always going to be refused — the server still checks the bytes, and is the one that decides.
 *
 * Shrinking is best effort: a browser that cannot decode the image into a canvas uploads the file
 * as chosen, if that is within the limit.
 */
export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: 'Choose a JPEG, PNG or WebP picture.' };
  }
  const shrunk = file.size <= MAX_SOURCE_BYTES ? await squareJpeg(file).catch(() => null) : null;
  if (shrunk && shrunk.size <= MAX_AVATAR_BYTES && shrunk.size < file.size) {
    return { ok: true, photo: shrunk, fileName: 'avatar.jpg' };
  }
  if (file.size <= MAX_AVATAR_BYTES) {
    return { ok: true, photo: file, fileName: file.name };
  }
  const limitMb = MAX_AVATAR_BYTES / (1024 * 1024);
  return {
    ok: false,
    message: `That picture is larger than ${limitMb} MB and could not be made smaller here. Choose a smaller one.`,
  };
}

/** The centre square of the image, at most `AVATAR_EDGE_PX` on a side, as a JPEG. Null if unsupported. */
async function squareJpeg(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function') {
    return null;
  }
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const edge = Math.min(side, AVATAR_EDGE_PX);
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    // JPEG has no transparency, and a transparent PNG would otherwise come out on black. This is
    // the photo's own background, not interface colour, so it is not a theme token.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, edge, edge);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      edge,
      edge,
    );
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
  } finally {
    bitmap.close();
  }
}

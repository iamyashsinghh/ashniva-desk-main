/**
 * What Desk accepts as an attachment, and what it calls the result.
 *
 * Size and content type live in `@ashniva/types` because the clients need them too: a phone that
 * cannot see the rules can only discover them by sending the file. This module stays the API's
 * door to them — both upload paths (a signed-in person through `POST /files`, and an external
 * product through the support ingress) import from here, and the API still checks every upload
 * whatever a client believed.
 */

export { MAX_FILE_BYTES, isAllowedContentType } from '@ashniva/types';

/**
 * The families of file the allow-list actually contains.
 *
 * Coarser than the MIME types on purpose: `.docx` and `.xlsx` are ZIP archives and `.doc` and
 * `.xls` are both OLE2 compound files, so the bytes cannot tell them apart and pretending
 * otherwise would only reject legitimate uploads.
 */
type ContentKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf' | 'zip' | 'ole2' | 'text';

const KIND_BY_CONTENT_TYPE: Record<string, ContentKind> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'zip',
  'application/msword': 'ole2',
  'application/vnd.ms-excel': 'ole2',
  'text/plain': 'text',
  'text/csv': 'text',
  'application/json': 'text',
};

function startsWith(buffer: Buffer, bytes: readonly number[]): boolean {
  if (buffer.length < bytes.length) {
    return false;
  }
  return bytes.every((byte, index) => buffer[index] === byte);
}

/** Leading bytes that identify a format, longest and most specific first. */
const SIGNATURES: readonly { kind: ContentKind; matches: (buffer: Buffer) => boolean }[] = [
  { kind: 'png', matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { kind: 'jpeg', matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    kind: 'gif',
    matches: (b) =>
      b
        .subarray(0, 6)
        .toString('latin1')
        .match(/^GIF8[79]a$/) !== null,
  },
  {
    // RIFF container; the format only becomes WebP at byte 8.
    kind: 'webp',
    matches: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { kind: 'pdf', matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  {
    // PK\x03\x04 for a normal archive; \x05\x06 empty and \x07\x08 spanned are legal too.
    kind: 'zip',
    matches: (b) =>
      startsWith(b, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWith(b, [0x50, 0x4b, 0x05, 0x06]) ||
      startsWith(b, [0x50, 0x4b, 0x07, 0x08]),
  },
  {
    kind: 'ole2',
    matches: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  },
];

/** The format the bytes say this is, or undefined when they carry no known signature. */
function detectKind(buffer: Buffer): ContentKind | undefined {
  return SIGNATURES.find((signature) => signature.matches(buffer))?.kind;
}

/** UTF-16 byte-order marks: little-endian first, as Windows and Excel write them. */
const UTF16_BOMS: readonly (readonly number[])[] = [
  [0xff, 0xfe],
  [0xfe, 0xff],
];

/**
 * Whether a buffer with no signature is plausibly the text it claims to be.
 *
 * Text formats have no magic bytes, so what can be checked is that the content is not something
 * else: **no NUL bytes, and no known binary signature** (the caller has already ruled the second
 * one out). That refuses an executable or an unrecognised binary sent as `text/plain`, which is
 * the case worth refusing, and it is all this can honestly claim — it does not, and cannot, prove
 * the content is CSV or JSON.
 *
 * It deliberately does **not** demand valid UTF-8, which is what it used to do. Desk accepts logs
 * and CSVs from whatever produced them, and the encodings that arrive are not all UTF-8: a
 * Windows-1252 log line containing `café` is a bare 0xE9 and was rejected, as was every other
 * legacy-encoded export. The file is stored, served as an attachment with `nosniff`, and never
 * interpreted by us, so its encoding is the reader's business; whether it is a program is ours.
 *
 * The UTF-16 exception is the one place the rules collide. Excel's "Unicode Text" export is
 * UTF-16LE, in which every ASCII character is a byte followed by 0x00 — a legitimate text file
 * that is more than half NUL. A byte-order mark says how to read the bytes, so they are read that
 * way and held to the same standard two at a time, rather than waved through.
 *
 * (There is no UTF-8 round trip left to be truncated. The bug that motivated this — sampling the
 * first 1 MiB by byte offset and then round-tripping it, which fails whenever the boundary lands
 * mid-character, so any UTF-8 log over a megabyte was refused — is gone with the round trip. The
 * NUL scan is offset-safe: a NUL is a NUL wherever the sample stops.)
 */
function looksLikeText(buffer: Buffer): boolean {
  const utf16 = UTF16_BOMS.findIndex((bom) => startsWith(buffer, bom));
  if (utf16 >= 0) {
    return looksLikeUtf16Text(buffer, utf16 === 0);
  }
  // A megabyte is far more than enough to notice binary content, and bounds the cost.
  return !buffer.subarray(0, 1024 * 1024).includes(0);
}

/**
 * The same "no NUL" rule, read two bytes at a time.
 *
 * A byte-order mark is not a licence: it says how to read the bytes, so they are read that way and
 * judged by the same standard. U+0000 does not occur in text, and an odd number of bytes after the
 * mark is not UTF-16 at all — which is what stops the mark being used as a two-byte prefix that
 * waves an arbitrary binary through.
 */
function looksLikeUtf16Text(buffer: Buffer, littleEndian: boolean): boolean {
  if ((buffer.length - 2) % 2 !== 0) {
    return false;
  }
  const body = buffer.subarray(2, 2 + 1024 * 1024);
  for (let offset = 0; offset + 1 < body.length; offset += 2) {
    const unit = littleEndian ? body.readUInt16LE(offset) : body.readUInt16BE(offset);
    if (unit === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Whether the bytes agree with the content type the caller declared.
 *
 * `isAllowedContentType` only ever saw a string the client chose. A browser takes it from the
 * file's extension and an API client can put anything it likes there, so "the type is on the
 * allow-list" said nothing at all about what was being stored: an executable named `notes.txt`,
 * or an HTML page declared `image/png`, passed every check and was then handed back to whoever
 * downloaded it with the type the attacker picked.
 *
 * This is a sniff, not a parse. It answers "do the first bytes belong to the family this type
 * belongs to", which is what defeats a renamed file; it does not attempt to validate the format.
 */
export function contentMatchesDeclaredType(buffer: Buffer, contentType: string): boolean {
  const expected = KIND_BY_CONTENT_TYPE[contentType];
  if (!expected) {
    // Not on the allow-list. `isAllowedContentType` is the check for that, and it runs first.
    return false;
  }
  const detected = detectKind(buffer);
  if (expected === 'text') {
    // A signature means the bytes are a known binary format, whatever the declared type says.
    return detected === undefined && looksLikeText(buffer);
  }
  return detected === expected;
}

/**
 * A safe display name.
 *
 * Strips any directory part first: a name like `../../etc/passwd` is a filename in a form field,
 * not a path, and treating it as one is how a filename becomes a traversal. What survives is used
 * only for display and as the tail of a server-generated storage key.
 */
export function sanitizeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^\w.\-() ]+/g, '_').slice(0, 150) || 'file';
}

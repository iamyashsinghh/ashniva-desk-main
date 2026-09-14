import { inflateSync } from 'node:zlib';

/** True when the bytes are a PDF, even if the stored MIME type is slightly off. */
export function looksLikePdf(buffer: Buffer, contentType: string): boolean {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return true;
  }
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mime === 'application/pdf' || mime === 'application/x-pdf';
}

/**
 * Best-effort text from a PDF buffer, without a vendor extractor.
 *
 * Many project briefs are simple enough that the text operators survive FlateDecode. If nothing
 * readable comes out, the caller asks for a different file rather than inventing phases.
 */
export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const chunks: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match = streamPattern.exec(raw);
  while (match) {
    const payload = Buffer.from(match[1] ?? '', 'latin1');
    let decoded = payload;
    try {
      decoded = inflateSync(payload);
    } catch {
      try {
        decoded = inflateSync(payload.subarray(2));
      } catch {
        decoded = payload;
      }
    }
    chunks.push(stringsFromPdf(decoded.toString('latin1')));
    match = streamPattern.exec(raw);
  }
  const fromStreams = chunks.join('\n').replace(/[^\S\n]+/g, ' ').trim();
  if (fromStreams.length >= 20) {
    return fromStreams;
  }
  return stringsFromPdf(raw);
}

function stringsFromPdf(source: string): string {
  const out: string[] = [];
  const pattern = /\(((?:\\.|[^\\)])*)\)/g;
  let match = pattern.exec(source);
  while (match) {
    const value = unescapePdf(match[1] ?? '');
    if (value.trim().length > 0) {
      out.push(value);
    }
    match = pattern.exec(source);
  }
  return out.join('\n');
}

function unescapePdf(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

export async function bufferFromStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

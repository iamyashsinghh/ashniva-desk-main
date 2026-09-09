import { LIMITS, type SupportAttachment } from './contract';
import { SupportValidationError } from './validation';

/**
 * Turning what a browser has into what the ingress takes.
 *
 * The ingress accepts base64 rather than multipart, which keeps one code path for a file a
 * reporter chose and a screenshot the page produced, and keeps the whole request atomic — a
 * ticket and its attachments commit together or not at all.
 */

/** Reads a `File` or `Blob` into an attachment, refusing one that is too large to send. */
export async function attachmentFromFile(file: File): Promise<SupportAttachment> {
  if (file.size > LIMITS.attachmentBytesMax) {
    throw new SupportValidationError('attachments', 'Files are limited to 10 MB');
  }
  return {
    filename: file.name.slice(0, LIMITS.filenameMax),
    contentType: file.type || 'application/octet-stream',
    content: await toBase64(file),
  };
}

/**
 * Turns a canvas the host application produced into an attachment.
 *
 * The SDK does not take the screenshot. Capturing a page needs either a screen-capture permission
 * prompt or a DOM-rasterising library, and both are decisions for the application that owns the
 * page — one of them interrupts the user, and the other quietly ships a large dependency into
 * every page. What the SDK does is accept the result, so a host that already renders to a canvas
 * (`html2canvas`, `getDisplayMedia`, its own WebGL surface) can attach it in one call.
 */
export function attachmentFromCanvas(
  canvas: HTMLCanvasElement,
  filename = 'screenshot.png',
): SupportAttachment {
  const dataUrl = canvas.toDataURL('image/png');
  return {
    filename: filename.slice(0, LIMITS.filenameMax),
    contentType: 'image/png',
    content: dataUrl.slice(dataUrl.indexOf(',') + 1),
  };
}

/** `FileReader` gives a data URL; the ingress wants only the payload after the comma. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new SupportValidationError('attachments', 'That file could not be read'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

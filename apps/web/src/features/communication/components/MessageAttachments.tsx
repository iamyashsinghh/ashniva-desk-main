import type { FileSummary } from '@ashniva/types';

import { downloadFile, useFileObjectUrl } from '../../files/api';

export interface MessageAttachmentsProps {
  files: readonly FileSummary[];
  onError: (cause: unknown) => void;
}

/** Rounded to the nearest kilobyte, with a floor of one: "0 KB" reads as a broken upload. */
function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * What a message carries besides its words.
 *
 * An image is shown rather than named. Files are served behind the bearer token, so the bytes are
 * fetched the way every other request is and handed to the browser as an object URL — the same
 * mechanism the group picture uses — and the thumbnail is a link to the full download rather than
 * a second copy of it.
 *
 * Everything else stays a named row with its size, because a filename is what somebody recognises
 * and a generic file icon is not.
 */
export function MessageAttachments({ files, onError }: MessageAttachmentsProps) {
  if (files.length === 0) {
    return null;
  }
  return (
    <ul className="chat-message__files">
      {files.map((file) => (
        <li key={file.id}>
          {file.contentType.startsWith('image/') ? (
            <ImageAttachment file={file} onError={onError} />
          ) : (
            <button
              type="button"
              className="chat-message__file"
              onClick={() => void download(file, onError)}
            >
              <span aria-hidden="true" className="chat-message__file-icon">
                ⎙
              </span>
              <span className="chat-message__file-name">{file.name}</span>
              <span className="timeline__note">{sizeLabel(file.sizeBytes)}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ImageAttachment({
  file,
  onError,
}: {
  file: FileSummary;
  onError: (cause: unknown) => void;
}) {
  const url = useFileObjectUrl(file.id);
  return (
    <button
      type="button"
      className="chat-message__image"
      aria-label={`Download ${file.name}`}
      onClick={() => void download(file, onError)}
    >
      {url ? (
        <img src={url} alt={file.name} />
      ) : (
        <span className="chat-message__image-pending">{file.name}</span>
      )}
    </button>
  );
}

async function download(file: FileSummary, onError: (cause: unknown) => void): Promise<void> {
  try {
    await downloadFile(file);
  } catch (cause) {
    onError(cause);
  }
}

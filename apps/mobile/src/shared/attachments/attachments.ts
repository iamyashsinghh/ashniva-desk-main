import {
  ALLOWED_FILE_CONTENT_TYPES,
  MAX_FILE_BYTES,
  VISIBILITY,
  isAllowedContentType,
  type FileSummary,
  type Visibility,
} from '@ashniva/types';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useSyncExternalStore } from 'react';

import { getAccessToken, subscribeToSession } from '../../features/auth/session-store';
import { apiRequest } from '../api/client';

/**
 * Attachments.
 *
 * Two pickers rather than one, because the two things people attach from a phone arrive by
 * different doors. A screenshot of the bug is in the camera roll and `expo-image-picker` is the
 * one that reaches it; a log file or a signed PDF is in Files or Drive, and only the document
 * picker sees those. A single picker would mean somebody standing in front of the problem cannot
 * send the picture of it.
 *
 * The upload goes through `POST /files`, the same endpoint the web app uses, over the shared
 * client — so it carries the bearer token and shares the single-flight refresh. There is no
 * second upload path and no direct-to-storage URL.
 */

/**
 * The largest file this app will try to send, and the types it will send at all.
 *
 * Both come from `@ashniva/types`, the same values the API checks against, rather than being
 * copied here — a copy drifts, and a client copy that drifts loose is one that lets an upload run
 * to completion before the API refuses it. The API remains the authority; this exists so a 40 MB
 * video or a 9 MB screen recording is refused on the device rather than after four minutes of
 * somebody's cellular data.
 */
export const MAX_ATTACHMENT_BYTES = MAX_FILE_BYTES;

/** A file the person chose, in the shape the upload needs. */
export interface PickedFile {
  /** A local `file://` URI. Never sent anywhere but the multipart body. */
  uri: string;
  name: string;
  /** What the picker reported. Checked against the shared allow-list; the API has the final word. */
  type: string;
  /** Null when the picker did not report one — then only the API can refuse it for size. */
  sizeBytes: number | null;
}

/**
 * What the attachment is being hung on. Exactly one, mirroring what `POST /files` accepts.
 *
 * `UNPARENTED` is the fourth case and it is not a gap. A file destined for a message is uploaded
 * with **no** parent, and then named in `attachmentIds` when the message is sent: the message
 * transaction adopts a file only if nothing else already owns it, which is what stops a message
 * carrying a ticket's attachment into a conversation the ticket's readers cannot see. Naming a
 * parent here would make the file unadoptable and the attachment would silently not appear.
 */
export type AttachmentTarget =
  { taskId: string } | { ticketId: string } | { projectId: string } | Record<string, never>;

/** A file that will be adopted by the message it is sent with. See `AttachmentTarget`. */
export const UNPARENTED: Record<string, never> = {};

/** Thrown before anything is uploaded, when the file is bigger than the API will take. */
export class AttachmentTooLargeError extends Error {
  constructor() {
    super(`That file is larger than ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB`);
    this.name = 'AttachmentTooLargeError';
  }
}

/** Thrown before anything is uploaded, when the API would refuse the file's type. */
export class AttachmentTypeError extends Error {
  constructor(contentType: string) {
    super(`${contentType} files cannot be attached`);
    this.name = 'AttachmentTypeError';
  }
}

/** True when the file is over the limit and the upload should not be attempted. */
export function isTooLarge(file: PickedFile): boolean {
  return file.sizeBytes !== null && file.sizeBytes > MAX_ATTACHMENT_BYTES;
}

/** True when the API's allow-list covers this file's type, so the upload is worth attempting. */
export function isAllowedType(file: PickedFile): boolean {
  return isAllowedContentType(file.type);
}

/**
 * A photo or screenshot from the library.
 *
 * Returns null when the person cancelled or refused access, rather than throwing: backing out of
 * a picker is an ordinary thing to do and is not an error worth a dialog.
 */
export async function pickImage(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // One at a time. A multi-select would want a queue, a per-file progress row and a partial
    // failure story, none of which this screen has.
    allowsMultipleSelection: false,
    quality: 0.8,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) {
    return null;
  }

  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo-${Date.now()}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
    sizeBytes: asset.fileSize ?? null,
  };
}

/** A document from Files, Drive or wherever else the platform offers. */
export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    // The same allow-list the API enforces, so the browser greys out what would be refused
    // anyway. It is a hint and not a guarantee — a provider can hand back something else, and
    // Android reports an unknown type as `application/octet-stream` — so `uploadAttachment`
    // checks the answer rather than trusting the filter.
    type: [...ALLOWED_FILE_CONTENT_TYPES],
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) {
    return null;
  }

  return {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? 'application/octet-stream',
    sizeBytes: asset.size ?? null,
  };
}

/**
 * Uploads the file and returns the attachment the API created.
 *
 * Size and type are both refused here, before the request, for the same reason: the API says no to
 * either, but only once the whole file has arrived. A 9 MB screen recording on cellular is several
 * minutes of somebody's data spent to be told what was knowable at the moment they picked it.
 *
 * Visibility defaults to internal. That is the safe default everywhere in this system and it is
 * the only sensible one on a phone: a client-visible attachment is a decision taken with the
 * client's reading of it in mind, not a switch to leave in whatever state it was last in.
 */
export async function uploadAttachment(
  file: PickedFile,
  target: AttachmentTarget,
  visibility: Visibility = VISIBILITY.INTERNAL,
): Promise<FileSummary> {
  if (isTooLarge(file)) {
    throw new AttachmentTooLargeError();
  }
  if (!isAllowedType(file)) {
    throw new AttachmentTypeError(file.type);
  }

  const form = new FormData();
  // React Native's FormData takes this three-field object where a browser takes a Blob, and reads
  // the file off disk while it streams the request — so a large attachment is never in memory.
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  for (const [field, value] of Object.entries(target)) {
    form.append(field, value);
  }
  form.append('visibility', visibility);

  return apiRequest<FileSummary>('/files', { method: 'POST', body: form });
}

/** Whether an attachment is something the phone can show inline. */
export function isViewableImage(file: FileSummary): boolean {
  return file.contentType.startsWith('image/');
}

/**
 * The current access token, re-rendering the caller when it changes.
 *
 * A screen showing attachments has to subscribe rather than read once. `Image` requests the file
 * itself, outside the API client, so a picture whose request 401s cannot take the client's retry
 * path: nothing re-renders it and it stays broken until the screen is remounted. Subscribing means
 * that when the shared refresh commits a new token — a refresh some other request on the screen
 * provoked — every source is rebuilt with it and `Image` fetches the picture again.
 */
export function useAccessTokenForImages(): string | null {
  return useSyncExternalStore(subscribeToSession, getAccessToken);
}

/**
 * The source for showing an attachment.
 *
 * `GET /files/:id/download` streams through the API after its access checks, so the request needs
 * the bearer token — React Native's `Image` takes headers for exactly this. The token is a
 * parameter rather than read here, so a screen passes one it is subscribed to
 * (`useAccessTokenForImages`) and the picture is re-requested when the token changes.
 */
export function attachmentImageSource(
  file: FileSummary,
  baseUrl: string,
  token: string | null,
): { uri: string; headers: Record<string, string> } {
  return {
    uri: `${baseUrl}/files/${file.id}/download`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

/** A size somebody can read, for a row that has to say how big a file is. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

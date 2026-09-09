import { VISIBILITY } from '@ashniva/types';

import { resetSessionForTests, setSession } from '../../features/auth/session-store';
import {
  AttachmentTooLargeError,
  AttachmentTypeError,
  MAX_ATTACHMENT_BYTES,
  formatBytes,
  isAllowedType,
  isTooLarge,
  isViewableImage,
  pickImage,
  uploadAttachment,
} from './attachments';

/**
 * Attaching a file.
 *
 * Two things worth asserting. The upload goes through the shared client — the same bearer token,
 * the same refresh — as a multipart body the app does not describe, because React Native writes
 * the boundary. And a file the API will refuse — for its size or for its type — is refused on the
 * device, before a byte leaves it: the API refuses it too, but only after somebody's cellular data
 * has carried the whole thing.
 */

const user = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A',
  title: null,
  roleKey: 'DEVELOPER',
  roleId: 'r1',
  roleName: 'Developer',
  isCustomRole: false,
  permissions: [],
  showDevelopmentSection: true,
  organization: { id: 'o1', name: 'Org', slug: 'org', isServiceProvider: true },
  organizations: [],
} as unknown as Parameters<typeof setSession>[1];

const fetchMock = jest.fn();

const screenshot = {
  uri: 'file:///tmp/screenshot.png',
  name: 'screenshot.png',
  type: 'image/png',
  sizeBytes: 240_000,
};

/**
 * One field out of a multipart body.
 *
 * React Native's `FormData` type does not declare `get` — the runtime under jest does, and so does
 * every browser. Reading it through a narrow local shape keeps the assertion honest without
 * pretending the app's own type has a method it does not.
 */
function field(form: FormData, name: string): unknown {
  return (form as unknown as { get(name: string): unknown }).get(name);
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  } as unknown as Response;
}

beforeEach(() => {
  resetSessionForTests();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('uploading', () => {
  it('posts multipart to the shared files endpoint, with the bearer token', async () => {
    await setSession('access-1', user, 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'f1', name: 'screenshot.png' }));

    await expect(uploadAttachment(screenshot, { taskId: 't1' })).resolves.toEqual({
      id: 'f1',
      name: 'screenshot.png',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/files');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('does not name a Content-Type of its own', async () => {
    // React Native writes it, with the boundary it generated. One of ours would name a boundary
    // that is not in the body, and the API would see a single unparseable part.
    await setSession('access-1', user, 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'f1' }));

    await uploadAttachment(screenshot, { ticketId: 'k1' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('sends the target and an internal visibility', async () => {
    await setSession('access-1', user, 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'f1' }));

    await uploadAttachment(screenshot, { taskId: 't1' });

    const form = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as FormData;
    expect(field(form, 'taskId')).toBe('t1');
    // Client visibility is a decision taken with the client's reading of it in mind. Not here.
    expect(field(form, 'visibility')).toBe(VISIBILITY.INTERNAL);
  });
});

describe('a file over the limit', () => {
  const huge = { ...screenshot, name: 'demo.mp4', type: 'video/mp4', sizeBytes: 40 * 1024 * 1024 };

  it('is recognised before anything is sent', () => {
    expect(isTooLarge(huge)).toBe(true);
    expect(isTooLarge(screenshot)).toBe(false);
    expect(isTooLarge({ ...screenshot, sizeBytes: MAX_ATTACHMENT_BYTES })).toBe(false);
    expect(isTooLarge({ ...screenshot, sizeBytes: MAX_ATTACHMENT_BYTES + 1 })).toBe(true);
  });

  it('is refused without a request going out', async () => {
    await setSession('access-1', user, 'refresh-1');

    await expect(uploadAttachment(huge, { taskId: 't1' })).rejects.toBeInstanceOf(
      AttachmentTooLargeError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says how big is too big', async () => {
    await expect(uploadAttachment(huge, { taskId: 't1' })).rejects.toThrow('larger than 10 MB');
  });

  it('is uploaded anyway when the picker reported no size, and left to the API', async () => {
    // A picker that does not know the size is not evidence the file is small. The API is the
    // authority, and it refuses over its own limit. The type has to be one the app accepts, or
    // this would never get as far as the size question.
    const unknownSize = {
      ...screenshot,
      name: 'trace.pdf',
      type: 'application/pdf',
      sizeBytes: null,
    };
    await setSession('access-1', user, 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse(413, { message: 'File is too large' }));

    await expect(uploadAttachment(unknownSize, { taskId: 't1' })).rejects.toThrow(
      'File is too large',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('a file of a type the API does not accept', () => {
  // The case this exists for: a screen recording, comfortably under the size limit, on cellular.
  // Without a client-side check the whole 9 MB crosses the network to earn a 400.
  const recording = {
    uri: 'file:///tmp/demo.mov',
    name: 'demo.mov',
    type: 'video/quicktime',
    sizeBytes: 9 * 1024 * 1024,
  };

  it('is recognised from the shared allow-list', () => {
    expect(isAllowedType(recording)).toBe(false);
    expect(isAllowedType(screenshot)).toBe(true);
    // The document picker's fallback for a type the platform could not name. The API refuses it,
    // so the app does too rather than spending the upload to find out.
    expect(isAllowedType({ ...screenshot, type: 'application/octet-stream' })).toBe(false);
  });

  it('is refused without a request going out', async () => {
    await setSession('access-1', user, 'refresh-1');

    await expect(uploadAttachment(recording, { taskId: 't1' })).rejects.toBeInstanceOf(
      AttachmentTypeError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says which type was refused', async () => {
    await expect(uploadAttachment(recording, { taskId: 't1' })).rejects.toThrow(
      'video/quicktime files cannot be attached',
    );
  });
});

describe('the picker', () => {
  it('returns nothing when the person backs out', async () => {
    // Cancelling is an ordinary thing to do, not an error worth a dialog.
    await expect(pickImage()).resolves.toBeNull();
  });
});

describe('display helpers', () => {
  it('knows what the phone can show inline', () => {
    const file = { contentType: 'image/png' } as Parameters<typeof isViewableImage>[0];
    const pdf = { contentType: 'application/pdf' } as Parameters<typeof isViewableImage>[0];
    expect(isViewableImage(file)).toBe(true);
    expect(isViewableImage(pdf)).toBe(false);
  });

  it('writes a size somebody can read', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

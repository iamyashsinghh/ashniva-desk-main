import type { SessionUser } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

import { jsonResponse, renderScreen, sessionUser } from '../../shared/testing/harness';
import { useSession } from '../auth/SessionProvider';
import { ProfileHeader } from './ProfileHeader';
import { ProfilePictureSheet } from './ProfilePictureSheet';

/**
 * Changing your profile picture. Each choice sends what the API documents — multipart for a
 * photo, the preset's key, a DELETE — and the header shows the result as soon as it is accepted.
 * A photo the API would refuse, or a refused permission, sends nothing and says why.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const fetchMock = jest.fn();
const hidden = { includeHiddenElements: true };

/** The header and the sheet over the real session, as the profile screen puts them together. */
function Harness() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  if (!user) {
    return null;
  }
  return (
    <>
      <ProfileHeader user={user} onEditPicture={() => setOpen(true)} />
      <ProfilePictureSheet visible={open} user={user} onClose={() => setOpen(false)} />
    </>
  );
}

async function openSheet(user: SessionUser) {
  restoreSession.mockResolvedValue({ status: 'signed-in', user });
  const view = await renderScreen(<Harness />);
  await fireEvent.press(await view.findByRole('button', { name: 'Change profile picture' }));
  return view;
}

function picked(overrides: Partial<ImagePicker.ImagePickerAsset> = {}) {
  return {
    canceled: false,
    assets: [
      {
        uri: 'file:///tmp/me.jpg',
        fileName: 'me.jpg',
        mimeType: 'image/jpeg',
        fileSize: 180_000,
        width: 600,
        height: 600,
        ...overrides,
      },
    ],
  } as ImagePicker.ImagePickerResult;
}

function avatarCall() {
  return fetchMock.mock.calls.find(([url]) => String(url).endsWith('/users/me/avatar')) as
    [string, RequestInit] | undefined;
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('uploads a photo from the library as multipart, cropped square', async () => {
  // Jest's FormData stringifies what React Native's reads off disk, so the part is checked as it
  // is appended rather than read back out of the body.
  const append = jest.spyOn(FormData.prototype, 'append');
  picker.launchImageLibraryAsync.mockResolvedValueOnce(picked());
  fetchMock.mockResolvedValue(jsonResponse({ kind: 'photo', version: 'v2' }));
  const view = await openSheet(sessionUser());

  await fireEvent.press(view.getByRole('button', { name: 'Choose from library' }));

  await waitFor(() => expect(view.queryByText('Profile picture')).toBeNull());
  expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(
    expect.objectContaining({ allowsEditing: true, aspect: [1, 1], quality: 0.7 }),
  );
  const [, init] = avatarCall()!;
  expect(init.method).toBe('POST');
  expect(init.body).toBeInstanceOf(FormData);
  expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  expect(append).toHaveBeenCalledWith('file', {
    uri: 'file:///tmp/me.jpg',
    name: 'me.jpg',
    type: 'image/jpeg',
  });
  append.mockRestore();
});

it('takes a photo with the camera after asking for it', async () => {
  picker.launchCameraAsync.mockResolvedValueOnce(picked());
  fetchMock.mockResolvedValue(jsonResponse({ kind: 'photo', version: 'v3' }));
  const view = await openSheet(sessionUser());

  await fireEvent.press(view.getByRole('button', { name: 'Take photo' }));

  await waitFor(() => expect(avatarCall()).toBeDefined());
  expect(picker.requestCameraPermissionsAsync).toHaveBeenCalled();
  expect(avatarCall()![1].method).toBe('POST');
});

it('puts a chosen preset and shows it in the header straight away', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ kind: 'preset', preset: 'rocket' }));
  const view = await openSheet(sessionUser());

  await fireEvent.press(view.getByRole('button', { name: 'Choose an avatar' }));
  await fireEvent.press(view.getByRole('button', { name: 'Rocket avatar' }));

  await waitFor(() => expect(view.queryByText('Choose an avatar')).toBeNull());
  const [, init] = avatarCall()!;
  expect(init.method).toBe('PUT');
  expect(JSON.parse(String(init.body))).toEqual({ preset: 'rocket' });
  expect(view.getByTestId('person-avatar-preset', hidden)).toBeTruthy();
});

it('deletes the picture and goes back to initials', async () => {
  fetchMock.mockResolvedValue(jsonResponse(null, 204));
  const view = await openSheet(sessionUser({ avatar: { kind: 'preset', preset: 'leaf' } }));
  expect(view.getByTestId('person-avatar-preset', hidden)).toBeTruthy();

  await fireEvent.press(view.getByRole('button', { name: 'Remove picture' }));

  await waitFor(() => expect(view.queryByTestId('person-avatar-preset', hidden)).toBeNull());
  expect(avatarCall()![1].method).toBe('DELETE');
  expect(view.getByText('SP', hidden)).toBeTruthy();
});

it('offers no removal when there is nothing to remove', async () => {
  const view = await openSheet(sessionUser());

  expect(view.queryByRole('button', { name: 'Remove picture' })).toBeNull();
});

it('refuses a photo over the limit without sending it', async () => {
  picker.launchImageLibraryAsync.mockResolvedValueOnce(picked({ fileSize: 3 * 1024 * 1024 }));
  const view = await openSheet(sessionUser());

  await fireEvent.press(view.getByRole('button', { name: 'Choose from library' }));

  expect(await view.findByText(/larger than 2 MB/)).toBeTruthy();
  expect(avatarCall()).toBeUndefined();
});

it('says how to allow the camera when access is refused', async () => {
  picker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted: false,
  } as Awaited<ReturnType<typeof ImagePicker.requestCameraPermissionsAsync>>);
  const view = await openSheet(sessionUser());

  await fireEvent.press(view.getByRole('button', { name: 'Take photo' }));

  expect(await view.findByText(/Allow camera access/)).toBeTruthy();
  expect(picker.launchCameraAsync).not.toHaveBeenCalled();
});

it('keeps the sheet open with the API’s words when an upload is refused', async () => {
  picker.launchImageLibraryAsync.mockResolvedValueOnce(picked());
  fetchMock.mockResolvedValue(jsonResponse({ message: 'That file is not an image' }, 400));
  const view = await openSheet(sessionUser());

  await fireEvent.press(view.getByRole('button', { name: 'Choose from library' }));

  expect(await view.findByText('That file is not an image')).toBeTruthy();
  expect(view.getByText('Profile picture')).toBeTruthy();
});

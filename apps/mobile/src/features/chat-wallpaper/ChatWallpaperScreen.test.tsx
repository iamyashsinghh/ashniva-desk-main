import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { ChatWallpaperScreen } from './ChatWallpaperScreen';
import { getChatWallpaper, resetWallpaperStoreForTests } from './wallpaper-store';

/**
 * The wallpaper screen: every choice applies at once, to this chat or to all of them, and the
 * preview draws what was chosen.
 */

const documents = FileSystem as unknown as {
  __files: Set<string>;
  __contents: Map<string, string>;
};
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

function renderScreen(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const name of [...documents.__files]) {
    if (name.startsWith('chat-wallpaper')) {
      documents.__files.delete(name);
      documents.__contents.delete(name);
    }
  }
  resetWallpaperStoreForTests();
});

it('sets a colour for every chat when opened from the profile', async () => {
  const view = await renderScreen(<ChatWallpaperScreen />);
  expect(view.queryByText('Apply to')).toBeNull();

  await fireEvent.press(view.getByRole('radio', { name: 'Soft green' }));

  expect(getChatWallpaper()).toEqual({ kind: 'color', token: 'successSoft' });
  expect(view.getByRole('radio', { name: 'Soft green' }).props.accessibilityState).toMatchObject({
    checked: true,
  });
});

it('sets a wallpaper for just this chat, then for all of them', async () => {
  const view = await renderScreen(<ChatWallpaperScreen conversationId="c1" />);

  await fireEvent.press(view.getByRole('radio', { name: 'Blue' }));
  expect(getChatWallpaper('c1')).toEqual({ kind: 'color', token: 'info' });
  expect(getChatWallpaper()).toEqual({ kind: 'none' });

  await fireEvent.press(view.getByRole('radio', { name: 'All chats' }));
  await fireEvent.press(view.getByRole('radio', { name: 'Stone' }));
  expect(getChatWallpaper()).toEqual({ kind: 'color', token: 'surfaceSunken' });
  expect(getChatWallpaper('c1')).toEqual({ kind: 'color', token: 'info' });
});

it('lets a chat go back to the wallpaper for all chats', async () => {
  const view = await renderScreen(<ChatWallpaperScreen conversationId="c1" />);
  await fireEvent.press(view.getByRole('radio', { name: 'Amber' }));

  await fireEvent.press(view.getByRole('button', { name: 'Use the same as all chats' }));

  expect(getChatWallpaper('c1')).toEqual({ kind: 'none' });
  expect(view.queryByRole('button', { name: 'Use the same as all chats' })).toBeNull();
});

it('uses a picture from the library, uncropped, and previews it', async () => {
  picker.launchImageLibraryAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: 'file:///cache/beach.jpg', width: 1170, height: 2532 }],
  } as ImagePicker.ImagePickerResult);
  const view = await renderScreen(<ChatWallpaperScreen />);

  await fireEvent.press(view.getByRole('button', { name: 'Choose from library' }));

  await waitFor(() => expect(getChatWallpaper().kind).toBe('image'));
  expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(
    expect.objectContaining({ allowsEditing: false, quality: 0.8 }),
  );
  expect(view.getByTestId('wallpaper-image')).toBeTruthy();
});

it('goes back to no wallpaper', async () => {
  const view = await renderScreen(<ChatWallpaperScreen />);
  await fireEvent.press(view.getByRole('radio', { name: 'Soft rose' }));

  await fireEvent.press(view.getByRole('button', { name: 'Default, no wallpaper' }));

  expect(getChatWallpaper()).toEqual({ kind: 'none' });
});

it('says how to allow photos when access is refused', async () => {
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
    granted: false,
  } as Awaited<ReturnType<typeof ImagePicker.requestMediaLibraryPermissionsAsync>>);
  const view = await renderScreen(<ChatWallpaperScreen />);

  await fireEvent.press(view.getByRole('button', { name: 'Choose from library' }));

  expect(await view.findByText(/Allow photo access/)).toBeTruthy();
  expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
});

it('calls back when done', async () => {
  const onDone = jest.fn();
  const view = await renderScreen(<ChatWallpaperScreen onDone={onDone} />);

  await fireEvent.press(view.getByRole('button', { name: 'Done' }));

  expect(onDone).toHaveBeenCalled();
});

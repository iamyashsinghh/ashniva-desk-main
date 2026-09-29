import { act, render } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system';
import { Text } from 'react-native';

import {
  clearOverride,
  getChatWallpaper,
  hasWallpaperOverride,
  resetWallpaperStoreForTests,
  setWallpaper,
  useChatWallpaper,
} from './wallpaper-store';

/**
 * The wallpaper preference: one for every chat, one per conversation that wins over it, kept in
 * the documents folder so it survives a restart, and never leaving a copied picture behind once
 * nothing uses it.
 */

const documents = FileSystem as unknown as {
  __files: Set<string>;
  __contents: Map<string, string>;
};

function wallpaperFiles(): string[] {
  return [...documents.__files].filter((name) => name.startsWith('chat-wallpaper')).sort();
}

function copiedImages(): string[] {
  return wallpaperFiles().filter((name) => name !== 'chat-wallpaper.json');
}

beforeEach(() => {
  for (const name of wallpaperFiles()) {
    documents.__files.delete(name);
    documents.__contents.delete(name);
  }
  resetWallpaperStoreForTests();
});

it('starts with no wallpaper', () => {
  expect(getChatWallpaper()).toEqual({ kind: 'none' });
  expect(getChatWallpaper('c1')).toEqual({ kind: 'none' });
});

it('lets a conversation’s own wallpaper win over the one for every chat', async () => {
  await setWallpaper({ kind: 'color', token: 'successSoft' });
  await setWallpaper({ kind: 'color', token: 'infoSoft' }, 'c1');

  expect(getChatWallpaper('c1')).toEqual({ kind: 'color', token: 'infoSoft' });
  expect(getChatWallpaper('c2')).toEqual({ kind: 'color', token: 'successSoft' });
  expect(getChatWallpaper()).toEqual({ kind: 'color', token: 'successSoft' });
  expect(hasWallpaperOverride('c1')).toBe(true);
  expect(hasWallpaperOverride('c2')).toBe(false);
});

it('falls back to the wallpaper for every chat when an override is cleared', async () => {
  await setWallpaper({ kind: 'color', token: 'warningSoft' });
  await setWallpaper({ kind: 'none' }, 'c1');
  expect(getChatWallpaper('c1')).toEqual({ kind: 'none' });

  clearOverride('c1');

  expect(getChatWallpaper('c1')).toEqual({ kind: 'color', token: 'warningSoft' });
  expect(hasWallpaperOverride('c1')).toBe(false);
});

it('copies a picked picture into the documents folder', async () => {
  await setWallpaper({ kind: 'image', uri: 'file:///cache/ImagePicker/picked.jpg' });

  const [copy] = copiedImages();
  expect(copy).toMatch(/^chat-wallpaper-.+\.jpg$/);
  expect(getChatWallpaper()).toEqual({ kind: 'image', uri: `file:///documents/${copy}` });
});

it('deletes the old copy when a picture is replaced', async () => {
  await setWallpaper({ kind: 'image', uri: 'file:///cache/first.jpg' });
  const [first] = copiedImages();

  await setWallpaper({ kind: 'image', uri: 'file:///cache/second.png' });

  const remaining = copiedImages();
  expect(remaining).toHaveLength(1);
  expect(remaining[0]).not.toBe(first);
  expect(remaining[0]).toMatch(/\.png$/);
});

it('deletes the copy when the wallpaper stops being a picture', async () => {
  await setWallpaper({ kind: 'image', uri: 'file:///cache/first.jpg' }, 'c1');

  clearOverride('c1');

  expect(copiedImages()).toEqual([]);
});

it('keeps a copy another chat still uses, and does not copy its own file twice', async () => {
  await setWallpaper({ kind: 'image', uri: 'file:///cache/shared.jpg' });
  const shared = getChatWallpaper();
  await setWallpaper(shared, 'c1');
  expect(copiedImages()).toHaveLength(1);

  await setWallpaper({ kind: 'none' });

  expect(copiedImages()).toHaveLength(1);
  expect(getChatWallpaper('c1')).toEqual(shared);
});

it('survives the module being loaded again, as on the next launch', async () => {
  await setWallpaper({ kind: 'color', token: 'dangerSoft' });
  await setWallpaper({ kind: 'image', uri: 'file:///cache/mine.jpg' }, 'c1');
  const expected = getChatWallpaper('c1');

  jest.isolateModules(() => {
    jest.doMock('expo-file-system', () => FileSystem);
    const fresh = jest.requireActual('./wallpaper-store') as {
      getChatWallpaper: typeof getChatWallpaper;
    };
    expect(fresh.getChatWallpaper()).toEqual({ kind: 'color', token: 'dangerSoft' });
    expect(fresh.getChatWallpaper('c1')).toEqual(expected);
  });
});

it('reads an unreadable preference file as no wallpaper', () => {
  documents.__files.add('chat-wallpaper.json');
  documents.__contents.set('chat-wallpaper.json', '{not json');

  expect(getChatWallpaper()).toEqual({ kind: 'none' });
});

it('ignores a stored colour that is not one of the theme’s', () => {
  documents.__files.add('chat-wallpaper.json');
  documents.__contents.set(
    'chat-wallpaper.json',
    JSON.stringify({ global: { kind: 'color', token: 'hotpink' }, overrides: {} }),
  );

  expect(getChatWallpaper()).toEqual({ kind: 'none' });
});

it('re-renders a screen when the wallpaper changes', async () => {
  function Probe() {
    const wallpaper = useChatWallpaper('c1');
    return <Text>{wallpaper.kind === 'color' ? wallpaper.token : wallpaper.kind}</Text>;
  }
  const view = await render(<Probe />);
  expect(view.getByText('none')).toBeTruthy();

  await act(async () => {
    await setWallpaper({ kind: 'color', token: 'primarySoft' });
  });
  expect(view.getByText('primarySoft')).toBeTruthy();

  await act(async () => {
    await setWallpaper({ kind: 'color', token: 'info' }, 'c1');
  });
  expect(view.getByText('info')).toBeTruthy();
});

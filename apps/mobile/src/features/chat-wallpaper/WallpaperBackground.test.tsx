import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { lightColors } from '../../shared/theme/theme';
import { WallpaperBackground } from './WallpaperBackground';

/** The background a thread sits on: its picture or colour, veiled, with the thread on top. */

function renderBackground(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

it('draws a picture behind a veil, with the children on top', async () => {
  const view = await renderBackground(
    <WallpaperBackground wallpaper={{ kind: 'image', uri: 'file:///documents/w.jpg' }}>
      <Text>Thread</Text>
    </WallpaperBackground>,
  );

  expect(view.getByTestId('wallpaper-image').props.source).toEqual({
    uri: 'file:///documents/w.jpg',
  });
  expect(view.getByTestId('wallpaper-veil')).toBeTruthy();
  expect(view.getByText('Thread')).toBeTruthy();
});

it('falls back to the plain background when the picture cannot be read', async () => {
  const view = await renderBackground(
    <WallpaperBackground wallpaper={{ kind: 'image', uri: 'file:///documents/gone.jpg' }} />,
  );

  await fireEvent(view.getByTestId('wallpaper-image'), 'error');

  expect(view.queryByTestId('wallpaper-image')).toBeNull();
  expect(view.getByTestId('wallpaper-plain')).toHaveStyle({
    backgroundColor: lightColors.background,
  });
});

it('paints a theme colour by its token', async () => {
  const view = await renderBackground(
    <WallpaperBackground wallpaper={{ kind: 'color', token: 'infoSoft' }} />,
  );

  expect(view.getByTestId('wallpaper-plain')).toHaveStyle({
    backgroundColor: lightColors.infoSoft,
  });
});

it('draws only the screen background, unveiled, with no wallpaper', async () => {
  const view = await renderBackground(<WallpaperBackground wallpaper={{ kind: 'none' }} />);

  expect(view.getByTestId('wallpaper-plain')).toHaveStyle({
    backgroundColor: lightColors.background,
  });
  expect(view.queryByTestId('wallpaper-veil')).toBeNull();
});

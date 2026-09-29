import type { SessionUser, UserAvatar } from '@ashniva/types';
import { fireEvent, render } from '@testing-library/react-native';

import { resetSessionForTests, setSession } from '../../features/auth/session-store';
import { sessionUser } from '../testing/harness';
import { ThemeProvider } from '../theme/ThemeProvider';
import { PersonAvatar } from './PersonAvatar';

/**
 * Drawing a person: their photo, their chosen preset, or their initials — and never an empty
 * circle when the photo cannot be had.
 *
 * The avatar is decorative (the row beside it reads the name), so every query here includes
 * hidden elements.
 */

const hidden = { includeHiddenElements: true };
const SAM: SessionUser = sessionUser({ id: 'u1', name: 'Sam Patel' });

function person(avatar: UserAvatar | null) {
  return { id: 'u1', name: 'Sam Patel', avatar };
}

function renderAvatar(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

beforeEach(async () => {
  resetSessionForTests();
  await setSession('access-1', SAM, 'refresh-1');
});

it('draws a photo from the avatar endpoint, with the bearer token and the version', async () => {
  const view = await renderAvatar(
    <PersonAvatar person={person({ kind: 'photo', version: 'v7' })} />,
  );

  const image = view.getByTestId('person-avatar-photo', hidden);
  expect(image.props.source).toEqual({
    uri: 'http://localhost:3000/api/v1/users/u1/avatar?v=v7',
    headers: { Authorization: 'Bearer access-1' },
  });
  expect(view.queryByText('SP', hidden)).toBeNull();
});

it('falls back to initials when the photo will not load', async () => {
  const view = await renderAvatar(
    <PersonAvatar person={person({ kind: 'photo', version: 'v7' })} />,
  );

  await fireEvent(view.getByTestId('person-avatar-photo', hidden), 'error');

  expect(view.queryByTestId('person-avatar-photo', hidden)).toBeNull();
  expect(view.getByText('SP', hidden)).toBeTruthy();
});

it('draws initials rather than asking for a photo without a token', async () => {
  resetSessionForTests();
  const view = await renderAvatar(
    <PersonAvatar person={person({ kind: 'photo', version: 'v7' })} />,
  );

  expect(view.queryByTestId('person-avatar-photo', hidden)).toBeNull();
  expect(view.getByText('SP', hidden)).toBeTruthy();
});

it('draws a chosen preset as a glyph, not initials', async () => {
  const view = await renderAvatar(
    <PersonAvatar person={person({ kind: 'preset', preset: 'rocket' })} size={56} />,
  );

  expect(view.getByTestId('person-avatar-preset', hidden)).toBeTruthy();
  expect(view.queryByText('SP', hidden)).toBeNull();
});

it('draws initials when there is no picture', async () => {
  const view = await renderAvatar(<PersonAvatar person={person(null)} />);

  expect(view.getByText('SP', hidden)).toBeTruthy();
});

it('takes a bare name, as the chat avatar does', async () => {
  const view = await renderAvatar(<PersonAvatar name="Asha Rao" size={36} />);

  expect(view.getByText('AR', hidden)).toBeTruthy();
});

it('keeps a group as its initials tile whatever avatar it is handed', async () => {
  const view = await renderAvatar(
    <PersonAvatar person={person({ kind: 'preset', preset: 'star' })} shape="group" />,
  );

  expect(view.queryByTestId('person-avatar-preset', hidden)).toBeNull();
  expect(view.getByText('SP', hidden)).toBeTruthy();
});

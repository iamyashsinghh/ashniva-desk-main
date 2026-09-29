import type { UserAvatar } from '@ashniva/types';
import { render, screen, waitFor } from '@testing-library/react';

import { apiBlob } from '../lib/api-client';
import type * as ApiClient from '../lib/api-client';
import { forgetAvatarPhotos } from '../lib/avatar-photo';
import { PersonAvatar } from './PersonAvatar';

vi.mock('../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiBlob: vi.fn(),
}));

/**
 * Which of the three pictures a person gets: their photo, the preset they chose, or initials.
 *
 * The photo is fetched through the api client — the route sits behind the bearer token, so an
 * `<img>` pointed straight at it would get a 401 — and shared between every avatar on the page.
 */

const blob = vi.mocked(apiBlob);

beforeEach(() => {
  forgetAvatarPhotos();
  blob.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

function renderAvatar(avatar: UserAvatar | null, userId = 'user-1') {
  return render(<PersonAvatar name="Priya Sharma" userId={userId} avatar={avatar} labelled />);
}

describe('PersonAvatar', () => {
  it('draws the initials when there is no picture', () => {
    renderAvatar(null);

    const avatar = screen.getByRole('img', { name: 'Priya Sharma' });
    expect(avatar).toHaveTextContent('PS');
    expect(avatar).toHaveAttribute('data-avatar', 'initials');
    expect(blob).not.toHaveBeenCalled();
  });

  it('draws the chosen preset in its own colours instead of the initials', () => {
    renderAvatar({ kind: 'preset', preset: 'rocket' });

    const avatar = screen.getByRole('img', { name: 'Priya Sharma' });
    expect(avatar).toHaveAttribute('data-avatar', 'preset:rocket');
    expect(avatar).toHaveClass('person-avatar--preset-rocket');
    expect(avatar.querySelector('svg')).not.toBeNull();
    expect(avatar).not.toHaveTextContent('PS');
  });

  it('draws initials for a preset key this build has no drawing for', () => {
    // A newer API may add presets before this client knows them.
    renderAvatar({ kind: 'preset', preset: 'unicorn' } as unknown as UserAvatar);
    expect(screen.getByRole('img', { name: 'Priya Sharma' })).toHaveTextContent('PS');
  });

  it('fetches the photo with the bearer token and draws it once it arrives', async () => {
    blob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    renderAvatar({ kind: 'photo', version: 'v7' });

    // Initials while the photo is on its way, never a blank circle.
    expect(screen.getByRole('img', { name: 'Priya Sharma' })).toHaveTextContent('PS');

    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Priya Sharma' })).toHaveAttribute(
        'data-avatar',
        'photo',
      ),
    );
    expect(blob).toHaveBeenCalledWith('/users/user-1/avatar?v=v7');
    expect(screen.getByRole('img', { name: 'Priya Sharma' }).querySelector('img')).toHaveAttribute(
      'src',
      'blob:photo',
    );
  });

  it('asks for a photo once however many avatars show it', async () => {
    blob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    render(
      <>
        <PersonAvatar
          name="Priya Sharma"
          userId="user-1"
          avatar={{ kind: 'photo', version: 'v7' }}
        />
        <PersonAvatar
          name="Priya Sharma"
          userId="user-1"
          avatar={{ kind: 'photo', version: 'v7' }}
        />
      </>,
    );

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
    expect(blob).toHaveBeenCalledTimes(1);
  });

  it('keeps the initials when the photo cannot be fetched', async () => {
    blob.mockRejectedValue(new Error('offline'));
    renderAvatar({ kind: 'photo', version: 'v7' });

    await waitFor(() => expect(blob).toHaveBeenCalled());
    expect(screen.getByRole('img', { name: 'Priya Sharma' })).toHaveTextContent('PS');
  });

  it('gives back its object URL when it goes away', async () => {
    blob.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const { unmount } = renderAvatar({ kind: 'photo', version: 'v7' });
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Priya Sharma' })).toHaveAttribute(
        'data-avatar',
        'photo',
      ),
    );

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });
});

import { MAX_AVATAR_BYTES, ROLE_KEYS, type SessionUser, type UserAvatar } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { forgetAvatarPhotos } from '../../../shared/lib/avatar-photo';
import { sessionUserFor } from '../../../test/fixtures';
import { getSessionState, setAuthenticated } from '../../auth/session-store';
import { ProfilePictureCard } from './ProfilePictureCard';

/**
 * Choosing your own picture on the profile page.
 *
 * Each change goes to its own endpoint, and afterwards the session is re-read from `/auth/me` so
 * the header — which draws the session user — shows the new picture without a reload.
 */

interface Call {
  url: string;
  method: string;
  body: BodyInit | null | undefined;
}

function reply(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    blob: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
    headers: { get: () => 'application/json' },
  } as unknown as Response;
}

function renderCard(avatar: UserAvatar | null = null): Call[] {
  const calls: Call[] = [];
  let current: SessionUser = { ...sessionUserFor(ROLE_KEYS.DEVELOPER), avatar };
  setAuthenticated('test-token', current);

  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body });
      if (url.endsWith('/users/me/avatar') && method === 'PUT') {
        const { preset } = JSON.parse(String(init?.body)) as { preset: string };
        current = { ...current, avatar: { kind: 'preset', preset } as UserAvatar };
        return reply(current.avatar);
      }
      if (url.endsWith('/users/me/avatar') && method === 'POST') {
        current = { ...current, avatar: { kind: 'photo', version: 'v2' } };
        return reply(current.avatar, 201);
      }
      if (url.endsWith('/users/me/avatar') && method === 'DELETE') {
        current = { ...current, avatar: null };
        return reply(undefined, 204);
      }
      if (url.endsWith('/auth/me')) {
        return reply(current);
      }
      return reply({});
    },
  );

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProfilePictureCard />
    </QueryClientProvider>,
  );
  return calls;
}

function avatarOf(): HTMLElement {
  const user = getSessionState().user;
  return screen.getByRole('img', { name: user?.name ?? '' });
}

beforeEach(() => {
  forgetAvatarPhotos();
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('ProfilePictureCard', () => {
  it('chooses a built-in picture with PUT, then re-reads the session', async () => {
    const calls = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Use the leaf picture' }));

    await waitFor(() => expect(avatarOf()).toHaveAttribute('data-avatar', 'preset:leaf'));
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.url).toMatch(/\/users\/me\/avatar$/);
    expect(JSON.parse(String(put?.body))).toEqual({ preset: 'leaf' });
    expect(calls.some((call) => call.url.endsWith('/auth/me'))).toBe(true);
    expect(getSessionState().user?.avatar).toEqual({ kind: 'preset', preset: 'leaf' });
    expect(screen.getByRole('button', { name: 'Use the leaf picture' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('uploads a photo as multipart under `file`', async () => {
    const calls = renderCard();
    const photo = new File(['png-bytes'], 'me.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText('Choose a photo to upload'), {
      target: { files: [photo] },
    });

    await waitFor(() =>
      expect(getSessionState().user?.avatar).toEqual({ kind: 'photo', version: 'v2' }),
    );
    const post = calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/users/me/avatar'),
    );
    expect(post?.body).toBeInstanceOf(FormData);
    expect((post?.body as FormData).get('file')).toBeInstanceOf(Blob);
    await waitFor(() => expect(avatarOf()).toHaveAttribute('data-avatar', 'photo'));
  });

  it('refuses a photo over the limit before uploading anything', async () => {
    const calls = renderCard();
    const huge = new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], 'huge.jpg', {
      type: 'image/jpeg',
    });

    fireEvent.change(screen.getByLabelText('Choose a photo to upload'), {
      target: { files: [huge] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/larger than 2 MB/);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('refuses a file that is not a picture the API accepts', async () => {
    const calls = renderCard();
    const gif = new File(['gif'], 'party.gif', { type: 'image/gif' });

    fireEvent.change(screen.getByLabelText('Choose a photo to upload'), {
      target: { files: [gif] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('removes the picture with DELETE, back to the initials', async () => {
    const calls = renderCard({ kind: 'preset', preset: 'sun' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(avatarOf()).toHaveAttribute('data-avatar', 'initials'));
    expect(
      calls.some((call) => call.method === 'DELETE' && call.url.endsWith('/users/me/avatar')),
    ).toBe(true);
    expect(getSessionState().user?.avatar).toBeNull();
  });

  it('offers no Remove while the initials are already showing', () => {
    renderCard(null);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });
});

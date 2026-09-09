import { VISIBILITY, type FileSummary } from '@ashniva/types';
import { act, fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import { resetSessionForTests, setSession } from '../auth/session-store';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { TaskAttachments } from './TaskAttachments';

/**
 * Attaching from a task, rendered.
 *
 * Two things the card has to get right that no pure function can prove. A picker that *fails* is
 * not a picker that was cancelled: the first has to say so, because a button that silently does
 * nothing is a person tapping it again. And the bearer token an attachment image is fetched with
 * has to follow the session — an image request happens outside the API client and cannot take its
 * retry path, so a source built once from an expired token stays broken.
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

const screenshot: FileSummary = {
  id: 'f1',
  name: 'screenshot.png',
  contentType: 'image/png',
  sizeBytes: 2048,
  visibility: VISIBILITY.INTERNAL,
  uploadedBy: { id: 'u1', name: 'A' } as FileSummary['uploadedBy'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const pickerMock = ImagePicker as jest.Mocked<typeof ImagePicker>;
const fetchMock = jest.fn();

function renderCard(files: readonly FileSummary[]): Promise<RenderResult> {
  return render(
    <ThemeProvider>
      <TaskAttachments taskId="t1" files={files} onUploaded={jest.fn()} />
    </ThemeProvider>,
  );
}

/** What React Native's `Image` was actually given, headers included. */
function imageSource(props: unknown): { uri: string; headers: Record<string, string> } {
  return (props as { source: { uri: string; headers: Record<string, string> } }).source;
}

beforeEach(() => {
  resetSessionForTests();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  pickerMock.requestMediaLibraryPermissionsAsync.mockResolvedValue({
    granted: true,
  } as unknown as ImagePicker.MediaLibraryPermissionResponse);
  pickerMock.launchImageLibraryAsync.mockResolvedValue({
    canceled: true,
    assets: null,
  } as unknown as ImagePicker.ImagePickerResult);
});

describe('when the picker itself fails', () => {
  it('says so, rather than leaving a button that does nothing', async () => {
    pickerMock.launchImageLibraryAsync.mockRejectedValueOnce(
      new Error('The photo library is unavailable'),
    );
    const view = await renderCard([]);

    await fireEvent.press(await view.findByText('Attach a photo'));

    expect(await view.findByText('The photo library is unavailable')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('when the person backs out', () => {
  it('says nothing, because cancelling is not an error', async () => {
    const view = await renderCard([]);

    await fireEvent.press(await view.findByText('Attach a photo'));

    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
    });
    expect(view.queryByText(/unavailable|went wrong/)).toBeNull();
  });
});

describe('an attachment image', () => {
  it('follows the session token, so a refresh reloads it', async () => {
    await act(async () => {
      await setSession('access-1', user, 'refresh-1');
    });
    const view = await renderCard([screenshot]);

    expect(
      imageSource((await view.findByLabelText('screenshot.png')).props).headers.Authorization,
    ).toBe('Bearer access-1');

    // The shared refresh commits a new token. Nothing else on this card changes, so only a
    // subscription can carry it into the request `Image` makes.
    await act(async () => {
      await setSession('access-2', user);
    });

    await waitFor(() => {
      expect(imageSource(view.getByLabelText('screenshot.png').props).headers.Authorization).toBe(
        'Bearer access-2',
      );
    });
  });
});

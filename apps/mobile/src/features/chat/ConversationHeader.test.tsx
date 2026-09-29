import type { ConversationDetail } from '@ashniva/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { ConversationHeader } from './ConversationHeader';

/**
 * The conversation's top bar: who it is, back, and a menu. It replaced a stack header that read
 * "Conversation" over every thread, so the first property is that the name is the person's.
 */

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

const VIEWER = 'viewer';

const DIRECT: ConversationDetail = {
  id: 'c1',
  kind: 'DIRECT',
  title: 'Conversation',
  project: { id: 'p1', code: 'ACME', name: 'Acme Portal' },
  task: null,
  ticket: null,
  counterpart: { id: 'priya', name: 'Priya S', email: 'priya@example.com' },
  imageFileId: null,
  lastMessageAt: null,
  lastMessagePreview: null,
  unreadCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  participants: [],
  abilities: {
    canPost: true,
    canCall: true,
    canPlayRecording: false,
    canManage: false,
    canLeave: false,
    viaOversight: false,
    reason: null,
  },
};

function renderHeader(
  conversation: ConversationDetail,
  handlers: {
    onBack?: () => void;
    onOpenDetails?: () => void;
    onSearch?: () => void;
    onOpenWallpaper?: () => void;
  } = {},
) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={testQueryClient()}>
          <ConversationHeader
            conversation={conversation}
            viewerId={VIEWER}
            onBack={handlers.onBack}
            onOpenDetails={handlers.onOpenDetails}
            onSearch={handlers.onSearch ?? jest.fn()}
            onOpenWallpaper={handlers.onOpenWallpaper}
          />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  globalThis.fetch = jest.fn(() =>
    Promise.resolve(jsonResponse({ items: [] })),
  ) as unknown as typeof fetch;
});

describe('ConversationHeader', () => {
  it('names the other person, never “Conversation”, and invites a tap for details', async () => {
    const onOpenDetails = jest.fn();
    await renderHeader(DIRECT, { onOpenDetails });

    expect(screen.getByText('Priya S')).toBeTruthy();
    expect(screen.getByText('tap here for info')).toBeTruthy();
    expect(screen.queryByText('Conversation')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Priya S, tap here for info'));
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it('names a group and who is in it', async () => {
    await renderHeader({
      ...DIRECT,
      kind: 'GROUP',
      title: 'Release crew',
      counterpart: null,
      participants: [
        {
          id: 'aman',
          name: 'Aman Kumar',
          email: 'aman@example.com',
          projectRole: null,
          memberRole: 'OWNER',
          lastReadAt: null,
          joinedAt: '2026-09-01T00:00:00.000Z',
          leftAt: null,
        },
      ],
    });

    expect(screen.getByText('Release crew')).toBeTruthy();
    expect(screen.getByText('Aman')).toBeTruthy();
  });

  it('goes back from its own arrow', async () => {
    const onBack = jest.fn();
    await renderHeader(DIRECT, { onBack });
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers a call only where the server says one may be placed', async () => {
    await renderHeader(DIRECT);
    expect(screen.getByLabelText('Call')).toBeTruthy();

    await renderHeader({ ...DIRECT, abilities: { ...DIRECT.abilities, canCall: false } });
    expect(screen.queryByLabelText('Call')).toBeNull();
  });

  it('runs search, wallpaper and details from the menu', async () => {
    const onSearch = jest.fn();
    const onOpenWallpaper = jest.fn();
    const onOpenDetails = jest.fn();
    await renderHeader(DIRECT, { onSearch, onOpenWallpaper, onOpenDetails });

    await fireEvent.press(screen.getByLabelText('More options'));
    await fireEvent.press(screen.getByLabelText('Search'));
    await fireEvent.press(screen.getByLabelText('More options'));
    await fireEvent.press(screen.getByLabelText('Wallpaper'));
    await fireEvent.press(screen.getByLabelText('More options'));
    await fireEvent.press(screen.getByLabelText('Details'));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onOpenWallpaper).toHaveBeenCalledTimes(1);
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it('keeps the oversight notice under the bar', async () => {
    await renderHeader({ ...DIRECT, abilities: { ...DIRECT.abilities, viaOversight: true } });
    expect(screen.getByText(/reading this as an administrator/)).toBeTruthy();
  });
});

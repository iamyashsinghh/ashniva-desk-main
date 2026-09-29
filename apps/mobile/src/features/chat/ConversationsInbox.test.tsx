import { fireEvent, waitFor } from '@testing-library/react-native';

import { jsonResponse } from '../../shared/testing/harness';
import {
  OLIVER,
  fetchMock,
  installFetch,
  renderList,
  respond,
  summary,
} from './conversations-test-data';

/**
 * The parts of the inbox that came over from the web: the people you may message, the Unread
 * chip's figure, and the audited administrator view.
 */

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => undefined }));

beforeEach(installFetch);

describe('the people inbox', () => {
  it('hides people and the Direct chip when personal chat is off', async () => {
    respond({ directory: [OLIVER] });
    const view = await renderList({ personalChat: false });
    expect(await view.findByText('Release crew')).toBeTruthy();
    expect(view.queryByText('Priya S')).toBeNull();
    expect(view.queryByText('Oliver K')).toBeNull();
    expect(view.queryByLabelText('Direct conversations')).toBeNull();
    // Nobody to list, so the directory is never asked.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/directory'))).toBe(false);
  });

  it('lists the people you may message after your threads, as the web does', async () => {
    respond({
      directory: [
        OLIVER,
        // Already the other side of a visible thread, so not listed twice.
        { ...OLIVER, id: 'priya', name: 'Priya S', conversationId: 'a' },
      ],
    });
    const view = await renderList();

    expect(await view.findByText('Oliver K')).toBeTruthy();
    expect(view.getByText('On your team')).toBeTruthy();
    expect(view.getAllByText('Priya S')).toHaveLength(1);
  });

  it('keeps people out of Groups and Unread', async () => {
    respond({ directory: [OLIVER] });
    const view = await renderList();
    await view.findByText('Oliver K');

    await fireEvent.press(view.getByLabelText('Groups conversations'));
    expect(view.queryByText('Oliver K')).toBeNull();
  });

  it('opens a direct message with somebody new, and goes to it', async () => {
    const onOpen = jest.fn();
    respond({ directory: [OLIVER] });
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => unknown;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      String(url).includes('/conversations/direct') && init?.method === 'POST'
        ? Promise.resolve(jsonResponse({ id: 'fresh' }))
        : base(url, init),
    );
    const view = await renderList({ onOpen });

    await fireEvent.press(await view.findByLabelText('Oliver K, On your team'));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('fresh'));
  });

  it('goes straight to the thread somebody already has with a person', async () => {
    const onOpen = jest.fn();
    respond({ rows: [], directory: [{ ...OLIVER, conversationId: 'existing' }] });
    const view = await renderList({ onOpen });

    await fireEvent.press(await view.findByLabelText('Oliver K, On your team'));

    expect(onOpen).toHaveBeenCalledWith('existing');
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/conversations/direct')),
    ).toBe(false);
  });
});

describe('unread figures', () => {
  it('puts the unread total on the Unread chip', async () => {
    const view = await renderList();
    expect(await view.findByText('Unread 3')).toBeTruthy();
    expect(view.getByLabelText('Unread conversations, 3 unread')).toBeTruthy();
  });

  it('draws 99+ rather than an exact figure past ninety-nine', async () => {
    respond({ rows: [summary({ id: 'x', unreadCount: 250 })] });
    const view = await renderList();
    expect(await view.findByText('99+ unread')).toBeTruthy();
  });
});

describe('the administrator view', () => {
  it('is not offered without conversation:inspect', async () => {
    const view = await renderList();
    await view.findByText('Release crew');
    expect(view.queryByRole('button', { name: 'Administrator view' })).toBeNull();
  });

  it('asks the audited oversight routes only once it is opened', async () => {
    respond({ oversight: [summary({ id: 'z', kind: 'GROUP', title: 'Finance huddle' })] });
    const view = await renderList({ canInspect: true });
    await view.findByText('Release crew');
    const audited = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/oversight/')).length;
    expect(audited()).toBe(0);

    await fireEvent.press(view.getByRole('button', { name: 'Administrator view' }));

    expect(await view.findByText('Finance huddle')).toBeTruthy();
    expect(view.getByText(/Every one of these views is recorded in the audit log/)).toBeTruthy();
    expect(audited()).toBe(2);
  });
});

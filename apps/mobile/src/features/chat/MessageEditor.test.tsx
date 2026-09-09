import { MAX_MESSAGE_LENGTH, type MessageSummary } from '@ashniva/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, type RenderResult } from '@testing-library/react-native';

import { jsonResponse, testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { MessageEditor } from './MessageEditor';

/**
 * Rewriting one's own line.
 *
 * What is proved here is what the API would otherwise have to refuse: the edit goes to the one
 * message it is about, an emptied message is never sent at all, and a refusal is shown in the
 * API's own words rather than swallowed. Whether the control exists is `canEdit` and is proved
 * next door, in `MessageThread.test.tsx`.
 */

const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const MESSAGE = '44444444-4444-4444-8444-444444444444';

const MINE: MessageSummary = {
  id: MESSAGE,
  conversationId: CONVERSATION,
  sender: { id: '22222222-2222-4222-8222-222222222222', name: 'Dev One', email: 'dev@x.test' },
  body: 'Tomorow',
  systemKind: null,
  attachments: [],
  createdAt: '2026-09-13T09:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  canEdit: true,
  canDelete: false,
};

const fetchMock = jest.fn();
const onDone = jest.fn();

/** Every PATCH that was sent, as `[url, body]`. */
function edits(): [string, { body?: string }][] {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'PATCH')
    .map(([url, init]) => [String(url), JSON.parse(String(init.body)) as { body?: string }]);
}

/**
 * The thread's hold on the words being typed, which this component mirrors into.
 *
 * A fresh one per render here: what it *buys* — an edit surviving the list unmounting the row — is
 * a property of the thread and is proved in `MessageThread.test.tsx`, next to the list that does
 * the unmounting.
 */
function renderEditor(kept: { current: string | null } = { current: null }): Promise<RenderResult> {
  return render(
    <ThemeProvider>
      <QueryClientProvider client={testQueryClient()}>
        <MessageEditor message={MINE} draftRef={kept} onDone={onDone} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  onDone.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(jsonResponse({ ...MINE, body: 'Tomorrow', editedAt: 'now' }));
});

describe('MessageEditor', () => {
  it('opens on what the message says now', async () => {
    const view = await renderEditor();
    expect(view.getByLabelText('Edit this message').props.value).toBe('Tomorow');
  });

  it('sends the new words to that one message, and leaves the editor when it lands', async () => {
    const view = await renderEditor();

    await fireEvent.changeText(view.getByLabelText('Edit this message'), 'Tomorrow');
    await fireEvent.press(view.getByRole('button', { name: 'Save' }));

    expect(edits()).toHaveLength(1);
    const [url, body] = edits()[0] as [string, { body?: string }];
    expect(url).toContain(`/conversations/${CONVERSATION}/messages/${MESSAGE}`);
    expect(body.body).toBe('Tomorrow');
    expect(onDone).toHaveBeenCalled();
  });

  // There is no withdraw for an ordinary person to fall back on, so blanking a line would be a
  // withdrawal by another name. The rule is the API's; what is asserted here is that the screen
  // does not ask — the request is never sent and the control says why.
  it('will not empty a message, and sends nothing when asked to', async () => {
    const view = await renderEditor();

    await fireEvent.changeText(view.getByLabelText('Edit this message'), '   ');
    await fireEvent.press(view.getByRole('button', { name: 'Save' }));

    expect(edits()).toHaveLength(0);
    expect(view.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);
  });

  it('refuses to send more than the API accepts', async () => {
    const view = await renderEditor();

    await fireEvent.changeText(
      view.getByLabelText('Edit this message'),
      'x'.repeat(MAX_MESSAGE_LENGTH + 1),
    );
    await fireEvent.press(view.getByRole('button', { name: 'Save' }));

    expect(edits()).toHaveLength(0);
    expect(view.getByText(/Shorten it to save/)).toBeTruthy();
  });

  it('shows the API’s own words when the edit is refused, and stays open', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'That message changed while you were editing it' }, 409),
    );
    const view = await renderEditor();

    await fireEvent.changeText(view.getByLabelText('Edit this message'), 'Tomorrow');
    await fireEvent.press(view.getByRole('button', { name: 'Save' }));

    expect(await view.findByText('That message changed while you were editing it')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(view.getByLabelText('Edit this message')).toBeTruthy();
  });

  it('opens on the words already being typed, when there are some', async () => {
    // Which is what a remount looks like from in here: the thread still holds the edit, so the
    // editor comes back to it rather than to what the message said before it began.
    const view = await renderEditor({ current: 'Half a correction' });
    expect(view.getByLabelText('Edit this message').props.value).toBe('Half a correction');
  });

  it('mirrors every keystroke into the thread’s hold', async () => {
    const kept = { current: null as string | null };
    const view = await renderEditor(kept);

    await fireEvent.changeText(view.getByLabelText('Edit this message'), 'Tomorrow');

    expect(kept.current).toBe('Tomorrow');
  });

  it('leaves without sending anything when it is cancelled', async () => {
    const view = await renderEditor();

    await fireEvent.changeText(view.getByLabelText('Edit this message'), 'Tomorrow');
    await fireEvent.press(view.getByRole('button', { name: 'Cancel' }));

    expect(edits()).toHaveLength(0);
    expect(onDone).toHaveBeenCalled();
  });
});

import type { MessageSummary, UserRef } from '@ashniva/types';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { formatDate } from '../../shared/format/format';
import { testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { MessageThread } from './MessageThread';

/**
 * The thread's shape on the phone.
 *
 * The grouping itself is proved in `packages/types` and the row flattening in `thread-rows.test`;
 * this proves the screen honours both — a date separator per day, one name per run, own lines on
 * the right and everybody else's on the left, and a withdrawn message keeping its place rather
 * than vanishing and leaving a reply to nothing.
 *
 * **Rewritten from the version that asserted a `Card` per day.** The thread was a scrolling stack
 * of cards and is now bubbles in an inverted list, which is what the alignment assertions below
 * are about: "whose message is this" is carried by the side it sits on, and that is a property
 * worth a test rather than a screenshot.
 */

// Real UUIDs: a mention is stored as `@[<uuid>]` and the shared parser only recognises that
// shape, so a short id would make the mention test prove nothing.
const PRIYA: UserRef = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Priya S',
  email: 'priya@example.com',
};
const DEV: UserRef = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Dev One',
  email: 'dev@example.com',
};

function message(over: Partial<MessageSummary> & { id: string }): MessageSummary {
  return {
    conversationId: 'c1',
    sender: PRIYA,
    body: 'Something',
    systemKind: null,
    attachments: [],
    createdAt: at('2026-09-13T09:00:00'),
    editedAt: null,
    deletedAt: null,
    canEdit: false,
    canDelete: false,
    ...over,
  };
}

/** A local time, so the assertions do not depend on the timezone the tests happen to run in. */
function at(local: string): string {
  return new Date(local).toISOString();
}

/**
 * The tree, as an element, so a test can hand the *same* one back to `rerender`.
 *
 * The query client is a parameter for the same reason: a new client per render would drop the
 * editor's mutation state and prove nothing about what survived.
 */
function threadWith(
  messages: MessageSummary[],
  client: QueryClient,
  options: { showSenderNames?: boolean; unreadCount?: number } = {},
): ReactElement {
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <MessageThread
          messages={messages}
          viewerId={DEV.id}
          participants={[PRIYA, DEV]}
          showSenderNames={options.showSenderNames ?? true}
          unreadCount={options.unreadCount ?? 0}
          hasEarlier={false}
          isLoadingEarlier={false}
          onLoadEarlier={jest.fn()}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function renderThread(
  messages: MessageSummary[],
  options: { showSenderNames?: boolean; unreadCount?: number } = {},
): Promise<RenderResult> {
  return render(threadWith(messages, testQueryClient(), options));
}

/**
 * The editor's text field and the Edit buttons share one accessibility label, so they are told
 * apart by the thing only a text field has: a `value`. `getAllBy` throws when the editor is shut,
 * which is the right failure for every caller below.
 */
type ThreadNode = ReturnType<RenderResult['getByLabelText']>;
const hasValue = (node: { props: { value?: unknown } }) => typeof node.props.value === 'string';
const editorInput = (view: RenderResult) =>
  view.getAllByLabelText('Edit this message').filter(hasValue)[0] as ThreadNode;

/** The Edit controls on screen — the same label, minus whatever is a text field. */
const editButtons = (view: RenderResult) =>
  view.queryAllByLabelText('Edit this message').filter((node) => !hasValue(node));

/**
 * The `alignItems` a bubble was given: `flex-end` for the reader's own line.
 *
 * Found by the bubble's own accessibility label rather than by walking up from the text, because
 * the label is part of the component's contract and the number of wrapping views is not.
 */
function alignmentOf(view: RenderResult, label: RegExp): string | undefined {
  const style = view.getByLabelText(label).props.style as { alignItems?: string } | undefined;
  return style?.alignItems;
}

describe('MessageThread', () => {
  it('puts the reader’s own message on the right and everybody else’s on the left', async () => {
    const view = await renderThread([
      message({ id: 'theirs', body: 'From Priya' }),
      message({ id: 'mine', sender: DEV, body: 'From me', createdAt: at('2026-09-13T09:05:00') }),
    ]);

    expect(alignmentOf(view, /^You said From me/)).toBe('flex-end');
    expect(alignmentOf(view, /^Priya S said From Priya/)).toBe('flex-start');
  });

  it('gives each day its own separator', async () => {
    const view = await renderThread([
      message({ id: 'a', body: 'Older', createdAt: at('2026-08-04T09:00:00') }),
      message({ id: 'b', body: 'Newer', createdAt: at('2026-08-11T09:00:00') }),
    ]);

    // Formatted through the app's own helper, which follows the device locale — asserting a
    // literal would make this test pass or fail on where the runner thinks it is.
    expect(view.getByText(formatDate(at('2026-08-04T09:00:00')) as string)).toBeTruthy();
    expect(view.getByText(formatDate(at('2026-08-11T09:00:00')) as string)).toBeTruthy();
  });

  it('names today rather than dating it', async () => {
    const view = await renderThread([message({ id: 'a', createdAt: new Date().toISOString() })]);
    expect(view.getByText('Today')).toBeTruthy();
  });

  it('draws the unread divider where the reader stopped', async () => {
    const view = await renderThread(
      [
        message({ id: 'a', body: 'Read this' }),
        message({ id: 'b', body: 'Missed this', createdAt: at('2026-09-13T10:00:00') }),
        message({ id: 'c', body: 'And this', createdAt: at('2026-09-13T10:01:00') }),
      ],
      { unreadCount: 2 },
    );

    expect(view.getByText('2 new messages')).toBeTruthy();
  });

  it('prints one name for a run of consecutive lines from the same person', async () => {
    const view = await renderThread([
      message({ id: 'a', body: 'First', createdAt: at('2026-09-13T09:00:00') }),
      message({ id: 'b', body: 'Second', createdAt: at('2026-09-13T09:01:00') }),
    ]);

    expect(view.getAllByText('Priya S')).toHaveLength(1);
    expect(view.getByText('Second')).toBeTruthy();
  });

  it('names nobody in a direct conversation, where there is only one other person', async () => {
    const view = await renderThread([message({ id: 'a', body: 'Hello' })], {
      showSenderNames: false,
    });
    expect(view.queryByText('Priya S')).toBeNull();
    expect(view.getByText('Hello')).toBeTruthy();
  });

  it('never folds a call note into somebody’s run', async () => {
    const view = await renderThread([
      message({ id: 'a', body: 'Before', createdAt: at('2026-09-13T09:00:00') }),
      message({
        id: 'call',
        body: 'A call was started',
        sender: null,
        systemKind: 'CALL_STARTED',
        createdAt: at('2026-09-13T09:01:00'),
      }),
      message({ id: 'b', body: 'After', createdAt: at('2026-09-13T09:02:00') }),
    ]);

    expect(view.getByText('A call was started')).toBeTruthy();
    // Priya's name appears again after the note, because the note ended her run.
    expect(view.getAllByText('Priya S')).toHaveLength(2);
  });

  it('says a message was edited without saying what it used to say', async () => {
    const view = await renderThread([
      message({ id: 'a', body: 'Corrected', editedAt: at('2026-09-13T09:10:00') }),
    ]);
    expect(view.getByText(/· edited$/)).toBeTruthy();
  });

  it('keeps a withdrawn message in its place and says what happened', async () => {
    const view = await renderThread([
      message({ id: 'gone', body: '', deletedAt: at('2026-09-13T10:00:00') }),
    ]);
    expect(view.getByText('This message was withdrawn.')).toBeTruthy();
  });

  // `canEdit` is the server's per-message answer — the sender, inside the edit window — and the
  // control is drawn from it rather than from a rule restated on the phone.
  it('offers Edit on the message the server said may be edited, and on no other', async () => {
    const view = await renderThread([
      message({ id: 'stale', sender: DEV, body: 'Too old now', canEdit: false }),
      message({
        id: 'fresh',
        sender: DEV,
        body: 'Just said',
        canEdit: true,
        createdAt: at('2026-09-13T09:05:00'),
      }),
    ]);

    expect(view.getAllByLabelText('Edit this message')).toHaveLength(1);
  });

  it('offers nothing on a withdrawn message, whatever the flags say', async () => {
    const view = await renderThread([
      message({
        id: 'gone',
        sender: DEV,
        body: '',
        canEdit: true,
        deletedAt: at('2026-09-13T10:00:00'),
      }),
    ]);
    expect(view.queryByLabelText('Edit this message')).toBeNull();
  });

  // `DELETE` refuses everybody without `conversation:inspect`, the sender included, so there is
  // nothing here for an ordinary reader to press — and no button that would only ever refuse.
  it('offers no way to withdraw a message, own or anybody else’s', async () => {
    const view = await renderThread([
      message({ id: 'mine', sender: DEV, body: 'Mine', canEdit: true }),
      message({ id: 'theirs', body: 'Theirs', createdAt: at('2026-09-13T09:05:00') }),
    ]);

    expect(view.queryByText(/withdraw/i)).toBeNull();
    expect(view.queryByText(/delete/i)).toBeNull();
  });

  // Which message is open for editing used to be `useState` inside `MessageBubble`, drawn by a
  // `FlatList` with `removeClippedSubviews` and a `windowSize` of nine — so the list was free to
  // unmount the row and take the correction with it, silently. The thread holds it now, and a
  // re-render of the list is the reachable half of that: a message arrives, the read cursor moves,
  // every row is drawn again.
  it('keeps the editor open on the right message when the list re-renders around it', async () => {
    const client = testQueryClient();
    const mine = message({ id: 'mine', sender: DEV, body: 'Tomorow', canEdit: true });
    const view = await render(threadWith([mine], client));

    await fireEvent.press(view.getByLabelText('Edit this message'));
    await fireEvent.changeText(view.getByLabelText('Edit this message'), 'Tomorrow');

    view.rerender(
      threadWith(
        [mine, message({ id: 'arrived', body: 'Just in', createdAt: at('2026-09-13T09:30:00') })],
        client,
      ),
    );

    // The list really did take the new data — otherwise this would prove nothing about surviving
    // anything.
    expect(await view.findByText('Just in')).toBeTruthy();
    // And the row is still the editor, still on the words that were typed.
    expect(view.getByLabelText('Edit this message').props.value).toBe('Tomorrow');
    expect(view.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('reopens the editor when the row leaves the list and comes back', async () => {
    // The other half, and the one that actually moved: `removeClippedSubviews` *unmounts* a row
    // that has scrolled far enough out and mounts it again when it returns. State held inside the
    // bubble did not survive that — the sender pressed Edit, the thread moved, and the row came
    // back as a plain bubble with nothing said. Held by the thread, the intention outlives the
    // views drawing it.
    const client = testQueryClient();
    const mine = message({ id: 'mine', sender: DEV, body: 'Tomorow', canEdit: true });
    const other = message({ id: 'other', body: 'Elsewhere', createdAt: at('2026-09-13T09:30:00') });
    const view = await render(threadWith([mine, other], client));

    await fireEvent.press(view.getByLabelText('Edit this message'));
    expect(view.getByRole('button', { name: 'Save' })).toBeTruthy();
    // Half a correction typed. The precondition for the whole test: without this the assertion at
    // the end would pass on the message's own unedited body.
    await fireEvent.changeText(view.getByLabelText('Edit this message'), 'Tomorrow, I think');
    expect(view.getByLabelText('Edit this message').props.value).toBe('Tomorrow, I think');

    // Out of the list — awaited, because a virtualized list drops a cell on its own schedule
    // rather than during the render that removed the item.
    view.rerender(threadWith([other], client));
    await waitFor(() => expect(view.queryByRole('button', { name: 'Save' })).toBeNull());

    // … and back into it, still being edited, still on the half-written words. Held inside the
    // bubble this came back as a plain bubble; with only the id lifted it came back empty.
    view.rerender(threadWith([mine, other], client));
    await waitFor(() => expect(view.getByRole('button', { name: 'Save' })).toBeTruthy());
    expect(view.getByLabelText('Edit this message').props.value).toBe('Tomorrow, I think');
  });

  it('opens the next edit on its own message, not on the last one’s words', async () => {
    // The other half of holding the text one level up: it has to be let go of, or opening a second
    // message would show the first one's half-sentence.
    const mine = (id: string, body: string, when: string) =>
      message({ id, sender: DEV, body, canEdit: true, createdAt: at(when) });
    const bodies = ['The first', 'The second'];
    const view = await render(
      threadWith(
        [
          mine('first', bodies[0] as string, '2026-09-13T09:00:00'),
          mine('second', bodies[1] as string, '2026-09-13T09:30:00'),
        ],
        testQueryClient(),
      ),
    );

    expect(editButtons(view)).toHaveLength(2);
    await fireEvent.press(editButtons(view)[0] as never);
    await fireEvent.changeText(editorInput(view), 'Half typed');
    expect(editorInput(view).props.value).toBe('Half typed');

    // Straight to the other message, without cancelling: the one remaining Edit button is the one
    // this editor did not replace, so there is no render order to depend on.
    expect(editButtons(view)).toHaveLength(1);
    await fireEvent.press(editButtons(view)[0] as never);

    const opened = editorInput(view).props.value as string;
    expect(opened).not.toBe('Half typed');
    expect(bodies).toContain(opened);
  });

  it('closes the editor when the edit is done, and offers Edit again', async () => {
    const view = await renderThread([
      message({ id: 'mine', sender: DEV, body: 'Tomorow', canEdit: true }),
    ]);

    await fireEvent.press(view.getByLabelText('Edit this message'));
    await fireEvent.press(view.getByRole('button', { name: 'Cancel' }));

    expect(view.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(view.getByLabelText('Edit this message')).toBeTruthy();
  });

  it('draws a mention as a name rather than as the id it is stored by', async () => {
    const view = await renderThread([message({ id: 'a', body: `Ready @[${DEV.id}]?` })]);
    expect(view.getByText('@Dev One')).toBeTruthy();
    expect(view.queryByText(`@[${DEV.id}]`)).toBeNull();
  });
});

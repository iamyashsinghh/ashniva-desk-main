import type { MentionablePage } from '@ashniva/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, type RenderResult } from '@testing-library/react-native';

import { jsonResponse, testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { MessageComposer } from './MessageComposer';

/**
 * Writing a message.
 *
 * Four properties, and three of them are about failure. It sends and clears. It **never loses what
 * somebody typed** — not on a dropped connection and not on a refused mention. A retry presents the
 * *same* `clientMessageId`, so a send that failed after the API had already written it cannot post
 * twice. And the mention picker offers only what the endpoint returned, inserting the person's id
 * rather than their name.
 */

const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const PRIYA = '11111111-1111-4111-8111-111111111111';

const AUDIENCE: MentionablePage = {
  items: [
    {
      userId: PRIYA,
      name: 'Priya S',
      email: 'priya@example.com',
      roleName: 'Team lead',
      contextLabel: 'On ACME',
    },
  ],
};

/**
 * The picker and the upload, stubbed.
 *
 * Only these two: `pick` still runs, so what is asserted is the composer's own handling of a file
 * arriving — including the send key it releases on the way.
 */
jest.mock('../../shared/attachments/attachments', () => ({
  ...jest.requireActual('../../shared/attachments/attachments'),
  pickDocument: jest.fn(),
  uploadAttachment: jest.fn(),
}));

const attachments = jest.requireMock('../../shared/attachments/attachments') as {
  pickDocument: jest.Mock;
  uploadAttachment: jest.Mock;
};

const fetchMock = jest.fn();

/** The bodies of every POST to the messages endpoint, in order. */
function sentBodies(): { body?: string; clientMessageId?: string }[] {
  return fetchMock.mock.calls
    .filter(([url, init]) => String(url).includes('/messages') && init?.method === 'POST')
    .map(
      ([, init]) => JSON.parse(String(init.body)) as { body?: string; clientMessageId?: string },
    );
}

/** Routes the two endpoints the composer touches. `send` decides what a POST answers. */
function serve(send: () => Response) {
  fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
    if (init?.method === 'POST') {
      return Promise.resolve(send());
    }
    if (String(url).includes('/mentionable')) {
      return Promise.resolve(jsonResponse(AUDIENCE));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

function renderComposer(
  props: { canPost?: boolean; reason?: 'CHAT_DISABLED' | null } = {},
): Promise<RenderResult> {
  return render(
    <ThemeProvider>
      <QueryClientProvider client={testQueryClient()}>
        <MessageComposer
          conversationId={CONVERSATION}
          canPost={props.canPost ?? true}
          reason={props.reason ?? null}
        />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  attachments.pickDocument.mockReset();
  attachments.uploadAttachment.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  serve(() => jsonResponse({ id: 'm1' }, 201));
});

describe('MessageComposer', () => {
  it('sends what was typed and empties the field', async () => {
    const view = await renderComposer();
    const field = view.getByLabelText('Your message');

    await fireEvent.changeText(field, 'ready for review');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));

    await view.findByLabelText('Your message');
    expect(sentBodies()[0]?.body).toBe('ready for review');
    expect(view.getByLabelText('Your message').props.value).toBe('');
  });

  it('sends nothing when there is nothing to send', async () => {
    const view = await renderComposer();
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));
    expect(sentBodies()).toHaveLength(0);
  });

  it('keeps the message and shows the API’s words when the send fails', async () => {
    serve(() => jsonResponse({ message: 'You are not in this conversation' }, 403));
    const view = await renderComposer();

    await fireEvent.changeText(view.getByLabelText('Your message'), 'still mine');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));

    expect(await view.findByText('You are not in this conversation')).toBeTruthy();
    expect(view.getByLabelText('Your message').props.value).toBe('still mine');
  });

  it('retries under the same id, so a lost response cannot post the message twice', async () => {
    serve(() => jsonResponse({ message: 'Could not reach the server' }, 500));
    const view = await renderComposer();

    await fireEvent.changeText(view.getByLabelText('Your message'), 'once, please');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));
    await view.findByText('Could not reach the server');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));
    await view.findByText('Could not reach the server');

    const ids = sentBodies().map((body) => body.clientMessageId);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(1);
  });

  it('offers only the people the endpoint returned, and inserts the id rather than the name', async () => {
    const view = await renderComposer();

    await fireEvent.changeText(view.getByLabelText('Your message'), 'ready @');
    await fireEvent.press(await view.findByLabelText('Mention Priya S'));

    expect(view.getByLabelText('Your message').props.value).toBe(`ready @[${PRIYA}] `);
    // The name is never what goes in the body: a name is not stable and is not an identity.
    expect(view.getByLabelText('Your message').props.value).not.toContain('Priya');
  });

  it('asks nobody but the conversation’s own audience endpoint', async () => {
    const view = await renderComposer();
    await fireEvent.changeText(view.getByLabelText('Your message'), 'ready @');
    await view.findByLabelText('Mention Priya S');

    const reads = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => !url.includes('/mentionable'));
    expect(reads).toHaveLength(0);
  });

  it('keeps the typed message when a mention is refused, and rewrites the name rather than dropping it', async () => {
    const view = await renderComposer();

    // Through the picker, because that is where the id is paired with a name — and the name is
    // what the rewritten sentence keeps.
    await fireEvent.changeText(view.getByLabelText('Your message'), 'ready @');
    await fireEvent.press(await view.findByLabelText('Mention Priya S'));
    await fireEvent.changeText(view.getByLabelText('Your message'), `ready @[${PRIYA}] for review`);

    serve(() =>
      jsonResponse({ message: 'You cannot mention somebody who is not in this conversation' }, 400),
    );
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));

    expect(
      await view.findByText('You cannot mention somebody who is not in this conversation'),
    ).toBeTruthy();
    // The refusal names who it is about rather than saying "that person".
    expect(view.getByText(/Priya S can no longer be mentioned here/)).toBeTruthy();
    // The words somebody typed are still there. That is the property this test exists for.
    expect(view.getByLabelText('Your message').props.value).toBe(`ready @[${PRIYA}] for review`);

    serve(() => jsonResponse({ id: 'm2' }, 201));
    await fireEvent.press(view.getByRole('button', { name: 'Send without the mention' }));

    await view.findByLabelText('Your message');
    // Written out as a name, not deleted: the sentence still says who it was addressed to, which
    // is what the web app does with the same refusal.
    expect(sentBodies().at(-1)?.body).toBe('ready @Priya S for review');
  });

  it('offers no such button when a 400 had nothing to do with a mention', async () => {
    serve(() => jsonResponse({ message: 'The message could not be sent' }, 400));
    const view = await renderComposer();

    await fireEvent.changeText(view.getByLabelText('Your message'), 'no mentions here');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));

    await view.findByText('The message could not be sent');
    expect(view.queryByRole('button', { name: 'Send without the mention' })).toBeNull();
  });

  // The defect: a 400 about a body's length or an attachment, on a message that happens to name
  // somebody, used to be diagnosed as a refused mention — and offered a remedy that re-sends the
  // same over-long body and fails identically.
  it('does not call a 400 about something else a refused mention, even on a body that names somebody', async () => {
    serve(() => jsonResponse({ message: 'That attachment does not exist' }, 400));
    const view = await renderComposer();

    await fireEvent.changeText(view.getByLabelText('Your message'), `@[${PRIYA}] have a look`);
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));

    await view.findByText('That attachment does not exist');
    expect(view.queryByRole('button', { name: 'Send without the mention' })).toBeNull();
    expect(view.queryByText(/can no longer be mentioned here/)).toBeNull();
  });

  it('sends an id the API will accept, and a different one for a different message', async () => {
    const view = await renderComposer();
    const field = view.getByLabelText('Your message');

    await fireEvent.changeText(field, 'first');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));
    await view.findByLabelText('Your message');
    await fireEvent.changeText(view.getByLabelText('Your message'), 'second');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));
    await view.findByLabelText('Your message');

    const ids = sentBodies().map((sent) => sent.clientMessageId ?? '');
    expect(ids).toHaveLength(2);
    // `SendMessageDto.clientMessageId` is `@MaxLength(64)`.
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(64);
    }
    expect(new Set(ids).size).toBe(2);
  });

  it('sends under a new id once a file has been attached', async () => {
    // The files are part of the draft. Attaching one after a send that landed but was not
    // acknowledged used to reuse the key, so the server answered with the original message —
    // without the file — and the 2xx cleared the strip. Web carries the same rule.
    attachments.pickDocument.mockResolvedValue({
      name: 'evidence.pdf',
      uri: 'file:///x',
      size: 12,
    });
    attachments.uploadAttachment.mockResolvedValue({
      id: 'a3c8499f-7b6a-47c6-bbf2-f7ca59bfef1f',
      name: 'evidence.pdf',
      contentType: 'application/pdf',
      sizeBytes: 12,
      visibility: 'INTERNAL',
      uploadedBy: null,
      createdAt: '2026-09-13T09:00:00.000Z',
    });
    serve(() => jsonResponse({ message: 'Network is down' }, 500));
    const view = await renderComposer();

    await fireEvent.changeText(view.getByLabelText('Your message'), 'with the file');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));
    await view.findByText('Network is down');

    await fireEvent.press(view.getByRole('button', { name: 'Attach a file' }));
    // The precondition. Without it this would pass just as well against a picker that returned
    // nothing, where the key is deliberately kept.
    expect(await view.findByText('evidence.pdf')).toBeTruthy();

    serve(() => jsonResponse({ id: 'm2' }, 201));
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));

    const ids = sentBodies().map((sent) => sent.clientMessageId ?? '');
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('draws the API’s own reason instead of a field nobody may use', async () => {
    const view = await renderComposer({ canPost: false, reason: 'CHAT_DISABLED' });
    expect(view.queryByLabelText('Your message')).toBeNull();
    expect(view.getByText(/switched off|disabled/i)).toBeTruthy();
  });
});

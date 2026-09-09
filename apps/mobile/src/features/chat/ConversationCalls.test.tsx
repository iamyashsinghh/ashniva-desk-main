import {
  CONVERSATION_KIND,
  type ConversationAbilities,
  type ConversationDetail,
  type ConversationKind,
} from '@ashniva/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react-native';

import { jsonResponse, sessionUser, testQueryClient } from '../../shared/testing/harness';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { ConversationCalls } from './ConversationCalls';

/**
 * The call action, and where it is not offered.
 *
 * Telephony is project-anchored: everything an internal call needs — the fallback destination, the
 * recording playback scope, the roles that decide both — comes from a project, and a group and a
 * scope direct message have none. `POST /conversations/:id/calls` refuses them outright, so the
 * screen says where calls come from instead of drawing a row of buttons that would each answer
 * 400. The sentence is the API's own refusal label rather than a paraphrase.
 *
 * Nothing here is a control. `abilities.canCall` is the server's answer and the endpoint enforces
 * it again; this only decides what is worth drawing.
 */

/**
 * The session, doubled rather than restored.
 *
 * `ConversationCalls` reads the viewer's own id, to leave them off the list of people to ring.
 * Standing up the real provider would mean mocking the auth API to get one id, which is a lot of
 * ceremony for a value this component only compares against.
 */
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({
    // Named with the `mock` prefix that jest's factory scope requires.
    user: mockViewer,
    status: 'signed-in',
    can: () => false,
  }),
}));

const mockViewer = sessionUser();

const fetchMock = jest.fn();

function abilities(over: Partial<ConversationAbilities> = {}): ConversationAbilities {
  return {
    canPost: true,
    canCall: false,
    canPlayRecording: false,
    canManage: false,
    canLeave: false,
    viaOversight: false,
    reason: null,
    ...over,
  };
}

function conversation(kind: ConversationKind, over: Partial<ConversationDetail> = {}) {
  return {
    id: 'c1',
    kind,
    title: kind === CONVERSATION_KIND.GROUP ? 'Release crew' : 'Acme portal',
    project:
      kind === CONVERSATION_KIND.PROJECT ? { id: 'p1', code: 'ACME', name: 'Acme portal' } : null,
    task: null,
    ticket: null,
    counterpart: null,
    imageFileId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    unreadCount: 0,
    createdAt: '2026-09-13T08:00:00.000Z',
    participants: [
      {
        id: 'priya',
        name: 'Priya S',
        email: 'priya@example.com',
        projectRole: null,
        memberRole: 'MEMBER',
        lastReadAt: null,
        joinedAt: '2026-09-13T08:00:00.000Z',
        leftAt: null,
      },
    ],
    abilities: abilities(),
    ...over,
  } as ConversationDetail;
}

function renderCalls(detail: ConversationDetail): Promise<RenderResult> {
  return render(
    <ThemeProvider>
      <QueryClientProvider client={testQueryClient()}>
        <ConversationCalls conversation={detail} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse([])));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('ConversationCalls', () => {
  it('offers no call in a group, and says where calls are placed from', async () => {
    const view = await renderCalls(
      // `canCall` true and a group: the ability can say yes here and the endpoint still refuses,
      // which is exactly the disagreement this branch exists for.
      conversation(CONVERSATION_KIND.GROUP, { abilities: abilities({ canCall: true }) }),
    );

    expect(view.getByText('Calls are placed from a project conversation')).toBeTruthy();
    expect(view.queryByRole('button', { name: /^Call / })).toBeNull();
  });

  it('offers no call in a scope direct message either', async () => {
    const view = await renderCalls(
      conversation(CONVERSATION_KIND.SCOPE_DIRECT, { abilities: abilities({ canCall: true }) }),
    );
    expect(view.getByText('Calls are placed from a project conversation')).toBeTruthy();
    expect(view.queryByRole('button', { name: /^Call / })).toBeNull();
  });

  it('asks about no call history for a conversation nobody may call from', async () => {
    await renderCalls(conversation(CONVERSATION_KIND.GROUP));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('draws nothing at all where the server says this caller may not call', async () => {
    const view = await renderCalls(conversation(CONVERSATION_KIND.PROJECT));
    expect(view.queryByText('Calls')).toBeNull();
    expect(view.queryByRole('button', { name: /^Call / })).toBeNull();
  });

  it('offers the people on a project conversation when the server allows it', async () => {
    const view = await renderCalls(
      conversation(CONVERSATION_KIND.PROJECT, { abilities: abilities({ canCall: true }) }),
    );
    expect(await view.findByRole('button', { name: 'Call Priya S' })).toBeTruthy();
  });
});

import { ROLE_KEYS, type ProblemDetail, type RoleKey } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { closureFixture, problemFixture } from '../problem-fixtures';
import { ProblemActions } from './ProblemActions';

/**
 * The Close button is the server's answer, printed.
 *
 * Nothing in the browser works out whether the analysis is in or the fix is live: `closure
 * .allowed` decides whether the button works, and the server's own blocker sentences are the
 * whole of what it says when it does not — and they are printed underneath it as well, because
 * that is where the approved design puts them.
 */
function renderActions(problem: ProblemDetail, roleKey: RoleKey = ROLE_KEYS.TEAM_LEAD) {
  setAuthenticated('test-token', sessionUserFor(roleKey));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProblemActions problem={problem} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const BLOCKED = closureFixture({
  allowed: false,
  blockers: [
    'The root-cause analysis has not been submitted yet.',
    'No permanent fix has been assigned.',
  ],
  warnings: ['No preventive test has been added.'],
});

describe('ProblemActions', () => {
  beforeAll(() => {
    // jsdom renders <dialog> but implements neither showModal nor close, which the Modal calls.
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  });

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * Assigning the fix used to ask for "the id of the task carrying the fix" as free text, and
   * `problemClosureGate` requires `fixAssigned` — so closing a problem meant copying a uuid out of
   * the address bar and getting it right.
   */
  it('picks the fix task from a list rather than asking for its uuid', async () => {
    const tasks = {
      items: [{ id: 'task-9', key: 'ACM-9', title: 'Stream the invoice PDF' }],
      nextCursor: null,
      total: 1,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(tasks),
    } as unknown as Response);

    renderActions(problemFixture());
    fireEvent.click(screen.getByRole('button', { name: 'Assign permanent fix' }));

    const picker = await screen.findByLabelText(/^The task carrying the fix/);
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'ACM-9 · Stream the invoice PDF' }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();

    fireEvent.change(picker, { target: { value: 'task-9' } });
    expect(screen.getByRole('button', { name: 'Assign' })).toBeEnabled();
  });

  it('disables Close problem and prints the server’s blockers underneath it', () => {
    renderActions(problemFixture({ closure: BLOCKED }));

    const close = screen.getByRole('button', { name: 'Close problem' });
    expect(close).toBeDisabled();
    const sentence = BLOCKED.blockers.join(' ');
    expect(close).toHaveAccessibleDescription(sentence);
    // And the same words are printed under the button, not only offered as its description.
    expect(screen.getByText(sentence, { selector: 'p' })).toBeInTheDocument();
  });

  it('enables Close problem when the server allows it', () => {
    renderActions(problemFixture({ closure: closureFixture() }));
    expect(screen.getByRole('button', { name: 'Close problem' })).toBeEnabled();
  });

  it('reports an outstanding preventive test without disabling anything', () => {
    renderActions(
      problemFixture({
        closure: closureFixture({ warnings: ['No preventive test has been added.'] }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Close problem' })).toBeEnabled();
    expect(screen.getByText('No preventive test has been added.')).toBeInTheDocument();
  });

  it('disables Close for somebody who may read a problem but not manage one', () => {
    renderActions(problemFixture({ closure: closureFixture() }), ROLE_KEYS.DEVELOPER);
    const close = screen.getByRole('button', { name: 'Close problem' });
    expect(close).toBeDisabled();
    expect(close).toHaveAccessibleDescription(/problem:manage/);
  });

  it('offers the preventive test to QA and refuses it to a developer', () => {
    renderActions(problemFixture(), ROLE_KEYS.TESTER);
    expect(screen.getByRole('button', { name: 'Add preventive test' })).toBeEnabled();

    renderActions(problemFixture(), ROLE_KEYS.DEVELOPER);
    const buttons = screen.getAllByRole('button', { name: 'Add preventive test' });
    expect(buttons.at(-1)).toBeDisabled();
    expect(buttons.at(-1)).toHaveAccessibleDescription(/problem:add-preventive-test/);
  });
});

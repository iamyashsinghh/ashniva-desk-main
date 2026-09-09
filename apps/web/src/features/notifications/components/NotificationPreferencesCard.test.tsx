import { ROLE_KEYS, type NotificationPreferences } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { NotificationPreferencesCard } from './NotificationPreferencesCard';

/**
 * Saving preferences.
 *
 * The screen holds all eighty-one switches whether or not anybody touched them, and used to send
 * all eighty-one on every save — eighty-one writes to record one toggle. What it sends now is the
 * difference, which is also what makes the audit entry mean something.
 */

const PREFERENCES: NotificationPreferences = {
  entries: [],
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezone: 'Asia/Kolkata',
};

interface SavedBody {
  entries?: { type: string; channel: string; enabled: boolean }[];
  quietHoursEnabled?: boolean;
  timezone?: string;
}

function renderCard() {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  const saved: SavedBody[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init?: RequestInit) => {
    if (init?.body) {
      saved.push(JSON.parse(String(init.body)) as SavedBody);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => PREFERENCES } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationPreferencesCard preferences={PREFERENCES} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return saved;
}

describe('NotificationPreferencesCard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends only the switch that moved', async () => {
    const saved = renderCard();

    fireEvent.click(screen.getByLabelText('New ticket via In app'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.entries).toEqual([{ type: 'TICKET_NEW', channel: 'IN_APP', enabled: false }]);
    // Quiet hours were not touched, so they are not in the payload at all.
    expect(saved[0]).not.toHaveProperty('quietHoursEnabled');
    expect(saved[0]).not.toHaveProperty('timezone');
  });

  it('sends the quiet-hours change and no switches when only quiet hours moved', async () => {
    const saved = renderCard();

    fireEvent.click(screen.getByLabelText('Hold non-urgent notifications overnight'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.entries).toEqual([]);
    expect(saved[0]?.quietHoursEnabled).toBe(true);
  });

  it('leaves the channels that have no provider behind them read-only', () => {
    renderCard();

    expect(screen.getByLabelText('New ticket via Email (not available yet)')).toBeDisabled();
    expect(screen.getByLabelText('New ticket via WhatsApp (not available yet)')).toBeDisabled();
    expect(screen.getByLabelText('New ticket via In app')).toBeEnabled();
  });
});

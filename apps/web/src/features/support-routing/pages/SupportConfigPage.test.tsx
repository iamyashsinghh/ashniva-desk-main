import { ROLE_KEYS, type EffectiveAvailability, type ProjectSupportConfig } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { SupportConfigPage } from './SupportConfigPage';

/**
 * The screen a manager configures routing from.
 *
 * The assertion that matters is the two-status one: what was last recorded and what routing will
 * actually do can differ, and a screen that showed only the first would tell a manager somebody is
 * available while the router quietly skips them.
 */

const user = (id: string, name: string) => ({ id, name, email: `${id}@example.com` });

function member(over: Partial<EffectiveAvailability> = {}): EffectiveAvailability {
  return {
    userId: 'user-dev',
    user: user('user-dev', 'Arjun R'),
    status: 'AVAILABLE',
    source: 'HR',
    until: null,
    note: null,
    updatedAt: '2026-09-07T04:00:00.000Z',
    effectiveStatus: 'AVAILABLE',
    withinSchedule: true,
    schedule: {
      userId: 'user-dev',
      user: user('user-dev', 'Arjun R'),
      workingDays: [1, 2, 3, 4, 5],
      startTime: '09:30',
      endTime: '18:30',
      timezone: 'Asia/Kolkata',
      workloadLimit: null,
      updatedAt: '2026-09-07T04:00:00.000Z',
    },
    ...over,
  };
}

function configFixture(team: EffectiveAvailability[]): ProjectSupportConfig {
  return {
    ownership: {
      projectId: 'project-1',
      primaryDeveloper: user('user-dev', 'Arjun R'),
      backupDeveloper: null,
      senior: null,
      tester: null,
      supportExecutive: null,
      moduleOwners: { Billing: 'user-dev' },
      workloadLimit: null,
      ackMinutes: 15,
      escalationMinutes: 30,
      directTypes: [],
      autoRouteEnabled: true,
      fallbackUser: null,
      updatedAt: '2026-09-07T04:00:00.000Z',
    },
    onCall: [],
    team,
  };
}

function renderPage(team: EffectiveAvailability[]) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('support-config')
      ? configFixture(team)
      : [{ id: 'project-1', code: 'ACM', name: 'Acme portal' }];
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SupportConfigPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SupportConfigPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the team and the ownership chain', async () => {
    renderPage([member()]);
    // The name appears in the table and in every role picker, so all of them are the assertion.
    expect(await screen.findAllByText('Arjun R')).not.toHaveLength(0);
    expect(screen.getByText('09:30–18:30 Asia/Kolkata')).toBeInTheDocument();
    expect(screen.getByLabelText('Primary developer')).toHaveValue('user-dev');
  });

  it('shows what routing will do, not only what HR last said', async () => {
    renderPage([
      member({
        status: 'AVAILABLE',
        source: 'HR',
        effectiveStatus: 'OUT_OF_HOURS',
        withinSchedule: false,
      }),
    ]);
    // Both appear: the recorded fact and the answer the router acts on.
    expect(await screen.findByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Outside working hours')).toBeInTheDocument();
  });

  it('says plainly when somebody has no working hours at all', async () => {
    renderPage([member({ schedule: null, effectiveStatus: 'AVAILABLE' })]);
    expect(await screen.findByText('No working hours configured')).toBeInTheDocument();
  });
});

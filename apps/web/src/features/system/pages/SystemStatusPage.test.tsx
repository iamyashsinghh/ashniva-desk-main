import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { SystemStatusPage } from './SystemStatusPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemStatusPage />
    </QueryClientProvider>,
  );
}

const healthBody = {
  status: 'down',
  version: '0.1.0',
  environment: 'test',
  timestamp: '2026-09-05T10:00:00.000Z',
  components: {
    database: { status: 'up', latencyMs: 3 },
    redis: { status: 'up', latencyMs: 1 },
    storage: { status: 'down', latencyMs: 40, message: 'connect ECONNREFUSED' },
    queues: { status: 'up', latencyMs: 2 },
    realtime: { status: 'up', latencyMs: 0, message: '3 connected, shared adapter' },
  },
};

describe('SystemStatusPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows each component, including a degraded one from a 503 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(healthBody), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderPage();

    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Object storage (S3)')).toBeInTheDocument();
    // The background work and the websocket layer are components in their own right: a deployment
    // can serve every request correctly with neither of them running.
    expect(screen.getByText('Background jobs')).toBeInTheDocument();
    expect(screen.getByText('Live updates')).toBeInTheDocument();
    expect(screen.getByText(/ECONNREFUSED/)).toBeInTheDocument();
    expect(screen.getAllByText('Up')).toHaveLength(4);
    expect(screen.getByText('Down')).toBeInTheDocument();
  });

  it('offers a retry when the API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    renderPage();

    expect(await screen.findByText('The API could not be reached')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

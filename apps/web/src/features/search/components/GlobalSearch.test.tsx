import type { SearchResponse } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { GlobalSearch } from './GlobalSearch';

const RESPONSE: SearchResponse = {
  query: 'acme',
  total: 3,
  truncated: false,
  groups: [
    {
      type: 'task',
      label: 'Tasks',
      hasMore: false,
      hits: [
        {
          type: 'task',
          id: 't1',
          reference: 'ACM-1',
          title: 'Fix the receipt footer',
          subtitle: 'Acme Retail POS',
          status: 'ASSIGNED',
          href: '/tasks/t1',
        },
        {
          type: 'task',
          id: 't2',
          reference: 'ACM-2',
          title: 'Barcode scanner driver',
          subtitle: 'Acme Retail POS',
          status: 'IN_PROGRESS',
          href: '/tasks/t2',
        },
      ],
    },
    {
      type: 'ticket',
      label: 'Tickets',
      hasMore: true,
      hits: [
        {
          type: 'ticket',
          id: 'k1',
          reference: 'T-9',
          title: 'Customers cannot pay by UPI',
          subtitle: 'Acme Retail Pvt Ltd',
          status: 'NEW',
          href: '/tickets/k1',
        },
      ],
    },
  ],
};

function renderSearch(body: SearchResponse = RESPONSE) {
  setAuthenticated('test-token', sessionUserFor('SUPER_ADMIN'));
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<GlobalSearch resultsPath="/search" />} />
          <Route path="/tasks/:id" element={<p>task screen</p>} />
          <Route path="/tickets/:id" element={<p>ticket screen</p>} />
          <Route path="/search" element={<p>results screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole('combobox', { name: 'Search' });
}

function type(box: HTMLElement, value: string) {
  // A real focus, not a synthetic focus event: the keyboard assertions below check that the input
  // keeps it while the arrow keys move the active row.
  box.focus();
  fireEvent.change(box, { target: { value } });
}

function selected(name: RegExp): HTMLElement {
  return screen.getByRole('option', { name });
}

describe('GlobalSearch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks the API nothing until the term is long enough', async () => {
    const box = renderSearch();
    type(box, 'ac');
    expect(await screen.findByText(/at least 3 characters/i)).toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).not.toHaveBeenCalled());
  });

  it('groups the results it was given', async () => {
    const box = renderSearch();
    type(box, 'acme');
    expect(await screen.findByRole('group', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tickets' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('walks every hit with the arrow keys, across the group headings', async () => {
    const box = renderSearch();
    type(box, 'acme');
    await screen.findByRole('group', { name: 'Tasks' });

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(selected(/Fix the receipt footer/)).toHaveAttribute('aria-selected', 'true');
    // The input keeps focus; aria-activedescendant is what names the active row.
    expect(box).toHaveAttribute('aria-activedescendant', selected(/Fix the receipt footer/).id);
    expect(box).toHaveFocus();

    // Third press crosses from the last task into the first ticket: one list, two groups.
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(selected(/Customers cannot pay by UPI/)).toHaveAttribute('aria-selected', 'true');

    // And it wraps back to the top rather than stopping.
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(selected(/Fix the receipt footer/)).toHaveAttribute('aria-selected', 'true');

    // ArrowUp from the first hit goes to the last.
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(selected(/Customers cannot pay by UPI/)).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the ends with Home and End', async () => {
    const box = renderSearch();
    type(box, 'acme');
    await screen.findByRole('group', { name: 'Tasks' });

    fireEvent.keyDown(box, { key: 'End' });
    expect(selected(/Customers cannot pay by UPI/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box, { key: 'Home' });
    expect(selected(/Fix the receipt footer/)).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the active hit on Enter', async () => {
    const box = renderSearch();
    type(box, 'acme');
    await screen.findByRole('group', { name: 'Tasks' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByText('task screen')).toBeInTheDocument();
  });

  it('goes to the full results page on Enter when nothing is highlighted', async () => {
    const box = renderSearch();
    type(box, 'acme');
    await screen.findByRole('group', { name: 'Tasks' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByText('results screen')).toBeInTheDocument();
  });

  it('opens a hit with the mouse too', async () => {
    const box = renderSearch();
    type(box, 'acme');
    await screen.findByRole('group', { name: 'Tickets' });
    fireEvent.click(selected(/Customers cannot pay by UPI/));
    expect(await screen.findByText('ticket screen')).toBeInTheDocument();
  });

  it('closes on Escape and clears on a second Escape', async () => {
    const box = renderSearch();
    type(box, 'acme');
    await screen.findByRole('group', { name: 'Tasks' });

    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box).toHaveValue('');
  });

  it('says so when nothing matched', async () => {
    const box = renderSearch({ query: 'zzz', total: 0, truncated: false, groups: [] });
    type(box, 'zzz');
    expect(await screen.findByText('No matches.')).toBeInTheDocument();
  });
});

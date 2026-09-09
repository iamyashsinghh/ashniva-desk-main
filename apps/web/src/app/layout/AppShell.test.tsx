import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { setAuthenticated } from '../../features/auth/session-store';
import { sessionUserFor } from '../../test/fixtures';
import { AppShell } from './AppShell';

/*
 * jsdom implements `<dialog>` as an element but not as a dialog: `showModal` and `close` are
 * absent, so a component that calls them throws before anything can be asserted. These stand in
 * for them and keep `open` in step, which is all the drawer's behaviour depends on.
 */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

/*
 * `AppShell` reads the route handles for its title, which needs a data router rather than the
 * `MemoryRouter` the other tests here use.
 */
function renderShell() {
  setAuthenticated('test-token', sessionUserFor('SUPER_ADMIN'));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [{ path: '/tasks', element: <p>Tasks</p>, handle: { title: 'Tasks' } }],
      },
    ],
    { initialEntries: ['/tasks'] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('AppShell navigation drawer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is closed until the Menu button is pressed, and says so', () => {
    renderShell();
    const menuButton = screen.getByRole('button', { name: 'Menu' });

    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(menuButton);

    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Menu');
  });

  // The old hand-rolled sidebar could not be dismissed with a key: the backdrop was a button and
  // Escape did nothing at all.
  it('closes on Escape', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when a link inside it is followed', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    const links = screen.getAllByRole('link', { name: 'Tickets' });
    fireEvent.click(links[links.length - 1]!);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AppShell account menu', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function accountTrigger() {
    return screen.getByRole('button', { name: /Account menu for/ });
  }

  it('opens on the down arrow with focus on the first item', () => {
    renderShell();
    const trigger = accountTrigger();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    expect(items.map((item) => item.textContent)).toEqual(['Profile & password', 'Sign out']);
  });

  it('moves between items with the arrow keys and closes on Escape, returning focus', () => {
    renderShell();
    const trigger = accountTrigger();
    fireEvent.click(trigger);

    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getAllByRole('menuitem')[1]).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

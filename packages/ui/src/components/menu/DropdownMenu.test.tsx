import { fireEvent, render, screen } from '@testing-library/react';

import { DropdownMenu } from './DropdownMenu';

function renderMenu(onSignOut = vi.fn()) {
  render(
    <DropdownMenu
      trigger="AL"
      triggerLabel="Account menu for Ada Lovelace"
      items={[
        { key: 'profile', label: 'Profile' },
        { key: 'billing', label: 'Billing', disabled: true },
        { key: 'sign-out', label: 'Sign out', danger: true, onSelect: onSignOut },
      ]}
    />,
  );
  return { trigger: screen.getByRole('button', { name: 'Account menu for Ada Lovelace' }) };
}

describe('DropdownMenu', () => {
  it('says whether it is open', () => {
    const { trigger } = renderMenu();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('puts focus on the first item when it opens', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus();
  });

  /** A disabled item stays visible so the action is discoverable, and stays unreachable. */
  it('steps over a disabled item', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the trigger', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('runs the action and closes when an item is chosen', () => {
    const onSignOut = vi.fn();
    const { trigger } = renderMenu(onSignOut);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    expect(onSignOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when a press lands outside it', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

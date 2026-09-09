import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { SegmentedControl, Tabs } from './Tabs';

function TabsHarness({ initial = 'overview' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Tabs
      aria-label="Dashboard view"
      value={value}
      onChange={setValue}
      items={[
        { key: 'overview', label: 'Overview' },
        { key: 'operations', label: 'Operations' },
        { key: 'reports', label: 'Reports' },
      ]}
    />
  );
}

describe('Tabs', () => {
  /**
   * `role="tablist"` is a promise that the arrow keys move between tabs and that the strip is one
   * tab stop. Before this it was neither: every tab was its own stop and the arrows did nothing.
   */
  it('is a single tab stop', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Operations' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves with the arrow keys and wraps at the ends', () => {
    render(<TabsHarness />);
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Operations' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the ends with Home and End', () => {
    render(<TabsHarness />);
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * The task list hides two views from people who cannot assign, and a bookmarked URL can still
   * ask for one. If the tab stop only ever went to the selected option, that URL would leave the
   * whole strip unreachable by keyboard.
   */
  it('keeps a tab stop when the selected key is not on screen', () => {
    render(<TabsHarness initial="team" />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '0');
  });
});

describe('SegmentedControl', () => {
  it('behaves as a radio group under the arrow keys', () => {
    function Harness() {
      const [value, setValue] = useState('board');
      return (
        <SegmentedControl
          aria-label="Layout"
          value={value}
          onChange={setValue}
          options={[
            { key: 'board', label: 'Board' },
            { key: 'list', label: 'List' },
          ]}
        />
      );
    }
    render(<Harness />);

    expect(screen.getByRole('radio', { name: 'Board' })).toBeChecked();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Board' })).toHaveAttribute('tabindex', '-1');
  });
});

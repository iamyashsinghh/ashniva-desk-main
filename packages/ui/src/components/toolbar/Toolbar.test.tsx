import { fireEvent, render, screen } from '@testing-library/react';

import { FilterChip, Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('names the group of controls when it is given a label', () => {
    render(
      <Toolbar aria-label="Task filters">
        <button>Overdue only</button>
      </Toolbar>,
    );
    expect(screen.getByRole('group', { name: 'Task filters' })).toBeInTheDocument();
  });

  /**
   * `role="toolbar"` would promise arrow-key navigation between the controls, taking the arrow
   * keys away from the selects and the search box that live in this row.
   */
  it('is not a toolbar role', () => {
    render(
      <Toolbar aria-label="Task filters">
        <button>Overdue only</button>
      </Toolbar>,
    );
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
});

describe('FilterChip', () => {
  /**
   * The task list rendered these as one button whose whole label was "Priority: High ×", which a
   * screen reader read as "Priority: High times" with nothing to say it removed anything.
   */
  it('separates the filter text from the control that clears it', () => {
    const onRemove = vi.fn();
    render(<FilterChip label="Priority: High" onRemove={onRemove} />);

    const remove = screen.getByRole('button', { name: 'Clear filter Priority: High' });
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

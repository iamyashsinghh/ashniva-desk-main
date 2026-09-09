import { render, screen } from '@testing-library/react';

import { Button } from './Button';

describe('Button', () => {
  it('renders its label and defaults to type="button"', () => {
    render(<Button>Create task</Button>);
    const button = screen.getByRole('button', { name: 'Create task' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('explains why it is disabled', () => {
    render(
      <Button disabled disabledReason="Only the assignee can start this task">
        Start work
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Start work' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Only the assignee can start this task');
    expect(button).toHaveAccessibleDescription('Only the assignee can start this task');
  });

  it('is disabled and busy while loading', () => {
    render(<Button loading>Saving</Button>);
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Button — loading', () => {
  /**
   * Swapping the label for a spinner changes the button's width mid-click, which moves whatever
   * is beside it out from under the pointer.
   */
  it('keeps its label while loading', () => {
    render(<Button loading>Save changes</Button>);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });
});

describe('Button — icon only', () => {
  it('takes its name from aria-label', () => {
    render(
      <Button iconOnly aria-label="Clear search">
        ×
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Clear search' })).toHaveClass('ui-button--icon');
  });
});

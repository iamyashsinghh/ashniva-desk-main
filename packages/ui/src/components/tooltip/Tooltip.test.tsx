import { fireEvent, render, screen } from '@testing-library/react';

import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  /**
   * The reason this exists: a native `title` never appears for a keyboard user. Focus alone has to
   * open it, and the hint has to be part of the control's accessible description either way.
   */
  it('opens on focus, not only on hover', () => {
    render(
      <Tooltip content="Only the assignee can start this task">
        <button>Start work</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button', { name: 'Start work' });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Only the assignee can start this task');
    expect(button).toHaveAccessibleDescription('Only the assignee can start this task');
  });

  it('closes on Escape while the pointer is still over it', () => {
    render(
      <Tooltip content="Hint">
        <button>Trigger</button>
      </Tooltip>,
    );
    fireEvent.pointerEnter(screen.getByRole('button').parentElement!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps a description the trigger already had', () => {
    render(
      <Tooltip content="Second">
        <button aria-describedby="existing">Trigger</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button').getAttribute('aria-describedby')).toMatch(/^existing /);
  });
});

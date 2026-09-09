import { render, screen } from '@testing-library/react';

import { FieldGroup } from './FieldGroup';

describe('FieldGroup', () => {
  /**
   * Eight screens wrote `<div><span>Priority</span>…`: a label that is not a label, attached to
   * nothing. A fieldset with a legend is what makes a reader say "Priority" before the options.
   */
  it('names the group with a legend a screen reader can find', () => {
    render(
      <FieldGroup legend="Priority" required hint="Higher priority is reviewed sooner">
        <button>High</button>
      </FieldGroup>,
    );

    const group = screen.getByRole('group', { name: /Priority/ });
    expect(group).toHaveAccessibleDescription('Higher priority is reviewed sooner');
    expect(group).toHaveAttribute('aria-required', 'true');
  });

  it('announces an error and marks the group invalid', () => {
    render(
      <FieldGroup legend="Outcome" error="Choose a result before submitting">
        <button>Pass</button>
      </FieldGroup>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a result before submitting');
    expect(screen.getByRole('group', { name: 'Outcome' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables everything inside it in one place', () => {
    render(
      <FieldGroup legend="Evidence" disabled>
        <button>Attach</button>
      </FieldGroup>,
    );
    expect(screen.getByRole('button', { name: 'Attach' })).toBeDisabled();
  });
});

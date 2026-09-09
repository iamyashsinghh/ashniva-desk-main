import { render, screen } from '@testing-library/react';

import { FormField } from './FormField';
import { Input } from './Input';

describe('FormField', () => {
  it('links label, hint and error to the control', () => {
    render(
      <FormField label="Task title" hint="Keep it short" error="Title is required" required>
        <Input name="title" />
      </FormField>,
    );

    const input = screen.getByLabelText(/Task title/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Keep it short Title is required');
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
  });
});

describe('FormField — optional', () => {
  /**
   * Not aria-hidden. `required` gives a screen reader `aria-required` for free; "optional" is the
   * same information from the other side, and hiding it hides it from the people who need it most.
   */
  it('states "Optional" in the accessible name rather than only in ink', () => {
    render(
      <FormField label="Module" optional>
        <Input name="module" />
      </FormField>,
    );
    expect(screen.getByLabelText(/Module Optional/)).toBeInTheDocument();
  });

  it('does not say both required and optional', () => {
    render(
      <FormField label="Title" required optional>
        <Input name="title" />
      </FormField>,
    );
    expect(screen.queryByText('Optional')).not.toBeInTheDocument();
  });
});

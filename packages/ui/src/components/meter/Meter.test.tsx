import { render, screen } from '@testing-library/react';

import { Meter } from './Meter';

describe('Meter', () => {
  /** Both earlier copies of this bar were aria-hidden, so the progress was invisible to a reader. */
  it('reports its value to assistive technology', () => {
    render(<Meter percent={42} label="Milestone progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Milestone progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps a value that is out of range rather than drawing past the track', () => {
    const { rerender } = render(<Meter percent={140} label="Workload" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    rerender(<Meter percent={-5} label="Workload" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('prefers a spoken value over the raw percentage when one is given', () => {
    render(<Meter percent={75} label="Tasks done" valueText="6 of 8 tasks" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '6 of 8 tasks');
  });
});

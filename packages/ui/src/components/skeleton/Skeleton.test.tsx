import { render } from '@testing-library/react';

import { Skeleton, SkeletonText } from './Skeleton';

describe('Skeleton', () => {
  /**
   * A skeleton is a picture of content that does not exist yet. Announcing it announces nothing,
   * and eleven of them announce nothing eleven times.
   */
  it('is hidden from assistive technology', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the asked-for number of lines, the last one short', () => {
    const { container } = render(<SkeletonText lines={4} />);
    const lines = container.querySelectorAll('.ui-skeleton');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toHaveStyle({ width: '55%' });
  });
});

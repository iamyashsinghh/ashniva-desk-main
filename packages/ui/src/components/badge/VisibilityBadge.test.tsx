import { VISIBILITY } from '@ashniva/types';
import { render, screen } from '@testing-library/react';

import { VisibilityBadge } from './VisibilityBadge';

describe('VisibilityBadge', () => {
  it('shows client-visible in the success tone', () => {
    render(<VisibilityBadge visibility={VISIBILITY.CLIENT} />);
    expect(screen.getByText('Client-visible')).toHaveClass('ui-tone--success');
  });

  it('shows internal in the neutral tone', () => {
    render(<VisibilityBadge visibility={VISIBILITY.INTERNAL} />);
    expect(screen.getByText('Internal')).toHaveClass('ui-tone--neutral');
  });
});

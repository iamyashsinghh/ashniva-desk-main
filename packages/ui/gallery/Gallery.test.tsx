import { fireEvent, render, screen } from '@testing-library/react';

import { COLOR_SCHEME_ATTRIBUTE } from '../src/tokens/color-scheme';

import { Gallery } from './Gallery';

/**
 * A smoke test for the gallery, which is otherwise the one part of this package nothing exercises.
 *
 * It is worth having because the gallery is the review surface: if it throws, the components are
 * unreviewable, and a build that succeeds says nothing about whether the page renders. Rendering
 * it here puts every component through a real mount in one go.
 */
describe('Gallery', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(COLOR_SCHEME_ATTRIBUTE);
  });

  it('renders every section', () => {
    render(<Gallery />);

    for (const heading of [
      'Foundations',
      'Controls',
      'Forms',
      'Data',
      'Feedback',
      'Page furniture and overlays',
    ]) {
      expect(screen.getByRole('heading', { name: heading, level: 2 })).toBeInTheDocument();
    }
  });

  it('paints the document in the scheme the switch names', () => {
    render(<Gallery />);

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe('dark');

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.getAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe('light');
  });
});

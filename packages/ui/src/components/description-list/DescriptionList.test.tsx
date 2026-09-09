import { render, screen } from '@testing-library/react';

import { DescriptionList } from './DescriptionList';

describe('DescriptionList', () => {
  it('pairs every term with its own description', () => {
    render(
      <DescriptionList
        items={[
          { key: 'project', term: 'Project', description: 'Apollo' },
          { key: 'due', term: 'Due', description: 'Tomorrow' },
        ]}
      />,
    );

    const terms = screen.getAllByRole('term');
    const definitions = screen.getAllByRole('definition');
    expect(terms.map((node) => node.textContent)).toEqual(['Project', 'Due']);
    expect(definitions.map((node) => node.textContent)).toEqual(['Apollo', 'Tomorrow']);
  });
});

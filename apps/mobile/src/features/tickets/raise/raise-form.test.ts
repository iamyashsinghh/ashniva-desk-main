import { PRIORITY } from '@ashniva/types';

import { EMPTY_RAISE_FORM, raiseBody, validateRaise } from './raise-form';

describe('validateRaise', () => {
  it('asks for a title and a description', () => {
    expect(validateRaise(EMPTY_RAISE_FORM)).toEqual({
      title: 'Give the ticket a short title',
      description: 'Describe what is happening',
    });
  });

  it('accepts the minimum the API accepts, after trimming', () => {
    expect(validateRaise({ ...EMPTY_RAISE_FORM, title: ' Bug ', description: 'Why' })).toEqual({});
    expect(
      validateRaise({ ...EMPTY_RAISE_FORM, title: ' ab ', description: 'Why' }),
    ).toHaveProperty('title');
  });

  it('refuses what the API would refuse for length', () => {
    const errors = validateRaise({
      ...EMPTY_RAISE_FORM,
      title: 'Checkout fails',
      description: 'It fails',
      module: 'x'.repeat(81),
    });
    expect(Object.keys(errors)).toEqual(['module']);
  });
});

describe('raiseBody', () => {
  it('trims, leaves empty optional fields out and carries the files', () => {
    const body = raiseBody(
      {
        ...EMPTY_RAISE_FORM,
        title: '  Checkout fails ',
        description: ' Card step spins ',
        priority: PRIORITY.HIGH,
        module: ' Checkout ',
        projectId: 'p1',
      },
      ['f1'],
    );
    expect(body).toEqual({
      title: 'Checkout fails',
      description: 'Card step spins',
      type: EMPTY_RAISE_FORM.type,
      priority: PRIORITY.HIGH,
      module: 'Checkout',
      projectId: 'p1',
      fileIds: ['f1'],
    });
  });
});

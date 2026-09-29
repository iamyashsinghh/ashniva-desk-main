import type { OrganizationOption } from '@ashniva/types';

import {
  PUBLISH_REFUSED,
  audienceName,
  clientOptions,
  publishAllBlocked,
  updateMeta,
  updatesQuery,
  validateWording,
} from './completed-today';
import { clientUpdate } from './completed-today-test-data';

const ORGS: OrganizationOption[] = [
  { id: 'ours', name: 'Ashniva', isServiceProvider: true },
  { id: 'org-1', name: 'Acme Ltd', isServiceProvider: false },
];

describe('the two queries', () => {
  it('asks for every pending update, whatever its day', () => {
    expect(updatesQuery('PENDING', null)).toEqual({ status: 'PENDING' });
  });

  it('asks for the published side on the chosen day, for the chosen client', () => {
    expect(updatesQuery('PUBLISHED', 'org-1', '2026-09-28')).toEqual({
      status: 'PUBLISHED',
      date: '2026-09-28',
      clientOrganizationId: 'org-1',
    });
  });
});

describe('the client filter', () => {
  it('never offers our own organization', () => {
    expect(clientOptions(ORGS).map((option) => option.value)).toEqual(['org-1']);
  });

  it('names the audience as the web card does', () => {
    expect(audienceName(ORGS, null)).toBe('clients');
    expect(audienceName(ORGS, 'org-1')).toBe('Acme Ltd');
    expect(audienceName(ORGS, 'gone')).toBe('the client');
  });
});

describe('publish all', () => {
  it('says why it cannot be pressed', () => {
    expect(publishAllBlocked(false, 3)).toBe(PUBLISH_REFUSED);
    expect(publishAllBlocked(true, 0)).toBe('Nothing to publish');
    expect(publishAllBlocked(true, 2)).toBeNull();
  });
});

describe('an update row', () => {
  it('reads client, project, author and day, then who published it', () => {
    const meta = updateMeta(
      clientUpdate({
        status: 'PUBLISHED',
        publishedBy: { id: 's1', name: 'Sara Senior', email: 's@example.com' },
      }),
    );
    expect(meta).toMatch(/^Acme Ltd · Acme portal · Asha Dev · .+ · published by Sara Senior$/);
  });
});

describe('editing the wording', () => {
  it('holds the API’s minimums', () => {
    expect(validateWording(' ab ', 'ok')).toEqual({
      title: 'Give the update a title of at least 3 characters',
      body: 'Write at least 3 characters for the client to read',
    });
    expect(validateWording('Checkout fixed', 'You can now pay by card.')).toEqual({});
  });
});

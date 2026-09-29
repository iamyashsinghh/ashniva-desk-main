import { CONFIG } from '../../support-queue/support-test-data';
import { ownershipDraft, ownershipInput, ownershipProblems } from './ownership-form';

describe('the ownership draft', () => {
  it('round-trips an unchanged ownership', () => {
    expect(ownershipInput(ownershipDraft(CONFIG.ownership))).toEqual({
      primaryDeveloperId: 'u1',
      backupDeveloperId: null,
      seniorId: null,
      testerId: null,
      supportExecutiveId: null,
      moduleOwners: { Billing: 'u1' },
      workloadLimit: null,
      ackMinutes: 30,
      escalationMinutes: 60,
      autoRouteEnabled: true,
    });
  });

  it('refuses clocks that are not whole minutes, and allows a blank limit', () => {
    const draft = { ...ownershipDraft(CONFIG.ownership), ackMinutes: '0', workloadLimit: '' };
    expect(ownershipProblems(draft)).toEqual({ ack: 'Whole minutes, at least 1.' });
  });
});

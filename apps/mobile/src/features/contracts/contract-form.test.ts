import { contractDetail } from './commercial-test-data';
import { contractPayload, initialContractForm, validateContractForm } from './contract-form';

/** The body the contract form sends: what it leaves out matters as much as what it sends. */

it('sends hours as minutes and the client only when creating', () => {
  const form = {
    ...initialContractForm(null),
    clientOrganizationId: 'org-client',
    title: 'Retainer',
    includedHours: '12.5',
  };
  const created = contractPayload(form, { editing: false, canSeeCost: true });
  expect(created).toMatchObject({
    clientOrganizationId: 'org-client',
    includedMinutesPerPeriod: 750,
    lowHoursThresholdMinutes: 300,
    carryForwardCapMinutes: null,
    currency: 'INR',
  });

  const edited = contractPayload(form, { editing: true, canSeeCost: true });
  expect(edited).not.toHaveProperty('clientOrganizationId');
});

it('never sends internal cost for somebody who may not see it', () => {
  const form = initialContractForm(contractDetail());
  expect(contractPayload(form, { editing: true, canSeeCost: false })).not.toHaveProperty(
    'internalCost',
  );
  expect(contractPayload(form, { editing: true, canSeeCost: true })).toMatchObject({
    internalCost: '80000.00',
  });
});

it('shows stored minutes as typeable hours that round-trip', () => {
  const form = initialContractForm(contractDetail({ includedMinutesPerPeriod: 100 }));
  expect(form.includedHours).toBe('1.67');
  expect(contractPayload(form, { editing: true, canSeeCost: false })).toMatchObject({
    includedMinutesPerPeriod: 100,
  });
});

it('refuses an end date before the start and a bad currency', () => {
  const errors = validateContractForm({
    ...initialContractForm(null),
    clientOrganizationId: 'org-client',
    title: 'Retainer',
    startDate: '2026-05-01',
    endDate: '2026-04-01',
    currency: 'RUPEES',
  });
  expect(Object.keys(errors).sort()).toEqual(['currency', 'endDate']);
});

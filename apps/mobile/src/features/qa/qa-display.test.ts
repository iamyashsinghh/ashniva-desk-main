import {
  TESTER_VIEW,
  TEST_ENVIRONMENT,
  TEST_RESULT,
  TEST_SEVERITY,
  TESTING_ASSIGNMENT_STATUS,
  type TesterViewCounts,
} from '@ashniva/types';

import {
  blockedReason,
  canStart,
  evidenceTarget,
  isOpen,
  missingResultFields,
  revealBlockedReason,
} from './qa-display';
import { testerViewLabel, testerViewTabs } from './qa-labels';
import type { ResultForm } from './ResultFields';
import { resultBody } from './TestResultSheet';

describe('which assignments can still be worked', () => {
  it('treats pending, in progress and waiting on the developer as open', () => {
    expect(isOpen(TESTING_ASSIGNMENT_STATUS.PENDING)).toBe(true);
    expect(isOpen(TESTING_ASSIGNMENT_STATUS.CLARIFICATION)).toBe(true);
    expect(isOpen(TESTING_ASSIGNMENT_STATUS.PASSED)).toBe(false);
    expect(isOpen(TESTING_ASSIGNMENT_STATUS.CANCELLED)).toBe(false);
  });

  it('lets a tester pick a clarification back up, not only start a pending one', () => {
    expect(canStart(TESTING_ASSIGNMENT_STATUS.CLARIFICATION)).toBe(true);
    expect(canStart(TESTING_ASSIGNMENT_STATUS.IN_PROGRESS)).toBe(false);
  });
});

describe('why the working controls are off', () => {
  it('names the permission before anything else', () => {
    expect(blockedReason(false, { assignedToUserId: 'me', assignedToName: 'Me' }, 'me')).toMatch(
      /qa:record-result/,
    );
  });

  it('lets anyone claim an unassigned assignment, and names the tester on someone else’s', () => {
    expect(blockedReason(true, { assignedToUserId: null, assignedToName: null }, 'me')).toBeNull();
    expect(blockedReason(true, { assignedToUserId: 'u2', assignedToName: 'Asha' }, 'me')).toBe(
      'Only Asha can do this',
    );
  });
});

describe('why the reveal is off', () => {
  const account = { isActive: true, hasActiveGrant: false };

  it('says what would turn it on, for a manager and for everyone else', () => {
    expect(
      revealBlockedReason({ account, hasOwnGrant: false, canReveal: false, canManage: true }),
    ).toMatch(/test-credential:reveal/);
    expect(
      revealBlockedReason({ account, hasOwnGrant: false, canReveal: true, canManage: true }),
    ).toMatch(/Grant yourself access/);
    expect(
      revealBlockedReason({ account, hasOwnGrant: false, canReveal: true, canManage: false }),
    ).toMatch(/Ask whoever looks after/);
  });

  it('is on with a grant issued here, and off for a retired login even then', () => {
    expect(
      revealBlockedReason({ account, hasOwnGrant: true, canReveal: true, canManage: false }),
    ).toBeNull();
    expect(
      revealBlockedReason({
        account: { ...account, isActive: false },
        hasOwnGrant: true,
        canReveal: true,
        canManage: true,
      }),
    ).toBe('This login has been retired');
  });
});

describe('a test result', () => {
  const pass: ResultForm = {
    result: TEST_RESULT.PASS,
    environment: TEST_ENVIRONMENT.STAGING,
    whatTested: 'Checkout with a saved card',
    actualResult: 'Order placed',
    failureDescription: 'left over from a failure',
    severity: TEST_SEVERITY.HIGH,
    browserDevice: '  ',
    commentForDeveloper: '',
    retestRequired: true,
  };

  it('asks for the failure fields only when it failed', () => {
    expect(missingResultFields(pass)).toEqual([]);
    expect(
      missingResultFields({
        ...pass,
        result: TEST_RESULT.FAIL,
        failureDescription: '',
        severity: null,
      }),
    ).toEqual(['what is broken', 'a severity']);
  });

  it('sends no failure detail or retest flag with a pass, and drops blank optional fields', () => {
    expect(resultBody(pass, undefined)).toEqual({
      result: TEST_RESULT.PASS,
      environment: TEST_ENVIRONMENT.STAGING,
      whatTested: 'Checkout with a saved card',
      actualResult: 'Order placed',
      failureDescription: undefined,
      severity: undefined,
      browserDevice: undefined,
      commentForDeveloper: undefined,
      retestRequired: false,
      evidenceFileId: undefined,
    });
  });

  it('carries the severity, retest flag and evidence with a failure', () => {
    const body = resultBody({ ...pass, result: TEST_RESULT.FAIL }, 'file-1');
    expect(body).toMatchObject({
      failureDescription: 'left over from a failure',
      severity: TEST_SEVERITY.HIGH,
      retestRequired: true,
      evidenceFileId: 'file-1',
    });
  });

  it('files evidence against the task, then the ticket, then the project', () => {
    expect(evidenceTarget({ taskId: 't1', ticketId: 'k1', projectId: 'p1' })).toEqual({
      taskId: 't1',
    });
    expect(evidenceTarget({ taskId: null, ticketId: 'k1', projectId: 'p1' })).toEqual({
      ticketId: 'k1',
    });
    expect(evidenceTarget({ taskId: null, ticketId: null, projectId: 'p1' })).toEqual({
      projectId: 'p1',
    });
  });
});

describe('the nine tester views', () => {
  it('offers all nine in the web app’s order, with counts when the queue has them', () => {
    const counts = Object.fromEntries(
      Object.values(TESTER_VIEW).map((view, index) => [view, index]),
    ) as TesterViewCounts;
    const tabs = testerViewTabs(counts);
    expect(tabs.map((tab) => tab.value)).toEqual(Object.values(TESTER_VIEW));
    expect(tabs[8]).toMatchObject({ value: TESTER_VIEW.OVERDUE, count: 8 });
    expect(testerViewTabs(null)[0]).not.toHaveProperty('count');
    expect(testerViewLabel(TESTER_VIEW.FAILED)).toBe('Failed & returned');
  });
});

import { PRIORITY, isAtLeastAsUrgent } from '@ashniva/types';

import { raisePriority } from './support-ingress.service';

/**
 * A tier's priority floor raises and never lowers.
 *
 * The direction is the whole point: a reporter who says their problem is critical is not overruled
 * by an entitlement, and a tier that promises HIGH does not have to argue with a reporter who left
 * the field alone.
 */
describe('the priority a ticket is filed at', () => {
  it('keeps what was asked for when no floor is set', () => {
    expect(raisePriority(PRIORITY.LOW, null)).toBe(PRIORITY.LOW);
    expect(raisePriority(PRIORITY.CRITICAL, null)).toBe(PRIORITY.CRITICAL);
  });

  it('raises a request that is below the floor', () => {
    expect(raisePriority(PRIORITY.LOW, PRIORITY.HIGH)).toBe(PRIORITY.HIGH);
    expect(raisePriority(PRIORITY.MEDIUM, PRIORITY.HIGH)).toBe(PRIORITY.HIGH);
  });

  it('never lowers a request that is above the floor', () => {
    expect(raisePriority(PRIORITY.CRITICAL, PRIORITY.HIGH)).toBe(PRIORITY.CRITICAL);
    expect(raisePriority(PRIORITY.HIGH, PRIORITY.HIGH)).toBe(PRIORITY.HIGH);
  });

  it('orders priorities least to most urgent', () => {
    expect(isAtLeastAsUrgent(PRIORITY.CRITICAL, PRIORITY.LOW)).toBe(true);
    expect(isAtLeastAsUrgent(PRIORITY.LOW, PRIORITY.MEDIUM)).toBe(false);
  });
});

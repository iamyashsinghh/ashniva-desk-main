import 'reflect-metadata';

import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';

import {
  REQUIRED_ANY_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../../common/decorators/require-permissions.decorator';
import { SEARCH_THROTTLE, SearchController } from './search.controller';

/**
 * The route's own metadata, asserted here rather than by sending sixty-one requests in an e2e
 * test: the throttle is per client IP and a test that exercised it would spend the whole suite's
 * allowance proving something a decorator already states.
 */
describe('SearchController route', () => {
  const route = SearchController.prototype.run;

  it('is throttled below the global allowance', () => {
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', route)).toBe(
      SEARCH_THROTTLE.default.limit,
    );
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', route)).toBe(60_000);
    // RATE_LIMIT_MAX, the allowance every other route gets, is 120 a minute.
    expect(SEARCH_THROTTLE.default.limit).toBeLessThan(120);
  });

  it('carries no permission decorator, because the gate is per module', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, route)).toBeUndefined();
    expect(Reflect.getMetadata(REQUIRED_ANY_PERMISSIONS_KEY, route)).toBeUndefined();
  });
});

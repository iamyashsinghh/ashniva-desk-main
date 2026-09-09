import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

/**
 * How long `findBy*` and `waitFor` keep retrying.
 *
 * Testing Library's default is one second, which is generous for a component and not generous at
 * all for thirty-odd jsdom environments sharing four cores: a render waiting on a resolved fetch
 * would occasionally not get its turn inside the second, and an unrelated test failed. It was
 * reproducible on `main` by adding any one extra test file — the suite was one file away from
 * flaking whatever that file contained.
 *
 * A longer ceiling costs a passing test nothing, because these helpers return as soon as the
 * condition holds. Only a genuinely failing assertion waits the full time.
 *
 * Deliberately below `testTimeout` in `vite.config.ts` — see the note there. A wait that is going
 * to fail should fail here, naming what it could not find, rather than be killed with the test
 * and reported as a bare timeout.
 */
configure({ asyncUtilTimeout: 5000 });

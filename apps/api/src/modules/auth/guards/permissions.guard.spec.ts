import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PERMISSIONS, type PermissionKey } from '@ashniva/types';

import {
  REQUIRED_ANY_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

/**
 * A reflector that answers per metadata key.
 *
 * The mock was `getAllAndOverride: () => required`, which returns the same array whatever it is
 * asked for — so the "all of these" and "at least one of those" reads were indistinguishable and
 * the OR branch had no coverage at all. Deleting that branch outright would have left every test
 * passing.
 */
function buildGuard(required?: PermissionKey[], anyOf?: PermissionKey[]) {
  const metadata: Record<string, PermissionKey[] | undefined> = {
    [REQUIRED_PERMISSIONS_KEY]: required,
    [REQUIRED_ANY_PERMISSIONS_KEY]: anyOf,
  };
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

function buildContext(granted: PermissionKey[] | undefined): ExecutionContext {
  const request = { user: granted ? { permissions: granted } : undefined };
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows routes without a permission requirement', () => {
    expect(buildGuard(undefined).canActivate(buildContext(undefined))).toBe(true);
  });

  it('allows when every required permission is granted', () => {
    const guard = buildGuard([PERMISSIONS.TASK_ASSIGN, PERMISSIONS.TASK_READ]);
    expect(guard.canActivate(buildContext([PERMISSIONS.TASK_READ, PERMISSIONS.TASK_ASSIGN]))).toBe(
      true,
    );
  });

  it('names the missing permission', () => {
    const guard = buildGuard([PERMISSIONS.RELEASE_PUBLISH]);
    expect(() => guard.canActivate(buildContext([PERMISSIONS.TASK_READ]))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(buildContext([PERMISSIONS.TASK_READ]))).toThrow(
      /release:publish/,
    );
  });
});

describe('PermissionsGuard — @RequireAnyPermission', () => {
  it('allows when one of the alternatives is held', () => {
    // The case the decorator exists for: whoever files a QA assignment holds `qa:assign` and
    // whoever records its result holds `qa:record-result`, and both must be able to open it.
    const guard = buildGuard(undefined, [PERMISSIONS.QA_ASSIGN, PERMISSIONS.QA_RECORD_RESULT]);
    expect(guard.canActivate(buildContext([PERMISSIONS.QA_ASSIGN]))).toBe(true);
    expect(guard.canActivate(buildContext([PERMISSIONS.QA_RECORD_RESULT]))).toBe(true);
  });

  it('refuses when none of them is', () => {
    const guard = buildGuard(undefined, [PERMISSIONS.QA_ASSIGN, PERMISSIONS.QA_RECORD_RESULT]);
    expect(() => guard.canActivate(buildContext([PERMISSIONS.TASK_READ]))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(buildContext([PERMISSIONS.TASK_READ]))).toThrow(
      /one of qa:assign, qa:record-result/,
    );
  });

  it('is an extra requirement, never a replacement for the AND list', () => {
    // A route saying "all of these, and at least one of those" means exactly that. Holding one
    // alternative does not excuse a missing required permission.
    const guard = buildGuard([PERMISSIONS.PROJECT_READ], [PERMISSIONS.QA_ASSIGN]);
    expect(() => guard.canActivate(buildContext([PERMISSIONS.QA_ASSIGN]))).toThrow(/project:read/);
    expect(guard.canActivate(buildContext([PERMISSIONS.PROJECT_READ, PERMISSIONS.QA_ASSIGN]))).toBe(
      true,
    );
  });

  it('ignores an empty alternatives list rather than refusing everything', () => {
    expect(buildGuard(undefined, []).canActivate(buildContext([]))).toBe(true);
  });
});

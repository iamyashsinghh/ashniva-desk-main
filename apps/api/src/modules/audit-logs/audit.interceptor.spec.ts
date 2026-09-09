import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';

import type { AuditLogService } from './audit-log.service';
import { AuditInterceptor } from './audit.interceptor';
import type { AuditedOptions } from './audited.decorator';

function buildInterceptor(options: AuditedOptions | undefined) {
  const reflector = { get: () => options } as unknown as Reflector;
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditLogService>;
  return { interceptor: new AuditInterceptor(reflector, auditLog), auditLog };
}

function buildContext(params: Record<string, string>): ExecutionContext {
  const request = { params, ip: '127.0.0.1', headers: { 'user-agent': 'jest' } };
  return {
    getHandler: () => null,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const next: CallHandler = { handle: () => of({ id: 'result-id', status: 'PUBLISHED' }) };

describe('AuditInterceptor', () => {
  it('does nothing for handlers without @Audited', async () => {
    const { interceptor, auditLog } = buildInterceptor(undefined);
    await lastValueFrom(interceptor.intercept(buildContext({}), next));
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('records the action with the entity id from the route params', async () => {
    const { interceptor, auditLog } = buildInterceptor({
      action: 'release.published',
      entityType: 'release',
    });
    await lastValueFrom(interceptor.intercept(buildContext({ id: 'rel-1' }), next));
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'release.published',
        entityType: 'release',
        entityId: 'rel-1',
        ipAddress: '127.0.0.1',
      }),
    );
  });

  it('falls back to the result id', async () => {
    const { interceptor, auditLog } = buildInterceptor({
      action: 'task.created',
      entityType: 'task',
    });
    await lastValueFrom(interceptor.intercept(buildContext({}), next));
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'result-id' }),
    );
  });
});

import { NotFoundException, type ExecutionContext } from '@nestjs/common';

import type { AppConfigService } from '../../config/app-config.service';
import { MetricsTokenGuard } from './metrics-token.guard';

function contextWith(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: authorization ? { authorization } : {} }),
    }),
  } as unknown as ExecutionContext;
}

function guardWith(token?: string): MetricsTokenGuard {
  return new MetricsTokenGuard({ metrics: { token } } as unknown as AppConfigService);
}

describe('MetricsTokenGuard', () => {
  const token = 'a'.repeat(32);

  it('lets a scraper with the configured token through', () => {
    expect(guardWith(token).canActivate(contextWith(`Bearer ${token}`))).toBe(true);
  });

  it('answers 404 when no token is configured, so unset means nobody rather than everybody', () => {
    expect(() => guardWith().canActivate(contextWith(`Bearer ${token}`))).toThrow(
      NotFoundException,
    );
  });

  it('answers 404 with no credential at all', () => {
    expect(() => guardWith(token).canActivate(contextWith())).toThrow(NotFoundException);
  });

  it('answers 404 for a wrong token, and for one of the wrong length', () => {
    expect(() => guardWith(token).canActivate(contextWith(`Bearer ${'b'.repeat(32)}`))).toThrow(
      NotFoundException,
    );
    expect(() => guardWith(token).canActivate(contextWith('Bearer short'))).toThrow(
      NotFoundException,
    );
  });

  it('refuses a token presented without the Bearer scheme', () => {
    expect(() => guardWith(token).canActivate(contextWith(token))).toThrow(NotFoundException);
  });
});

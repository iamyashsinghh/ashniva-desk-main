import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@ashniva/types';
import type { Request } from 'express';

export type RequestWithUser = Request & { user?: AuthenticatedUser };

/** Injects the authenticated user set by JwtAuthGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  return request.user;
});

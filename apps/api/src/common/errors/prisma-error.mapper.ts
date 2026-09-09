import { HttpStatus } from '@nestjs/common';

interface MappedError {
  statusCode: number;
  error: string;
  message: string;
}

interface PrismaKnownRequestErrorLike {
  code: string;
  meta?: { target?: unknown };
}

function isPrismaKnownRequestError(error: unknown): error is PrismaKnownRequestErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('P2')
  );
}

/** Translates the Prisma errors that map cleanly onto HTTP statuses. Everything else stays a 500. */
export function mapPrismaError(error: unknown): MappedError | undefined {
  if (!isPrismaKnownRequestError(error)) {
    return undefined;
  }

  switch (error.code) {
    case 'P2002': {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : 'field';
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: `A record with the same ${target} already exists`,
      };
    }
    case 'P2025':
      return { statusCode: HttpStatus.NOT_FOUND, error: 'Not Found', message: 'Record not found' };
    case 'P2003':
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Related record does not exist',
      };
    default:
      return undefined;
  }
}

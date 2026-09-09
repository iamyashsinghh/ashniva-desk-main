import { mapPrismaError } from './prisma-error.mapper';

describe('mapPrismaError', () => {
  it('maps unique violations to 409', () => {
    const mapped = mapPrismaError({ code: 'P2002', meta: { target: ['email'] } });
    expect(mapped).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'A record with the same email already exists',
    });
  });

  it('maps missing records to 404', () => {
    expect(mapPrismaError({ code: 'P2025' })?.statusCode).toBe(404);
  });

  it('ignores non-Prisma errors', () => {
    expect(mapPrismaError(new Error('boom'))).toBeUndefined();
    expect(mapPrismaError(null)).toBeUndefined();
  });
});

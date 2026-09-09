import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as reachable without a JWT (health, branding, login). Everything else requires auth. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

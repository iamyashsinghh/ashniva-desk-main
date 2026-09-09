import { registerDecorator, type ValidationOptions } from 'class-validator';

import { isValidTimezone } from '../business-hours';

/**
 * Accepts any IANA name the runtime can format in ("Asia/Kolkata", "UTC", "Europe/Berlin").
 * Intl.supportedValuesOf is not used because it omits aliases such as plain "UTC".
 */
export function IsTimezone(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isTimezone',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: { message: 'timezone must be an IANA timezone name', ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidTimezone(value),
      },
    });
  };
}

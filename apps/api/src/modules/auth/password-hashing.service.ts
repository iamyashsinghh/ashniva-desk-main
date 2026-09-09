import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Argon2id password hashing (OWASP-recommended parameters).
 * Passwords are never stored or logged in clear text anywhere in the API.
 */
@Injectable()
export class PasswordHashingService {
  private readonly options: argon2.HashOptions = {
    type: argon2.argon2id,
    memoryCost: 19 * 1024, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { ...this.options, raw: false });
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, plainPassword);
    } catch {
      // A malformed hash must behave like a wrong password, never like a server error.
      return false;
    }
  }
}

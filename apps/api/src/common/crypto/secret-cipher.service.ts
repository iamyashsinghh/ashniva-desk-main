import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const FORMAT_VERSION = 'v1';

/**
 * Encrypts secrets at rest (test-account passwords, GitHub App keys, IVR credentials).
 * Output format: v1:<iv>:<authTag>:<ciphertext>, all base64. The key comes from
 * APP_ENCRYPTION_KEY (a KMS-managed key can replace it later without changing callers).
 */
@Injectable()
export class SecretCipherService {
  constructor(private readonly config: AppConfigService) {}

  encrypt(plainText: string): string {
    const key = this.loadKey();
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const cipherText = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
      FORMAT_VERSION,
      iv.toString('base64'),
      authTag.toString('base64'),
      cipherText.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [version, ivBase64, authTagBase64, cipherTextBase64] = payload.split(':');
    if (version !== FORMAT_VERSION || !ivBase64 || !authTagBase64 || !cipherTextBase64) {
      throw new Error('Unrecognised encrypted payload format');
    }
    const key = this.loadKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(cipherTextBase64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  }

  private loadKey(): Buffer {
    const encodedKey = this.config.encryption.key;
    if (!encodedKey) {
      throw new Error('APP_ENCRYPTION_KEY is not configured');
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
    return key;
  }
}

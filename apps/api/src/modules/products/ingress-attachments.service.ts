import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { MAX_INGRESS_ATTACHMENTS } from '@ashniva/types';

import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  MAX_FILE_BYTES,
  contentMatchesDeclaredType,
  isAllowedContentType,
  sanitizeName,
} from '../files/file-rules';
import type { SupportIngressAttachmentDto } from './dto/support-ingress.dto';
import type { AuthenticatedProduct } from './product-context';

/** One attachment that has reached object storage but does not yet belong to a ticket. */
export interface StagedAttachment {
  name: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
}

/**
 * Getting a reporter's screenshots into storage, and out again when the ticket does not happen.
 *
 * Its own service rather than two more methods on the ingress: what it does is orthogonal to what
 * a ticket *is*, it is the only part of the raise that touches object storage, and separating it
 * is what lets both the server ingress and the widget share it without either of them growing a
 * copy.
 */
@Injectable()
export class IngressAttachmentsService {
  constructor(private readonly storage: StorageService) {}

  /**
   * Writes attachments to storage before the ticket transaction opens.
   *
   * Object storage is not transactional, so an upload inside the transaction would leave orphaned
   * objects behind on rollback. Staging first and deleting on failure gets it the right way round:
   * a failed request leaves nothing, and the worst case is a delete that itself fails and leaves
   * one unreferenced object, which costs storage rather than correctness.
   */
  async stage(
    product: AuthenticatedProduct,
    attachments: readonly SupportIngressAttachmentDto[] = [],
  ): Promise<StagedAttachment[]> {
    const staged: StagedAttachment[] = [];
    for (const attachment of attachments.slice(0, MAX_INGRESS_ATTACHMENTS)) {
      if (!isAllowedContentType(attachment.contentType)) {
        throw new BadRequestException(`File type ${attachment.contentType} is not allowed`);
      }
      const buffer = Buffer.from(attachment.content, 'base64');
      if (buffer.byteLength === 0) {
        throw new BadRequestException('An attachment was empty or not valid base64');
      }
      if (buffer.byteLength > MAX_FILE_BYTES) {
        throw new BadRequestException('Files are limited to 10 MB');
      }
      // The same byte check `POST /files` makes. The two upload paths have to agree, or the
      // looser one becomes the one an attacker uses — see the note on file-rules.ts. This check
      // arrived on the production-readiness branch while this staging code still lived on the
      // ingress service; it belongs wherever the staging does, which is here.
      if (!contentMatchesDeclaredType(buffer, attachment.contentType)) {
        throw new BadRequestException(`An attachment's content is not ${attachment.contentType}`);
      }
      const name = sanitizeName(attachment.filename);
      // The key is composed here, never supplied: a caller-chosen key is a caller-chosen path
      // into another tenant's objects.
      const storageKey = `${product.organizationId}/${product.productId}/${randomUUID()}/${name}`;
      await this.storage.client.send(
        new PutObjectCommand({
          Bucket: this.storage.bucket,
          Key: storageKey,
          Body: buffer,
          ContentType: attachment.contentType,
          ContentLength: buffer.byteLength,
        }),
      );
      staged.push({
        name,
        contentType: attachment.contentType,
        sizeBytes: buffer.byteLength,
        storageKey,
      });
    }
    return staged;
  }

  /** Best-effort cleanup. A delete that fails costs storage, never correctness. */
  async discard(staged: readonly StagedAttachment[]): Promise<void> {
    for (const file of staged) {
      await this.storage.client
        .send(new DeleteObjectCommand({ Bucket: this.storage.bucket, Key: file.storageKey }))
        .catch(() => null);
    }
  }
}

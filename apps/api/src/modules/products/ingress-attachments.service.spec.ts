import { BadRequestException } from '@nestjs/common';

import type { StorageService } from '../../infrastructure/storage/storage.service';
import { IngressAttachmentsService } from './ingress-attachments.service';
import type { SupportIngressAttachmentDto } from './dto/support-ingress.dto';
import type { AuthenticatedProduct } from './product-context';

/**
 * The external ingress refuses what `POST /files` refuses.
 *
 * `file-rules.spec.ts` proves `contentMatchesDeclaredType` can tell a PNG from a shell script.
 * This proves the *ingress* asks it. The distinction earned its own file during the ten-branch
 * merge: the check was added to a `stage()` that lived on `SupportIngressService`, and the branch
 * it merged with had moved staging into this class. Taking either side of that conflict compiled,
 * passed every test, and left an authenticated external caller able to post a `.sh` as an
 * `image/png` — because nothing anywhere asserted that this code path consults the rule.
 */
describe('IngressAttachmentsService', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

  function build() {
    const sent: unknown[] = [];
    const storage = {
      bucket: 'test-bucket',
      client: {
        send: (command: unknown) => {
          sent.push(command);
          return Promise.resolve({});
        },
      },
    } as unknown as StorageService;
    return { service: new IngressAttachmentsService(storage), sent };
  }

  const product = {
    organizationId: 'org-1',
    productId: 'product-1',
  } as unknown as AuthenticatedProduct;

  const attachment = (content: Buffer, contentType: string): SupportIngressAttachmentDto =>
    ({
      filename: 'evidence',
      contentType,
      content: content.toString('base64'),
    }) as SupportIngressAttachmentDto;

  it('stages a file whose bytes match what it says it is', async () => {
    const { service, sent } = build();
    const staged = await service.stage(product, [attachment(PNG, 'image/png')]);

    expect(staged).toHaveLength(1);
    expect(staged[0]?.contentType).toBe('image/png');
    // The key is composed from the product, never from the caller's filename alone.
    expect(staged[0]?.storageKey).toMatch(/^org-1\/product-1\//);
    expect(sent).toHaveLength(1);
  });

  it('refuses an allowed content type whose bytes are something else, before uploading', async () => {
    const { service, sent } = build();
    const script = Buffer.from('#!/bin/sh\nrm -rf /\n', 'utf8');

    await expect(service.stage(product, [attachment(script, 'image/png')])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Nothing reached object storage: the refusal happens before the PutObject, so a rejected
    // attachment cannot leave an orphaned object behind for the discard path to miss.
    expect(sent).toEqual([]);
  });

  it('still refuses a content type that is not on the allow-list at all', async () => {
    const { service, sent } = build();

    await expect(
      service.stage(product, [attachment(PNG, 'application/x-sh')]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sent).toEqual([]);
  });
});

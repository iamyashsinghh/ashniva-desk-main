import {
  MAX_INGRESS_ATTACHMENTS,
  MAX_INGRESS_METADATA_KEYS,
  MAX_INGRESS_METADATA_VALUE_LENGTH,
  SUPPORT_CALLBACK_EVENTS,
} from '@ashniva/types';

import { LIMITS, SUPPORT_EVENTS } from './contract';

/**
 * The drift guard for the inlined contract.
 *
 * `contract.ts` copies a handful of the server's constants rather than importing them, for the
 * packaging reasons written out there. The obvious cost of a copy is that it can fall behind, and
 * this is what stops that: `@ashniva/types` is a *dev* dependency, so the assertions below run in
 * CI and nothing they import reaches a customer's bundle.
 *
 * A failure here means the server moved a bound and the SDK would now let a reporter type
 * something the API will refuse — which shows up as a mysterious 400 after a long upload rather
 * than as a message beside the field.
 */
describe('the inlined contract still matches @ashniva/types', () => {
  it('mirrors the ingress attachment and metadata bounds', () => {
    expect(LIMITS.attachmentsMax).toBe(MAX_INGRESS_ATTACHMENTS);
    expect(LIMITS.metadataKeys).toBe(MAX_INGRESS_METADATA_KEYS);
    expect(LIMITS.metadataValueMax).toBe(MAX_INGRESS_METADATA_VALUE_LENGTH);
  });

  it('lists exactly the callback events the server can send', () => {
    expect([...SUPPORT_EVENTS].sort()).toEqual([...SUPPORT_CALLBACK_EVENTS].sort());
  });

  /**
   * The title and description bounds live in class-validator decorators rather than in a
   * constant, so there is nothing to import and compare. Written out here instead, next to the
   * bounds they mirror, so that changing one without the other is at least a visible edit in a
   * file named for the agreement.
   */
  it('mirrors the bounds that live in the DTO decorators', () => {
    expect(LIMITS.titleMin).toBe(3);
    expect(LIMITS.titleMax).toBe(200);
    expect(LIMITS.descriptionMin).toBe(3);
    expect(LIMITS.descriptionMax).toBe(10_000);
    expect(LIMITS.attachmentBytesMax).toBe(10 * 1024 * 1024);
    expect(LIMITS.contextMax).toBe(300);
    expect(LIMITS.externalReferenceMax).toBe(120);
  });
});

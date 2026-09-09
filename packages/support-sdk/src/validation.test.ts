import { LIMITS } from './contract';
import { decodedByteLength, validateIssue } from './validation';

const valid = { subject: 'Sync broke', description: 'Templates stopped syncing this morning.' };

describe('client-side validation mirrors the server bounds', () => {
  it('accepts an issue inside every bound', () => {
    expect(validateIssue(valid)).toEqual([]);
  });

  it('refuses a subject that is too short or too long', () => {
    expect(validateIssue({ ...valid, subject: 'no' })[0]?.field).toBe('subject');
    expect(validateIssue({ ...valid, subject: 'x'.repeat(201) })[0]?.field).toBe('subject');
  });

  it('refuses a description outside 3 to 10,000 characters', () => {
    expect(validateIssue({ ...valid, description: 'x' })[0]?.field).toBe('description');
    expect(validateIssue({ ...valid, description: 'x'.repeat(10_001) })[0]?.field).toBe(
      'description',
    );
  });

  it('refuses more than five attachments', () => {
    const attachment = { filename: 'a.png', contentType: 'image/png', content: 'AAAA' };
    const problems = validateIssue({
      ...valid,
      attachments: Array.from({ length: LIMITS.attachmentsMax + 1 }, () => attachment),
    });
    expect(problems[0]?.field).toBe('attachments');
  });

  it('refuses more than twenty metadata keys, and an over-long value', () => {
    const metadata = Object.fromEntries(
      Array.from({ length: LIMITS.metadataKeys + 1 }, (_value, index) => [`k${index}`, 'v']),
    );
    expect(validateIssue({ ...valid, metadata })[0]?.field).toBe('metadata');
    expect(
      validateIssue({ ...valid, metadata: { k: 'v'.repeat(LIMITS.metadataValueMax + 1) } })[0]
        ?.field,
    ).toBe('metadata.k');
  });

  /**
   * The bound that is easy to get wrong: base64 is a third longer than what it encodes, so a
   * check against the string's length refuses files well under the real limit.
   */
  it('measures an attachment by its decoded size, not its encoded one', () => {
    // Four base64 characters carry three bytes, so an unpadded string encoding N bytes is 4N/3
    // characters long. Just under the limit in bytes, and comfortably over it in characters —
    // which is exactly the case a length check on the string would refuse.
    const bytes = LIMITS.attachmentBytesMax - 1; // divisible by three
    const content = 'A'.repeat((bytes / 3) * 4);
    expect(decodedByteLength(content)).toBe(bytes);
    expect(content.length).toBeGreaterThan(LIMITS.attachmentBytesMax);
    expect(
      validateIssue({
        ...valid,
        attachments: [{ filename: 'big.png', contentType: 'image/png', content }],
      }),
    ).toEqual([]);
  });

  it('refuses an attachment over ten megabytes decoded, and one that is not base64', () => {
    const tooBig = 'A'.repeat(((LIMITS.attachmentBytesMax + 2) / 3) * 4);
    expect(decodedByteLength(tooBig)).toBeGreaterThan(LIMITS.attachmentBytesMax);
    expect(
      validateIssue({
        ...valid,
        attachments: [{ filename: 'big.png', contentType: 'image/png', content: tooBig }],
      })[0]?.field,
    ).toBe('attachments.0.content');
    expect(
      validateIssue({
        ...valid,
        attachments: [{ filename: 'a.png', contentType: 'image/png', content: 'not base64!' }],
      })[0]?.field,
    ).toBe('attachments.0.content');
  });
});

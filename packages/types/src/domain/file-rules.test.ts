import { ALLOWED_FILE_CONTENT_TYPES, MAX_FILE_BYTES, isAllowedContentType } from './file-rules';

/**
 * The upload rules are shared, so they are tested where they live rather than in each consumer.
 * Every client that refuses a file before sending it is trusting this list to say the same thing
 * the API's check says.
 */

describe('attachment content types', () => {
  it('accepts what people attach from a phone or a desk', () => {
    expect(isAllowedContentType('image/png')).toBe(true);
    expect(isAllowedContentType('application/pdf')).toBe(true);
    expect(isAllowedContentType('text/plain')).toBe(true);
  });

  it('refuses video, and anything the platform could not name', () => {
    // The wasteful case: a screen recording is under the size limit and still refused, so a client
    // that checks only size carries the whole thing before finding out.
    expect(isAllowedContentType('video/quicktime')).toBe(false);
    expect(isAllowedContentType('video/mp4')).toBe(false);
    expect(isAllowedContentType('application/octet-stream')).toBe(false);
    expect(isAllowedContentType('')).toBe(false);
  });

  it('is exactly the list, with nothing outside it', () => {
    for (const contentType of ALLOWED_FILE_CONTENT_TYPES) {
      expect(isAllowedContentType(contentType)).toBe(true);
    }
    expect(new Set(ALLOWED_FILE_CONTENT_TYPES).size).toBe(ALLOWED_FILE_CONTENT_TYPES.length);
  });
});

describe('the size limit', () => {
  it('is ten megabytes, the number both the API and the clients quote', () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});

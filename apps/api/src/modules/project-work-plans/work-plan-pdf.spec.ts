import { extractPdfText, looksLikePdf } from './work-plan-pdf';

describe('extractPdfText', () => {
  it('reads literal strings out of a simple PDF', () => {
    const pdf = Buffer.from(
      '%PDF-1.1\n1 0 obj<<>>endobj\nstream\nBT (PHASE 1 DISCOVERY) Tj ( - Gather requirements 30m) Tj ET\nendstream\n',
      'latin1',
    );
    const text = extractPdfText(pdf);
    expect(text).toMatch(/PHASE 1 DISCOVERY/);
    expect(text).toMatch(/Gather requirements/);
  });
});

describe('looksLikePdf', () => {
  it('accepts a buffer that starts with the PDF signature', () => {
    expect(looksLikePdf(Buffer.from('%PDF-1.4 rest'), 'application/octet-stream')).toBe(true);
  });

  it('accepts a declared PDF type when the signature is missing', () => {
    expect(looksLikePdf(Buffer.from('not a pdf'), 'application/pdf')).toBe(true);
  });

  it('rejects a non-PDF', () => {
    expect(looksLikePdf(Buffer.from('hello'), 'text/plain')).toBe(false);
  });
});

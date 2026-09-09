import { contentMatchesDeclaredType, isAllowedContentType, sanitizeName } from './file-rules';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = Buffer.from('GIF89a\u0001\u0000', 'latin1');
const PDF = Buffer.from('%PDF-1.7\n1 0 obj', 'latin1');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'latin1'),
]);
/**
 * An ELF executable: the thing somebody renames to notes.txt.
 *
 * The full 16-byte `e_ident`, padding included, rather than the first eight bytes — the padding is
 * where the run of NULs is, and a check that only ever saw a truncated header would be tested
 * against something no linker produces.
 */
const ELF = Buffer.from([
  0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

describe('isAllowedContentType', () => {
  it('accepts the attachment types and refuses everything else', () => {
    expect(isAllowedContentType('image/png')).toBe(true);
    expect(isAllowedContentType('application/pdf')).toBe(true);
    expect(isAllowedContentType('text/html')).toBe(false);
    expect(isAllowedContentType('application/x-msdownload')).toBe(false);
  });
});

describe('contentMatchesDeclaredType', () => {
  it('accepts each allowed type when the bytes agree', () => {
    expect(contentMatchesDeclaredType(PNG, 'image/png')).toBe(true);
    expect(contentMatchesDeclaredType(JPEG, 'image/jpeg')).toBe(true);
    expect(contentMatchesDeclaredType(GIF, 'image/gif')).toBe(true);
    expect(contentMatchesDeclaredType(WEBP, 'image/webp')).toBe(true);
    expect(contentMatchesDeclaredType(PDF, 'application/pdf')).toBe(true);
    expect(contentMatchesDeclaredType(ZIP, 'application/zip')).toBe(true);
    expect(contentMatchesDeclaredType(OLE2, 'application/msword')).toBe(true);
  });

  it('treats .docx and .xlsx as the ZIP archives they are', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    expect(contentMatchesDeclaredType(ZIP, docx)).toBe(true);
    expect(contentMatchesDeclaredType(ZIP, xlsx)).toBe(true);
  });

  describe('spoofed content types', () => {
    // The whole point: `isAllowedContentType` only ever saw a string the client chose.
    it('refuses HTML sent as a PNG', () => {
      const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
      expect(isAllowedContentType('image/png')).toBe(true);
      expect(contentMatchesDeclaredType(html, 'image/png')).toBe(false);
    });

    it('refuses an executable sent as text/plain', () => {
      expect(contentMatchesDeclaredType(ELF, 'text/plain')).toBe(false);
    });

    it('refuses a PDF sent as an image, and an image sent as a PDF', () => {
      expect(contentMatchesDeclaredType(PDF, 'image/jpeg')).toBe(false);
      expect(contentMatchesDeclaredType(PNG, 'application/pdf')).toBe(false);
    });

    it('refuses a ZIP sent as a Word document, and the reverse', () => {
      expect(contentMatchesDeclaredType(ZIP, 'application/msword')).toBe(false);
      expect(contentMatchesDeclaredType(OLE2, 'application/zip')).toBe(false);
    });

    it('refuses a type that is not on the allow-list at all', () => {
      expect(contentMatchesDeclaredType(PNG, 'text/html')).toBe(false);
    });
  });

  describe('text, which has no signature', () => {
    it('accepts real text, CSV and JSON', () => {
      expect(contentMatchesDeclaredType(Buffer.from('a log line\n'), 'text/plain')).toBe(true);
      expect(contentMatchesDeclaredType(Buffer.from('id,name\n1,x\n'), 'text/csv')).toBe(true);
      expect(contentMatchesDeclaredType(Buffer.from('{"a":1}'), 'application/json')).toBe(true);
    });

    it('accepts non-ASCII text', () => {
      expect(contentMatchesDeclaredType(Buffer.from('नमस्ते, café 🙂'), 'text/plain')).toBe(true);
    });

    it('accepts an empty file rather than inventing a failure', () => {
      expect(contentMatchesDeclaredType(Buffer.alloc(0), 'text/plain')).toBe(true);
    });

    it('refuses bytes that are not text at all', () => {
      const binary = Buffer.from([0x01, 0x02, 0x00, 0x03, 0xff, 0xfe]);
      expect(contentMatchesDeclaredType(binary, 'text/plain')).toBe(false);
    });

    it('accepts a log larger than the sample, whatever the sample boundary lands on', () => {
      // The truncation bug. The check sampled the first 1 MiB by *byte* offset and round-tripped
      // it through UTF-8; a multi-byte character straddling the boundary came back re-encoded
      // with a replacement character, so the comparison failed and any UTF-8 log over a megabyte
      // was refused. The padding puts a three-byte character exactly across 1 MiB.
      const sampleBytes = 1024 * 1024;
      const head = Buffer.alloc(sampleBytes - 1, 0x61);
      const straddling = Buffer.from('नमस्ते — a log line\n', 'utf8');
      const log = Buffer.concat([head, straddling, Buffer.alloc(4096, 0x62)]);

      expect(log.length).toBeGreaterThan(sampleBytes);
      expect(contentMatchesDeclaredType(log, 'text/plain')).toBe(true);
    });

    it("accepts a UTF-16 CSV, which is what Excel's Unicode Text export writes", () => {
      // UTF-16LE spells every ASCII character as a byte and then 0x00, so the NUL rule alone
      // rejects a perfectly ordinary spreadsheet export. A byte-order mark is the file stating
      // its encoding, and is taken at its word.
      const csv = Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from('id,name\r\n1,Ashniva\r\n', 'utf16le'),
      ]);

      expect(csv.includes(0)).toBe(true);
      expect(contentMatchesDeclaredType(csv, 'text/csv')).toBe(true);
    });

    it('does not let a byte-order mark wave a binary through', () => {
      // The mark says how to read the bytes; it is not a licence to skip reading them. An ELF
      // with two bytes glued to the front is still not text, and an odd tail is not UTF-16.
      const disguised = Buffer.concat([Buffer.from([0xff, 0xfe]), ELF]);
      expect(contentMatchesDeclaredType(disguised, 'text/plain')).toBe(false);

      const oddLength = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('abc', 'latin1')]);
      expect(contentMatchesDeclaredType(oddLength, 'text/plain')).toBe(false);
    });

    it('accepts a legacy-encoded log line, which is not valid UTF-8', () => {
      // Windows-1252 `café`: a bare 0xE9. Demanding UTF-8 refused every log and CSV that came
      // out of a Windows tool, which is a product regression, not a security control — the file
      // is stored and served as an attachment with `nosniff`, never interpreted.
      const windows1252 = Buffer.from('café log\n', 'latin1');

      expect(windows1252).toContain(0xe9);
      expect(
        Buffer.compare(Buffer.from(windows1252.toString('utf8'), 'utf8'), windows1252),
      ).not.toBe(0);
      expect(contentMatchesDeclaredType(windows1252, 'text/plain')).toBe(true);
    });
  });
});

describe('sanitizeName', () => {
  it('keeps a filename and strips any path', () => {
    expect(sanitizeName('screenshot.png')).toBe('screenshot.png');
    expect(sanitizeName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeName('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
  });

  it('never returns an empty name', () => {
    expect(sanitizeName('')).toBe('file');
    expect(sanitizeName('///')).toBe('file');
  });
});

import { describe, expect, it } from 'vitest';
import {
  decodeHistoricalFile,
  historicalFileLimit,
  validateHistoricalBytes,
} from './file-validation';

function pdf(size: number): Buffer {
  const header = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';
  let padding = size - header.length - 150;
  let result: Buffer;
  do {
    const content = header + ' '.repeat(padding);
    result = Buffer.from(
      `${content}xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R /Size 1 >>\nstartxref\n${content.length}\n%%EOF\n`,
    );
    padding += size - result.length;
  } while (result.length !== size);
  return result;
}
describe('historical file validation boundaries', () => {
  it('accepts a canonical exact10MiB file without regex stack overflow and rejects the next byte', () => {
    const bytes = pdf(historicalFileLimit);
    const body = {
      filename: 'synthetic.pdf',
      mimeType: 'application/pdf',
      contentBase64: bytes.toString('base64'),
    };
    expect(decodeHistoricalFile(body).bytes.equals(bytes)).toBe(true);
    expect(() =>
      decodeHistoricalFile({
        ...body,
        contentBase64: Buffer.concat([bytes, Buffer.from(' ')]).toString(
          'base64',
        ),
      }),
    ).toThrow();
  });
  it.each(['Zg=', 'Zh==', 'Zg===', 'Z g==', 'Zg==\n', 'Zg==AAAA'])(
    'rejects noncanonical base64 %j',
    (contentBase64) => {
      expect(() =>
        decodeHistoricalFile({
          filename: 'synthetic.pdf',
          mimeType: 'application/pdf',
          contentBase64,
        }),
      ).toThrow();
    },
  );
  it('rejects malformed PDF structures and JPEG headers without a frame/scan', () => {
    for (const bytes of [
      Buffer.from('%PDF-1.4\nnot-a-pdf'),
      Buffer.from('%PDF-1.4\nstartxref\n999999\n%%EOF'),
      Buffer.from([0xff, 0xd8, 0, 0, 0xff, 0xd9]),
    ]) {
      expect(() =>
        validateHistoricalBytes(
          bytes,
          bytes[0] === 0xff ? 'image.jpg' : 'scan.pdf',
          bytes[0] === 0xff ? 'image/jpeg' : 'application/pdf',
        ),
      ).toThrow();
    }
  });
});

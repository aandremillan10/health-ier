import { describe, expect, it } from 'vitest';
import { checkJpegDimensions, decodeScan } from './scan-preview';
import { historicalFileLimit } from '../../shared/historical-documents-api';
describe('untrusted historical preview bounds', () => {
  it('rejects oversized, invalid and mismatched byte payloads before decoding', () => {
    expect(() => decodeScan('AA==', historicalFileLimit + 1)).toThrow();
    expect(() => decodeScan('url:https://example.test', 10)).toThrow();
    expect(() => decodeScan('AA==', 2)).toThrow();
    expect(decodeScan('AA==', 1)).toEqual(new Uint8Array([0]));
  });
  it('rejects decompression bombs and malformed JPEG markers before native decoding', () => {
    const image = (width: number, height: number): Uint8Array =>
      new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xc0,
        0,
        8,
        8,
        height >> 8,
        height & 255,
        width >> 8,
        width & 255,
        1,
      ]);
    expect(() => checkJpegDimensions(image(1000, 1000))).not.toThrow();
    expect(() => checkJpegDimensions(image(65535, 65535))).toThrow();
    expect(() => checkJpegDimensions(image(0, 10))).toThrow();
    expect(() =>
      checkJpegDimensions(new Uint8Array([0xff, 0xd8, 0, 0])),
    ).toThrow();
  });
});

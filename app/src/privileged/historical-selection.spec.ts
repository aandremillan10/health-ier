import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoricalSelections } from './historical-selection';
import { preflightHistoricalJpeg } from './file-picker';
const patientId = '20000000-0000-4000-8000-000000000001';
describe('historical file selection boundary', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('binds opaque selection to patient, expires it, and erases retained bytes on reset', () => {
    vi.useFakeTimers();
    const selections = new HistoricalSelections();
    const selection = selections.store(patientId, {
      filename: 'synthetic.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(Object.keys(selection).sort()).toEqual([
      'byteLength',
      'filename',
      'mimeType',
      'patientId',
      'token',
    ]);
    expect(() => selections.read('other-patient', selection.token)).toThrow();
    expect(() => selections.read(patientId, 'other-token')).toThrow();
    const held = selections.read(patientId, selection.token).bytes;
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(() => selections.read(patientId, selection.token)).toThrow();
    expect(held.every((byte) => byte === 0)).toBe(true);
    const next = selections.store(patientId, {
      filename: 'synthetic.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([4]),
    });
    const nextBytes = selections.read(patientId, next.token).bytes;
    selections.discard(selection.token);
    expect(selections.read(patientId, next.token).bytes[0]).toBe(4);
    selections.clear();
    expect(nextBytes[0]).toBe(0);
  });
  it('rejects adversarial JPEG dimensions before native decoding', () => {
    const frame = (width: number, height: number): Buffer => {
      const bytes = Buffer.from([
        0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0, 0xff, 0xda,
        0, 8, 1, 1, 0, 0, 0x3f, 0, 1, 0xff, 0xd9,
      ]);
      bytes.writeUInt16BE(height, 7);
      bytes.writeUInt16BE(width, 9);
      return bytes;
    };
    expect(preflightHistoricalJpeg(frame(100, 100))).toEqual({
      width: 100,
      height: 100,
    });
    expect(() => preflightHistoricalJpeg(frame(65535, 65535))).toThrow(
      'dimensions',
    );
    expect(() => preflightHistoricalJpeg(frame(0, 100))).toThrow('dimensions');
    const first = frame(100, 100);
    const second = frame(65535, 65535);
    expect(() =>
      preflightHistoricalJpeg(
        Buffer.concat([
          first.subarray(0, first.length - 2),
          second.subarray(2),
        ]),
      ),
    ).toThrow('Multiple');
    expect(() =>
      preflightHistoricalJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
    ).toThrow();
  });
});

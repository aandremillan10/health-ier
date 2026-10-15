import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('shipped offline English queue voice library', () => {
  it('ships precisely the fixed vocabulary with matching provenance and non-silent mono PCM samples', async () => {
    const directory = join(__dirname, 'public', 'audio', 'en');
    const expected = [
      'now-serving.wav',
      'letter-m.wav',
      'letter-d.wav',
      'letter-l.wav',
      ...Array.from({ length: 10 }, (_, digit) => `digit-${digit}.wav`),
      'medical.wav',
      'dental.wav',
      'laboratory.wav',
    ];
    expect((await readdir(directory)).sort()).toEqual(expected.sort());
    const manifest: unknown = JSON.parse(
      await readFile(join(__dirname, 'voice-manifest.json'), 'utf8'),
    );
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      !('clips' in manifest) ||
      !Array.isArray(manifest.clips)
    )
      throw new Error('Missing voice provenance');
    expect(manifest).toMatchObject({
      voice: 'Microsoft Zira Desktop',
      culture: 'en-US',
      rate: 0,
      format: {
        encoding: 'PCM',
        sampleRate: 16000,
        bitsPerSample: 16,
        channels: 1,
      },
    });
    expect(manifest.clips).toHaveLength(17);
    for (const name of expected) {
      const bytes = await readFile(join(directory, name));
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
      expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
      let samples: Buffer | undefined;
      let formatChecked = false;
      for (let offset = 12; offset + 8 <= bytes.length;) {
        const size = bytes.readUInt32LE(offset + 4);
        const end = offset + 8 + size;
        expect(end).toBeLessThanOrEqual(bytes.length);
        const kind = bytes.toString('ascii', offset, offset + 4);
        if (kind === 'fmt ') {
          expect(size).toBeGreaterThanOrEqual(16);
          expect(bytes.readUInt16LE(offset + 8)).toBe(1);
          expect(bytes.readUInt16LE(offset + 10)).toBe(1);
          expect(bytes.readUInt32LE(offset + 12)).toBe(16000);
          expect(bytes.readUInt16LE(offset + 22)).toBe(16);
          formatChecked = true;
        }
        if (kind === 'data') samples = bytes.subarray(offset + 8, end);
        offset = end + (size % 2);
      }
      expect(formatChecked).toBe(true);
      if (!samples || samples.length < 3200 || samples.length % 2 !== 0)
        throw new Error(`Missing PCM speech samples: ${name}`);
      let energy = 0;
      let peak = 0;
      for (let offset = 0; offset < samples.length; offset += 2) {
        const value = samples.readInt16LE(offset);
        energy += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      expect(Math.sqrt(energy / (samples.length / 2))).toBeGreaterThan(100);
      expect(peak).toBeGreaterThan(1000);
      expect(manifest.clips).toContainEqual(
        expect.objectContaining({
          filename: name,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        }),
      );
    }
  });
});

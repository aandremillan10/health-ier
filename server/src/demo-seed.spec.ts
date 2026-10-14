import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seedWithPrivateCredentials } from './demo-seed';
describe('private seed recovery', () => {
  it('removes this attempt file after confirmed rollback so a retry can succeed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'healthier-seed-proof-'));
    const path = join(directory, 'private.json');
    try {
      await expect(
        seedWithPrivateCredentials(
          path,
          'synthetic first attempt',
          async (): Promise<never> => {
            throw new Error('controlled rollback');
          },
          async (): Promise<boolean> => true,
        ),
      ).rejects.toThrow('controlled rollback');
      await expect(readFile(path)).rejects.toThrow();
      await seedWithPrivateCredentials(
        path,
        'synthetic successful retry',
        async (): Promise<void> => {},
        async (): Promise<boolean> => true,
      );
      expect(await readFile(path, 'utf8')).toBe('synthetic successful retry');
      await expect(
        seedWithPrivateCredentials(
          path,
          'never overwrite',
          async (): Promise<void> => {},
          async (): Promise<boolean> => true,
        ),
      ).rejects.toThrow();
      expect(await readFile(path, 'utf8')).toBe('synthetic successful retry');
    } finally {
      await rm(path, { force: true });
      await rmdir(directory);
    }
  });
  it('preserves credentials if commit outcome cannot be confirmed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'healthier-seed-proof-'));
    const path = join(directory, 'private.json');
    try {
      await expect(
        seedWithPrivateCredentials(
          path,
          'synthetic uncertain commit',
          async (): Promise<never> => {
            throw new Error('connection interrupted');
          },
          async (): Promise<never> => {
            throw new Error('database unavailable');
          },
        ),
      ).rejects.toThrow();
      expect(await readFile(path, 'utf8')).toBe('synthetic uncertain commit');
    } finally {
      await rm(path, { force: true });
      await rmdir(directory);
    }
  });
});

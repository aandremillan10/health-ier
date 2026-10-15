import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
const execute = promisify(execFile);
const shell =
  process.platform === 'win32' ? 'C:/Program Files/Git/bin/sh.exe' : 'sh';

describe('MinIO initializer fail-closed ownership checks', () => {
  it('refuses inspection faults/unknown resources before mutation and initializes/replays only confirmed absence', async () => {
    const taskTempRoot = resolve(tmpdir());
    const directory = await mkdtemp(join(taskTempRoot, 'healthier-init-test-'));
    if (
      dirname(directory) !== taskTempRoot ||
      !basename(directory).startsWith('healthier-init-test-')
    )
      throw new Error('Unexpected initializer test cleanup path');
    const script = join(directory, 'init.sh');
    const harness = join(directory, 'harness.sh');
    const mutations = join(directory, 'mutations');
    const quote = (value: string): string =>
      `'${value.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`;
    try {
      const source = await readFile(
        resolve('..', 'deploy', 'historical-minio-init.sh'),
        'utf8',
      );
      await writeFile(
        script,
        source
          .replaceAll('/state/owner', quote(join(directory, 'owner')))
          .replaceAll(
            '/tmp/attachment-policy.json',
            quote(join(directory, 'attachment-policy.json')),
          )
          .replaceAll(
            '/tmp/clinic-attachment-inspection.XXXXXX',
            quote(join(directory, 'inspection.XXXXXX')),
          ),
      );
      await writeFile(
        harness,
        `#!/bin/sh
mc() {
  if [ "$1" = alias ]; then return 0; fi
  if [ "$1" = --json ]; then
    shift
    case "$1:$2" in ls:*) code=NoSuchBucket; target=bucket ;; admin:user) code=XMinioAdminNoSuchUser; target=user ;; admin:policy) code=XMinioAdminNoSuchPolicy; target=policy ;; *) return 2 ;; esac
    if [ "$CASE" = existing ] || [ "$CASE" = "existing-$target" ]; then printf '%s\\n' '{"status":"success","key":"clinic-historical-scans/"}'; return 0; fi
    if [ "$CASE" = network ] || [ "$CASE" = "network-$target" ]; then code=RequestTimeout; fi
    if [ "$CASE" = auth ]; then code=AccessDenied; fi
    if [ "$CASE" = malformed ]; then printf '%s\\n' 'private malformed output'; return 1; fi
    if [ "$target" = bucket ] && [ "$code" = NoSuchBucket ]; then return 0; fi
    printf '{"status":"error","error":{"cause":{"error":{"Code":"%s"}}}}\\n' "$code"
    return 1
  fi
  case "$1:$2" in stat:*|admin:user|admin:policy)
    if [ -f ${quote(join(directory, 'owner'))} ]; then return 0; fi ;;
  esac
  printf '%s\\n' mutation >>${quote(mutations)}
  return 0
}
. ${quote(script)}
`,
      );
      const environment = {
        ...process.env,
        MINIO_ROOT_USER: 'synthetic-admin',
        MINIO_ROOT_PASSWORD: 'synthetic-administrator-secret',
        HISTORICAL_S3_ACCESS_KEY: 'synthetic-app',
        HISTORICAL_S3_SECRET_KEY: 'synthetic-application-secret',
      };
      for (const fault of [
        'network',
        'network-user',
        'network-policy',
        'auth',
        'existing',
        'existing-user',
        'existing-policy',
        'malformed',
      ]) {
        await expect(
          execute(shell, [harness], {
            env: { ...environment, CASE: fault },
            windowsHide: true,
          }),
        ).rejects.toThrow();
        await expect(readFile(mutations)).rejects.toThrow();
      }
      await execute(shell, [harness], {
        env: { ...environment, CASE: 'absent' },
        windowsHide: true,
      });
      const firstMutations = await readFile(mutations, 'utf8');
      expect(firstMutations).not.toBe('');
      await execute(shell, [harness], {
        env: { ...environment, CASE: 'absent' },
        windowsHide: true,
      });
      expect(await readFile(mutations, 'utf8')).toBe(firstMutations);
      expect(await readFile(join(directory, 'owner'), 'utf8')).not.toContain(
        environment.HISTORICAL_S3_SECRET_KEY,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 15000);
});

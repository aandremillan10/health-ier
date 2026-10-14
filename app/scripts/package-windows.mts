import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { builtinModules, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

assert.equal(
  process.platform,
  'win32',
  'The portable ZIP command requires Windows',
);
const run = promisify(execFile);
const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(appDirectory, '..');
const metadata = JSON.parse(
  await readFile(join(appDirectory, 'package.json'), 'utf8'),
) as {
  version: string;
  main: string;
  dependencies: Record<string, string>;
  devDependencies: { electron: string };
};
const output = join(
  appDirectory,
  'dist/windows',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
const stage = await mkdtemp(join(tmpdir(), 'healthier-windows-'));
function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const target = join(directory, entry.name);
      return entry.isDirectory() ? files(target) : [target];
    }),
  );
  return nested.flat();
}
try {
  await mkdir(output, { recursive: true });
  for (const part of ['main', 'preload', 'renderer'])
    await cp(join(appDirectory, 'out', part), join(stage, 'out', part), {
      recursive: true,
    });
  const compiled = await files(join(stage, 'out'));
  assert.ok(
    compiled.some((file) => /header-.*\.jpg$/.test(file)),
    'Missing print header asset',
  );
  for (const file of compiled) {
    const relative = file.slice(stage.length + 1).replaceAll('\\', '/');
    assert.ok(
      !relative
        .split('/')
        .some((part) => /^\.env/i.test(part) || part === '.private') &&
        !/\.(map|ts|tsx|mts)$/.test(file),
      `Unexpected compiled file: ${file}`,
    );
    if (!file.endsWith('.cjs')) continue;
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const module = match[1];
      assert.ok(
        module === 'electron' ||
          builtinModules.includes(module.replace(/^node:/, '')),
        `Unbundled runtime dependency: ${module}`,
      );
    }
  }
  await writeFile(
    join(stage, 'package.json'),
    JSON.stringify(
      {
        name: 'amlig',
        productName: 'AMLIG',
        version: metadata.version,
        description: 'AMLIG clinic desktop client',
        main: metadata.main,
      },
      null,
      2,
    ) + '\n',
  );
  const notices = join(stage, 'notices');
  await mkdir(notices);
  await cp(
    join(appDirectory, 'src/renderer/components/ui/UIARC-LICENSE.txt'),
    join(notices, 'UIARC-LICENSE.txt'),
  );
  const seen = new Set<string>();
  async function license(name: string, from: string): Promise<void> {
    const require = createRequire(join(from, 'package.json'));
    let directory = dirname(require.resolve(name));
    while (true) {
      try {
        const value = JSON.parse(
          await readFile(join(directory, 'package.json'), 'utf8'),
        ) as {
          name: string;
          version: string;
          dependencies?: Record<string, string>;
        };
        if (value.name === name) {
          if (seen.has(`${name}@${value.version}`)) return;
          seen.add(`${name}@${value.version}`);
          const names = await readdir(directory);
          const notice = names.find((entry) =>
            /^licen[cs]e(?:\..*)?$/i.test(entry),
          );
          assert.ok(notice, `Missing license for ${name}`);
          await cp(
            join(directory, notice),
            join(notices, `${name.replace(/[@/]/g, '_')}-${value.version}.txt`),
          );
          for (const dependency of Object.keys(value.dependencies ?? {}))
            await license(dependency, directory);
          return;
        }
      } catch (error: unknown) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
      }
      assert.notEqual(
        directory,
        dirname(directory),
        `Cannot locate package metadata for ${name}`,
      );
      directory = dirname(directory);
    }
  }
  for (const name of [...Object.keys(metadata.dependencies), 'tailwindcss'])
    await license(name, appDirectory);
  const provenance = {
    sourceCommit: (
      await run('git', ['rev-parse', 'HEAD'], { cwd: repository })
    ).stdout.trim(),
    sourceTree: (
      await run('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repository })
    ).stdout.trim(),
    sourceStatus: (
      await run('git', ['status', '--porcelain'], { cwd: repository })
    ).stdout.trim(),
    electron: metadata.devDependencies.electron,
    lockfileSha256: sha256(await readFile(join(repository, 'pnpm-lock.yaml'))),
    compiled: Object.fromEntries(
      await Promise.all(
        compiled.map(async (file): Promise<[string, string]> => [
          file.slice(stage.length + 1).replaceAll('\\', '/'),
          sha256(await readFile(file)),
        ]),
      ),
    ),
  };
  await writeFile(
    join(stage, 'build-info.json'),
    JSON.stringify(provenance, null, 2) + '\n',
  );
  const packages = await packager({
    dir: stage,
    out: output,
    name: 'AMLIG',
    platform: 'win32',
    arch: 'x64',
    electronVersion: metadata.devDependencies.electron,
    appVersion: metadata.version,
    executableName: 'AMLIG',
    asar: false,
    prune: false,
    overwrite: false,
    win32metadata: {
      CompanyName: 'AMLIG',
      FileDescription: 'AMLIG clinic desktop client',
      ProductName: 'AMLIG',
    },
  });
  assert.equal(packages.length, 1);
  const folder = packages[0];
  const packagedFiles = await files(join(folder, 'resources/app'));
  for (const file of packagedFiles) {
    const relative = file
      .slice(join(folder, 'resources/app').length + 1)
      .replaceAll('\\', '/');
    assert.ok(
      relative.startsWith('out/') ||
        relative.startsWith('notices/') ||
        ['package.json', 'build-info.json'].includes(relative),
      `Unexpected package content: ${relative}`,
    );
  }
  for (const required of [
    'AMLIG.exe',
    'LICENSE',
    'LICENSES.chromium.html',
    'resources/app/out/preload/index.cjs',
    'resources/app/out/renderer/index.html',
  ])
    assert.ok(
      (await readFile(join(folder, required))).length > 0,
      `Missing packaged file: ${required}`,
    );
  const archive = join(output, `${basename(folder)}.zip`);
  await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Compress-Archive -LiteralPath $env:AMLIG_PACKAGE_FOLDER -DestinationPath $env:AMLIG_PACKAGE_ZIP -CompressionLevel Optimal',
    ],
    {
      env: {
        ...process.env,
        AMLIG_PACKAGE_FOLDER: folder,
        AMLIG_PACKAGE_ZIP: archive,
      },
    },
  );
  await writeFile(
    `${archive}.sha256`,
    `${sha256(await readFile(archive))}  ${basename(archive)}\n`,
  );
  console.log(
    `Portable folder: ${folder}\nZIP: ${archive}\nSHA256: ${archive}.sha256`,
  );
} finally {
  assert.equal(dirname(stage), resolve(tmpdir()));
  assert.ok(basename(stage).startsWith('healthier-windows-'));
  await rm(stage, { recursive: true, force: true });
}

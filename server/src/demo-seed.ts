import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService } from './database/database.service';
import { hashPassword } from './auth';
import { enqueue } from './database/outbox';
import { serverMode } from './config';
import type { Role } from './mirror-contract';

const accounts = [
  {
    username: 'demo.doctor.head',
    displayName: 'Dr. Synthetic Head',
    role: 'doctor',
    isHead: true,
  },
  {
    username: 'demo.doctor',
    displayName: 'Dr. Synthetic Doctor',
    role: 'doctor',
    isHead: false,
  },
  {
    username: 'demo.dentist.one',
    displayName: 'Dr. Synthetic Dentist One',
    role: 'dentist',
    isHead: false,
  },
  {
    username: 'demo.dentist.two',
    displayName: 'Dr. Synthetic Dentist Two',
    role: 'dentist',
    isHead: false,
  },
  {
    username: 'demo.medtech.one',
    displayName: 'Synthetic Medtech One',
    role: 'medtech',
    isHead: false,
  },
  {
    username: 'demo.medtech.two',
    displayName: 'Synthetic Medtech Two',
    role: 'medtech',
    isHead: false,
  },
  {
    username: 'demo.attendant',
    displayName: 'Synthetic Nursing Attendant',
    role: 'attendant',
    isHead: false,
  },
  {
    username: 'demo.clerk',
    displayName: 'Synthetic Clerk',
    role: 'clerk',
    isHead: false,
  },
] as const satisfies readonly {
  username: string;
  displayName: string;
  role: Role;
  isHead: boolean;
}[];

export function assertSyntheticDatabase(value: string | undefined): void {
  if (!value) throw new Error('DATABASE_URL required');
  const url = new URL(value);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/healthier_demo_[a-z0-9_]+$/.test(url.pathname) ||
    serverMode() !== 'EDGE'
  )
    throw new Error(
      'Seed/reset requires a dedicated loopback healthier_demo_* EDGE database.',
    );
}
export async function seedWithPrivateCredentials<T>(
  path: string,
  content: string,
  action: () => Promise<T>,
  rollbackConfirmed: () => Promise<boolean>,
): Promise<T> {
  await writeFile(path, content, { mode: 0o600, flag: 'wx' });
  try {
    return await action();
  } catch (error: unknown) {
    // An uncertain commit keeps credentials; remove only this attempt's file after confirmed rollback.
    if (await rollbackConfirmed().catch(() => false)) await rm(path);
    throw error;
  }
}
async function seed(): Promise<void> {
  assertSyntheticDatabase(process.env.DATABASE_URL);
  const db = new DatabaseService();
  const privatePath = resolve(
    process.env.DEMO_CREDENTIALS_FILE ?? '../.private/demo-credentials.json',
  );
  try {
    if ((await db.staff.count()) > 0) {
      const existing = await db.staff.findMany({
        orderBy: { username: 'asc' },
      });
      if (
        existing.length !== 8 ||
        accounts.some(
          (account) =>
            !existing.some(
              (staff) =>
                staff.username === account.username &&
                staff.role === account.role &&
                staff.isHead === account.isHead &&
                staff.displayName === account.displayName,
            ),
        )
      )
        throw new Error(
          'Existing accounts differ from the approved synthetic seed.',
        );
      await readFile(privatePath);
      console.log(
        `Existing seed preserved; private credentials: ${privatePath}`,
      );
      return;
    }
    const credentials = accounts.map((account) => ({
      ...account,
      password: randomBytes(24).toString('base64url'),
    }));
    await mkdir(resolve(privatePath, '..'), { recursive: true });
    // Write credentials before committing accounts so a filesystem failure cannot strand users.
    await seedWithPrivateCredentials(
      privatePath,
      JSON.stringify({ accounts: credentials }, null, 2),
      () =>
        db.$transaction(async (tx) => {
          const timestamp = new Date('2026-10-14T00:00:00.000Z');
          const staff = [];
          for (let index = 0; index < credentials.length; index++) {
            const account = credentials[index];
            const record = await tx.staff.create({
              data: {
                id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
                username: account.username,
                passwordHash: hashPassword(account.password),
                displayName: account.displayName,
                role: account.role,
                isHead: account.isHead,
                licenseText:
                  account.role === 'doctor' ? 'SYNTHETIC-LICENSE' : null,
                ptrText: account.role === 'doctor' ? 'SYNTHETIC-PTR' : null,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            });
            staff.push(record);
            await enqueue(tx, 'staff', record);
          }
          const patient = await tx.patient.create({
            data: {
              id: '20000000-0000-4000-8000-000000000001',
              fullName: 'Synthetic Authorization Patient',
              sex: 'unknown',
              patientCategory: 'other',
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          });
          await enqueue(tx, 'patient', patient);
          for (const [index, discipline, author] of [
            [1, 'dental', staff[2]],
            [2, 'laboratory', staff[4]],
          ] as const) {
            const entry = await tx.entry.create({
              data: {
                id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                patientId: patient.id,
                authorId: author.id,
                discipline,
                text: `Synthetic isolated ${discipline} proof only.`,
                status: 'draft',
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            });
            await enqueue(tx, 'entry', entry);
          }
        }),
      async () => (await db.staff.count()) === 0,
    );
    console.log(
      `Seeded eight synthetic accounts; private credentials: ${privatePath}`,
    );
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module)
  void seed().catch(() => {
    console.error(
      'Synthetic seed failed. Check the dedicated database and private credential file.',
    );
    process.exitCode = 1;
  });

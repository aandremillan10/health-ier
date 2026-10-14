import 'dotenv/config';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService } from './database/database.service';
import { assertSyntheticDatabase } from './demo-seed';
async function reset(): Promise<void> {
  assertSyntheticDatabase(process.env.DATABASE_URL);
  if (!process.argv.includes('--reset-synthetic-demo'))
    throw new Error('Explicit --reset-synthetic-demo required.');
  const db = new DatabaseService();
  try {
    await db.$executeRaw`TRUNCATE "Session", "Staff", "Patient", "Vitals", "Entry", "Correction", "Document", "Outbox", "MirrorEntity", "MirrorVersion", "MirrorReceipt", "MirrorState" CASCADE`;
    await rm(
      resolve(
        process.env.DEMO_CREDENTIALS_FILE ??
          '../.private/demo-credentials.json',
      ),
      { force: true },
    );
    console.log('Dedicated synthetic demo records reset. Run demo:seed next.');
  } finally {
    await db.$disconnect();
  }
}
void reset().catch(() => {
  console.error(
    'Reset refused or failed. Only a dedicated loopback healthier_demo_* EDGE database is allowed.',
  );
  process.exitCode = 1;
});

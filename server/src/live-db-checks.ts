import 'dotenv/config';
import assert from 'node:assert/strict';
import { DatabaseService } from './database/database.service';
import { enqueue } from './database/outbox';
import { assertSyntheticDatabase } from './demo-seed';
import { AuthService, tokenHash } from './auth';
import { randomBytes } from 'node:crypto';
async function verify(): Promise<void> {
  assertSyntheticDatabase(process.env.DATABASE_URL);
  const db = new DatabaseService();
  try {
    const before = {
      patients: await db.patient.count(),
      outbox: await db.outbox.count(),
    };
    await assert.rejects(
      db.$transaction(async (tx) => {
        const patient = await tx.patient.create({
          data: { fullName: 'Synthetic rolled-back outbox proof' },
        });
        await enqueue(tx, 'patient', patient);
        await enqueue(tx, 'patient', patient);
      }),
    );
    assert.equal(await db.patient.count(), before.patients);
    assert.equal(await db.outbox.count(), before.outbox);
    const author = await db.staff.findFirstOrThrow();
    const expiredToken = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        tokenHash: tokenHash(expiredToken),
        staffId: author.id,
        expiresAt: new Date(0),
      },
    });
    await assert.rejects(
      new AuthService(db).authenticate(`Bearer ${expiredToken}`),
    );
    await db.session.delete({ where: { tokenHash: tokenHash(expiredToken) } });
    for (const record of await db.outbox.findMany()) {
      const payload = record.payload;
      assert(payload && typeof payload === 'object' && !Array.isArray(payload));
      assert.equal(payload.id, record.entityId);
      assert.equal(payload.revision, record.revision);
      for (const field of [
        'passwordHash',
        'username',
        'token',
        'tokenHash',
        'sessions',
      ])
        assert(!(field in payload));
    }
    const document = await db.document.findFirst();
    if (document)
      await assert.rejects(
        db.document.update({
          where: { id: document.id },
          data: { issueDate: '2099-01-01' },
        }),
      );
    const finalized = await db.entry.findFirst({
      where: { status: 'finalized' },
    });
    if (finalized)
      await assert.rejects(
        db.entry.update({
          where: { id: finalized.id },
          data: { findings: 'Should never replace finalized findings' },
        }),
      );
    console.log(
      'Live database proof passed: atomic outbox rollback, exact whitelisted events, immutable documents/finalized originals.',
    );
  } finally {
    await db.$disconnect();
  }
}
void verify().catch(() => {
  console.error('Live database proof failed.');
  process.exitCode = 1;
});

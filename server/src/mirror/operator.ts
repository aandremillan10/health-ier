import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { DatabaseService } from '../database/database.service';
import { MirrorService } from './mirror.service';
import { httpsTransport, httpsHistoricalTransport } from './mirror.worker';
import { object, parseBatch, digest } from './validation';
async function main(): Promise<void> {
  const db = new DatabaseService();
  const mode = process.argv[2];
  try {
    const mirror = new MirrorService(db);
    if (mode === 'bootstrap') await mirror.bootstrap();
    if (mode === 'deliver') {
      for (let iteration = 0; iteration < 100; iteration++) {
        const status = await mirror.status();
        if (!status.pending) break;
        await mirror.deliver(httpsTransport, httpsHistoricalTransport);
        if ((await mirror.status()).lastError === 'DELIVERY_UNAVAILABLE')
          throw new Error('DELIVERY_UNAVAILABLE');
      }
      if ((await mirror.status()).pending) throw new Error('PENDING_DELIVERY');
    }
    if (mode === 'inspect') {
      const versions = await db.mirrorVersion.findMany({
        select: {
          entityType: true,
          entityId: true,
          revision: true,
          hash: true,
        },
      });
      const latest = await db.mirrorEntity.findMany({
        select: {
          entityType: true,
          entityId: true,
          revision: true,
          hash: true,
        },
      });
      console.log(
        JSON.stringify({
          staffAuthenticationRows: await db.staff.count(),
          sessionRows: await db.session.count(),
          receiptCount: await db.mirrorReceipt.count(),
          versions,
          latest,
        }),
      );
      return;
    }
    if (mode === 'validate-edge' || mode === 'compare') {
      const rows = await db.outbox.findMany({
        where: { clinicId: process.env.CLINIC_ID ?? 'synthetic-clinic' },
      });
      const counts: Record<string, number> = {};
      const cloud =
        mode === 'compare'
          ? object(
              JSON.parse(
                readFileSync(process.argv[3], 'utf8').replace(/^\uFEFF/, ''),
              ) as unknown,
            )
          : undefined;
      const versions =
        cloud && Array.isArray(cloud.versions)
          ? cloud.versions.map(object)
          : [];
      const latest =
        cloud && Array.isArray(cloud.latest) ? cloud.latest.map(object) : [];
      let compared = 0;
      for (const row of rows) {
        const event = {
          eventId: row.eventId,
          clinicId: row.clinicId,
          schemaVersion: row.schemaVersion,
          entityType: row.entityType,
          entityId: row.entityId,
          revision: row.revision,
          operation: row.operation,
          payload: row.payload,
        };
        parseBatch({ clinicId: row.clinicId, events: [event] }, row.clinicId);
        counts[row.entityType] = (counts[row.entityType] ?? 0) + 1;
        if (cloud && row.acknowledgedAt) {
          if (
            !versions.some(
              (version) =>
                version.entityType === row.entityType &&
                version.entityId === row.entityId &&
                version.revision === row.revision &&
                version.hash === digest(row.payload),
            )
          )
            throw new Error('VERSION_COMPARISON_FAILED');
          compared++;
        }
      }
      if (
        cloud &&
        (cloud.staffAuthenticationRows !== 0 || cloud.sessionRows !== 0)
      )
        throw new Error('CLOUD_AUTHORITY_PRESENT');
      if (cloud) {
        for (const row of rows)
          if (
            !rows.some(
              (other) =>
                other.entityType === row.entityType &&
                other.entityId === row.entityId &&
                other.revision > row.revision,
            )
          ) {
            if (
              !latest.some(
                (record) =>
                  record.entityType === row.entityType &&
                  record.entityId === row.entityId &&
                  record.revision === row.revision &&
                  record.hash === digest(row.payload),
              )
            )
              throw new Error('LATEST_COMPARISON_FAILED');
          }
      }
      console.log(
        JSON.stringify({
          validated: rows.length,
          entityVersions: counts,
          ...(cloud ? { compared, cloudAuthenticationRows: 0 } : {}),
        }),
      );
      return;
    }
    if (!['status', 'bootstrap', 'deliver'].includes(mode))
      throw new Error('INVALID_OPERATOR_COMMAND');
    console.log(JSON.stringify(await mirror.status()));
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Mirror operator command failed; inspect safe mirror status and configuration.',
  );
  process.exitCode = 1;
});

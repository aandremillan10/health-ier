import type { Prisma } from '../generated/prisma/client';
import { clinicId } from '../config';
import { EntityType, snapshot } from '../mirror-contract';
export async function enqueue(
  tx: Prisma.TransactionClient,
  entityType: EntityType,
  record: { id: string; revision: number },
): Promise<void> {
  await tx.outbox.create({
    data: {
      clinicId: clinicId(),
      entityType,
      entityId: record.id,
      revision: record.revision,
      payload: snapshot(entityType, record),
    },
  });
}

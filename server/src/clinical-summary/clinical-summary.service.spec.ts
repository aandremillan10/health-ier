import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service';
import type { Principal } from '../mirror-contract';
import { ClinicalSummaryService } from './clinical-summary.service';

const patientId = '24000000-0000-4000-8000-000000000001';
const itemId = '34000000-0000-4000-8000-000000000001';
const doctor: Principal = {
  id: '14000000-0000-4000-8000-000000000001',
  displayName: 'Synthetic Doctor',
  role: 'doctor',
  isHead: false,
};

function database(overrides: Record<string, unknown> = {}): DatabaseService {
  return {
    patient: { findUnique: vi.fn().mockResolvedValue({ id: patientId }) },
    clinicalSummaryItem: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    clinicalSummaryRevision: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as DatabaseService;
}

async function statusOf(
  action: () => Promise<unknown>,
): Promise<number | null> {
  try {
    await action();
    return null;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : 500;
  }
}

describe('ClinicalSummaryService reduced fields', () => {
  it('returns legacy items with only active fields and omits immunizations', async () => {
    const allergy = {
      id: itemId,
      patientId,
      authorId: doctor.id,
      kind: 'allergy',
      content: {
        kind: 'allergy',
        substance: 'Synthetic pollen',
        reaction: 'Retired reaction',
        severity: 'moderate',
        onsetDate: null,
      },
      source: 'Synthetic report',
      notes: null,
      status: 'active',
      revision: 1,
      createdAt: new Date('2026-10-15T08:00:00Z'),
      updatedAt: new Date('2026-10-15T08:00:00Z'),
      author: { displayName: doctor.displayName },
    };
    const immunization = {
      ...allergy,
      id: '34000000-0000-4000-8000-000000000002',
      kind: 'immunization',
      content: {
        kind: 'immunization',
        name: 'Retired vaccine',
        administeredOn: '2026-10-01',
        lotNumber: null,
        nextDueOn: null,
      },
    };
    const service = new ClinicalSummaryService(
      database({
        clinicalSummaryItem: {
          findMany: vi.fn((args: { where: { kind: { in: string[] } } }) =>
            Promise.resolve(
              [allergy, immunization].filter(({ kind }) =>
                args.where.kind.in.includes(kind),
              ),
            ),
          ),
        },
      }),
    );

    const summary = await service.read(doctor, patientId);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].content).toEqual({
      kind: 'allergy',
      substance: 'Synthetic pollen',
    });
  });

  it('projects legacy fields from history and hides immunization history', async () => {
    const revision = {
      id: '44000000-0000-4000-8000-000000000001',
      itemId,
      authorId: doctor.id,
      revision: 1,
      action: 'create',
      reason: null,
      snapshot: {
        content: {
          kind: 'allergy',
          substance: 'Synthetic pollen',
          reaction: 'Retired reaction',
          severity: 'moderate',
          onsetDate: null,
        },
        source: 'Synthetic report',
        notes: null,
        status: 'active',
      },
      createdAt: new Date('2026-10-15T08:00:00Z'),
      author: { displayName: doctor.displayName },
    };
    const db = database({
      clinicalSummaryItem: {
        findUnique: vi.fn().mockResolvedValue({ id: itemId, kind: 'allergy' }),
      },
      clinicalSummaryRevision: {
        findMany: vi.fn().mockResolvedValue([revision]),
      },
    });

    const history = await new ClinicalSummaryService(db).history(
      doctor,
      itemId,
    );

    expect(history[0].snapshot.content).toEqual({
      kind: 'allergy',
      substance: 'Synthetic pollen',
    });

    const hiddenDb = database({
      clinicalSummaryItem: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: itemId, kind: 'immunization' }),
      },
    });
    expect(
      await statusOf(() =>
        new ClinicalSummaryService(hiddenDb).history(doctor, itemId),
      ),
    ).toBe(404);
  });

  it('rejects retired fields and immunization writes', async () => {
    const service = new ClinicalSummaryService(database());
    const retiredAllergy = {
      content: {
        kind: 'allergy',
        substance: 'Synthetic pollen',
        reaction: 'Rash',
        severity: 'mild',
        onsetDate: null,
      },
      source: 'Synthetic report',
      notes: null,
    };
    const immunization = {
      content: {
        kind: 'immunization',
        name: 'Retired vaccine',
        administeredOn: '2026-10-01',
        lotNumber: null,
        nextDueOn: null,
      },
      source: 'Synthetic record',
      notes: null,
    };

    expect(
      await statusOf(() => service.create(doctor, patientId, retiredAllergy)),
    ).toBe(400);
    expect(
      await statusOf(() => service.create(doctor, patientId, immunization)),
    ).toBe(400);
  });
});

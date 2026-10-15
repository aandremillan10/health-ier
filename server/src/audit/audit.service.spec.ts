import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service';
import type { Principal } from '../mirror-contract';
import {
  AuditService,
  recordAudit,
  setAuditWorkstation,
} from './audit.service';

const actorId = '10000000-0000-4000-8000-000000000001';
const patientId = '20000000-0000-4000-8000-000000000001';
const resourceId = '30000000-0000-4000-8000-000000000001';
const staff = {
  id: actorId,
  displayName: 'Synthetic doctor',
  role: 'doctor',
  isHead: false,
} satisfies Principal;

async function setup(): Promise<{
  service: AuditService;
  database: DatabaseService;
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  actors: ReturnType<typeof vi.fn>;
  findDocument: ReturnType<typeof vi.fn>;
}> {
  const create = vi.fn().mockResolvedValue({});
  const findMany = vi.fn().mockResolvedValue([]);
  const actors = vi.fn().mockResolvedValue([]);
  const findDocument = vi.fn().mockResolvedValue({ id: resourceId, patientId });
  const module = await Test.createTestingModule({
    providers: [
      AuditService,
      {
        provide: DatabaseService,
        useValue: {
          auditEvent: { create, findMany },
          staff: { findMany: actors },
          document: { findUnique: findDocument },
        },
      },
    ],
  }).compile();
  return {
    service: module.get(AuditService),
    database: module.get(DatabaseService),
    create,
    findMany,
    actors,
    findDocument,
  };
}

describe('audit metadata and access boundaries', () => {
  it('persists only traceability fields even when caller objects contain secrets and clinical contents', async () => {
    const { database, create } = await setup();
    const privateStaff = {
      ...staff,
      passwordHash: 'synthetic-secret-hash',
      token: 'synthetic-secret-token',
    };
    const input = {
      action: 'correction' as const,
      patientId,
      resourceType: 'entry',
      resourceId,
      clinicalNote: 'synthetic-private-note',
      contentBase64: 'synthetic-private-file',
      password: 'synthetic-secret-password',
    };
    setAuditWorkstation(privateStaff, '192.0.2.15');
    await recordAudit(database, privateStaff, input);
    expect(create).toHaveBeenCalledExactlyOnceWith({
      data: {
        actorId,
        actorName: staff.displayName,
        actorRole: 'doctor',
        action: 'correction',
        patientId,
        resourceType: 'entry',
        resourceId,
        outcome: 'success',
        source: 'clinic-api',
        workstation: '192.0.2.15',
      },
    });
    const serialized = JSON.stringify(create.mock.calls);
    for (const forbidden of [
      privateStaff.passwordHash,
      privateStaff.token,
      input.clinicalNote,
      input.contentBase64,
      input.password,
    ])
      expect(serialized).not.toContain(forbidden);
  });

  it.each(['doctor', 'dentist', 'medtech', 'attendant', 'clerk'] as const)(
    'denies both audit endpoints to an ordinary %s before querying data',
    async (role) => {
      const { service, findMany, actors } = await setup();
      const ordinary = { ...staff, role };
      await expect(
        service.list(ordinary, { from: '2026-10-01', to: '2026-10-15' }),
      ).rejects.toThrow('Only the clinic head');
      await expect(service.actors(ordinary)).rejects.toThrow(
        'Only the clinic head',
      );
      expect(findMany).not.toHaveBeenCalled();
      expect(actors).not.toHaveBeenCalled();
    },
  );

  it('combines validated filters and returns a bounded stable cursor page', async () => {
    const { service, findMany } = await setup();
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    }));
    findMany.mockResolvedValue(rows);
    const page = await service.list(
      { ...staff, isHead: true },
      {
        from: '2026-10-01',
        to: '2026-10-15',
        actorId,
        patientId,
        resourceId,
        action: 'correction',
        cursor: resourceId,
      },
    );
    expect(findMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        createdAt: {
          gte: new Date('2026-09-30T16:00:00Z'),
          lt: new Date('2026-10-15T16:00:00Z'),
        },
        actorId,
        patientId,
        resourceId,
        action: 'correction',
      },
      take: 51,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: { id: resourceId },
      skip: 1,
    });
    expect(page).toEqual({
      events: rows.slice(0, 50),
      nextCursor: rows[49].id,
    });
  });

  it.each([
    { actorId: 'invalid' },
    { patientId: 'invalid' },
    { resourceId: 'invalid' },
    { cursor: 'invalid' },
    { action: 'delete' },
    { password: 'synthetic-secret' },
  ])(
    'rejects invalid or unexpected filters before querying: %j',
    async (query) => {
      const { service, findMany } = await setup();
      await expect(
        service.list(
          { ...staff, isHead: true },
          { from: '2026-10-01', to: '2026-10-15', ...query },
        ),
      ).rejects.toThrow();
      expect(findMany).not.toHaveBeenCalled();
    },
  );

  it.each(['success', 'failure'] as const)(
    'attributes a %s print outcome to the authorized document and actor',
    async (outcome) => {
      const { service, create } = await setup();
      await expect(
        service.print(staff, { documentId: resourceId, outcome }),
      ).resolves.toEqual({ recorded: true });
      expect(create).toHaveBeenCalledExactlyOnceWith({
        data: {
          actorId,
          actorName: staff.displayName,
          actorRole: 'doctor',
          action: 'print',
          resourceType: 'document',
          resourceId,
          patientId,
          outcome,
          source: 'desktop-print',
          workstation: undefined,
        },
      });
    },
  );

  it('denies forbidden, unavailable and forged print events without writing an event', async () => {
    const { service, create, findDocument } = await setup();
    await expect(
      service.print(
        { ...staff, role: 'clerk' },
        {
          documentId: resourceId,
          outcome: 'success',
        },
      ),
    ).rejects.toThrow('cannot print');
    expect(findDocument).not.toHaveBeenCalled();
    findDocument.mockResolvedValue(null);
    await expect(
      service.print(staff, { documentId: resourceId, outcome: 'success' }),
    ).rejects.toThrow('unavailable');
    await expect(
      service.print(staff, {
        documentId: resourceId,
        outcome: 'success',
        actorId: patientId,
      }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});

import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { Principal } from '../mirror-contract';
import { DatabaseService } from '../database/database.service';
import { clinicRange } from '../clinic-dates';
import { fail } from '../errors';
import { object, text, uuid } from '../validation';

export type AuditAction =
  | 'view'
  | 'create'
  | 'change'
  | 'finalize'
  | 'correction'
  | 'import'
  | 'export'
  | 'print';
export interface AuditInput {
  action: AuditAction;
  patientId?: string;
  resourceType: string;
  resourceId?: string;
  outcome?: 'success' | 'failure';
  source?: 'clinic-api' | 'desktop-print';
  workstation?: string;
}

const workstations = new WeakMap<Principal, string>();

export function setAuditWorkstation(
  staff: Principal,
  workstation?: string,
): void {
  if (workstation) workstations.set(staff, workstation.slice(0, 64));
}

export async function recordAudit(
  tx: Prisma.TransactionClient,
  staff: Principal,
  input: AuditInput,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: staff.id,
      actorName: staff.displayName,
      actorRole: staff.role,
      action: input.action,
      patientId: input.patientId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: input.outcome ?? 'success',
      source: input.source ?? 'clinic-api',
      workstation: input.workstation ?? workstations.get(staff),
    },
  });
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}
  private authorize(staff: Principal): void {
    if (!staff.isHead)
      fail(
        403,
        'FORBIDDEN',
        'Only the clinic head can review the audit trail.',
      );
  }
  async actors(
    staff: Principal,
  ): Promise<{ id: string; displayName: string }[]> {
    this.authorize(staff);
    return this.db.staff.findMany({
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
      take: 100,
    });
  }
  async list(
    staff: Principal,
    query: unknown,
  ): Promise<{ events: unknown[]; nextCursor: string | null }> {
    this.authorize(staff);
    const input = object(query, [
      'from',
      'to',
      'actorId',
      'patientId',
      'resourceId',
      'action',
      'cursor',
    ]);
    const { gte, lt } = clinicRange(input.from, input.to);
    const where: Prisma.AuditEventWhereInput = { createdAt: { gte, lt } };
    for (const field of ['actorId', 'patientId', 'resourceId'] as const) {
      if (input[field] !== undefined && input[field] !== '')
        where[field] = uuid(input[field], field);
    }
    if (input.action !== undefined && input.action !== '') {
      const action = text(input.action, 'action', true, 30)!;
      if (
        ![
          'view',
          'create',
          'change',
          'finalize',
          'correction',
          'import',
          'export',
          'print',
        ].includes(action)
      )
        fail(400, 'VALIDATION', 'Select an available audit action.');
      where.action = action;
    }
    const cursor = input.cursor ? uuid(input.cursor, 'cursor') : undefined;
    const rows = await this.db.auditEvent.findMany({
      where,
      take: 51,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      events: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  }
  async print(staff: Principal, input: unknown): Promise<{ recorded: true }> {
    const body = object(input, ['documentId', 'outcome']);
    const documentId = uuid(body.documentId, 'documentId');
    if (body.outcome !== 'success' && body.outcome !== 'failure')
      fail(400, 'VALIDATION', 'Invalid print outcome.');
    if (!staff.isHead && staff.role !== 'doctor')
      fail(403, 'FORBIDDEN', 'Your account cannot print medical documents.');
    const document = await this.db.document.findUnique({
      where: { id: documentId },
      select: { id: true, patientId: true },
    });
    if (!document) fail(404, 'NOT_FOUND', 'Document unavailable.');
    await recordAudit(this.db, staff, {
      action: 'print',
      resourceType: 'document',
      resourceId: document.id,
      patientId: document.patientId,
      outcome: body.outcome,
      source: 'desktop-print',
    });
    return { recorded: true };
  }
}

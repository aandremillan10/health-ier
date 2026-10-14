import type { Prisma } from './generated/prisma/client';
export const entityTypes = [
  'staff',
  'patient',
  'vitals',
  'entry',
  'correction',
  'document',
] as const;
export type EntityType = (typeof entityTypes)[number];
export type Role = 'doctor' | 'dentist' | 'medtech' | 'attendant' | 'clerk';
export type Discipline = 'medical' | 'dental' | 'laboratory';
export interface Principal {
  id: string;
  displayName: string;
  role: Role;
  isHead: boolean;
}
export interface DocumentSnapshot {
  patient: {
    id: string;
    fullName: string;
    sex: string | null;
    address: string | null;
    age: number | null;
    cs: string | null;
  };
  issuer: {
    id: string;
    displayName: string;
    licenseText: string | null;
    ptrText: string | null;
  };
  consultation: {
    id: string;
    revision: number;
    consultationDate: string;
    reason: string | null;
    findings: string | null;
    clinicalImpression: string | null;
    plan: string | null;
  };
  body: string;
  purpose: string | null;
  remarks: string | null;
  restriction: string | null;
  followUp: string | null;
}
export interface MirrorEvent {
  eventId: string;
  clinicId: string;
  schemaVersion: 1;
  entityType: EntityType;
  entityId: string;
  revision: number;
  operation: 'upsert';
  payload: Prisma.InputJsonObject;
}
// A single explicit whitelist governs EDGE snapshots and CLOUD validation.
export const payloadKeys = {
  staff: [
    'id',
    'revision',
    'displayName',
    'role',
    'isHead',
    'licenseText',
    'ptrText',
    'createdAt',
    'updatedAt',
  ],
  patient: [
    'id',
    'revision',
    'fullName',
    'sex',
    'address',
    'patientCategory',
    'employeeIdentifier',
    'dateOfBirth',
    'createdAt',
    'updatedAt',
  ],
  vitals: [
    'id',
    'patientId',
    'authorId',
    'revision',
    'status',
    'recordedAt',
    'systolic',
    'diastolic',
    'temperature',
    'pulse',
    'respiratoryRate',
    'oxygenSaturation',
    'weight',
    'createdAt',
    'updatedAt',
  ],
  entry: [
    'id',
    'patientId',
    'authorId',
    'discipline',
    'revision',
    'status',
    'consultationDate',
    'ageAtConsultation',
    'cs',
    'vitalsId',
    'reason',
    'findings',
    'clinicalImpression',
    'plan',
    'text',
    'createdAt',
    'updatedAt',
  ],
  correction: [
    'id',
    'originalType',
    'originalEntryId',
    'authorId',
    'reason',
    'correctedContent',
    'sourceRevision',
    'revision',
    'createdAt',
  ],
  document: [
    'id',
    'kind',
    'patientId',
    'consultationId',
    'issuerId',
    'issueDate',
    'snapshot',
    'revision',
    'createdAt',
  ],
} as const satisfies Record<EntityType, readonly string[]>;
export function snapshot(
  type: EntityType,
  record: object,
): Prisma.InputJsonObject {
  const source = record as Record<string, unknown>;
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const key of payloadKeys[type]) {
    const value = source[key];
    if (value === undefined) throw new Error(`Missing snapshot field ${key}`);
    result[key] =
      value instanceof Date
        ? value.toISOString()
        : (value as Prisma.InputJsonValue | null);
  }
  return result;
}

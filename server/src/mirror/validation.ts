import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import {
  entityTypes,
  payloadKeys,
  type EntityType,
  type MirrorEvent,
} from '../mirror-contract';

export class MirrorFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new MirrorFailure('INVALID_SCHEMA');
  return value as Record<string, unknown>;
}
function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (
    Object.keys(value).length !== allowed.length ||
    allowed.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new MirrorFailure('INVALID_SCHEMA');
}
function text(value: unknown, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length > 20000)
    throw new MirrorFailure('INVALID_SCHEMA');
}
export function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
function id(value: unknown, nullable = false): void {
  if (nullable && value === null) return;
  if (!uuid(value)) throw new MirrorFailure('INVALID_SCHEMA');
}
function revision(value: unknown): void {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1)
    throw new MirrorFailure('INVALID_SCHEMA');
}
function timestamp(value: unknown): void {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new MirrorFailure('INVALID_SCHEMA');
}
function dateOnly(value: unknown, nullable = false): void {
  if (nullable && value === null) return;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new MirrorFailure('INVALID_SCHEMA');
}
function age(value: unknown): void {
  if (
    value !== null &&
    (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
  )
    throw new MirrorFailure('INVALID_SCHEMA');
}
function measurement(value: unknown, key: string): void {
  numeric(value);
  if (
    typeof value === 'number' &&
    ((key === 'temperature' ? value < -273.15 : value < 0) ||
      (key === 'oxygenSaturation' && value > 100))
  )
    throw new MirrorFailure('INVALID_SCHEMA');
}
function numeric(value: unknown): void {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value)))
    throw new MirrorFailure('INVALID_SCHEMA');
}
const numericVitals = [
  'systolic',
  'diastolic',
  'temperature',
  'pulse',
  'respiratoryRate',
  'oxygenSaturation',
  'weight',
] as const;
const nullableEntryText = [
  'consultationDate',
  'cs',
  'reason',
  'findings',
  'clinicalImpression',
  'plan',
  'text',
] as const;
export function validatePayload(
  type: EntityType,
  payload: Record<string, unknown>,
): void {
  keys(payload, payloadKeys[type]);
  id(payload.id);
  revision(payload.revision);
  timestamp(payload.createdAt);
  if ('updatedAt' in payload) timestamp(payload.updatedAt);
  switch (type) {
    case 'historicalDocument':
      id(payload.patientId);
      id(payload.uploaderId);
      id(payload.replacesId, true);
      dateOnly(payload.documentDate);
      for (const field of [
        'documentType',
        'description',
        'filename',
        'uploaderName',
      ])
        text(payload[field]);
      text(payload.replacementReason, true);
      for (const [field, limit] of [
        ['documentType', 80],
        ['description', 2000],
        ['filename', 150],
        ['uploaderName', 200],
      ] as const) {
        const value = payload[field];
        if (typeof value !== 'string' || value.length > limit || !value.trim())
          throw new MirrorFailure('INVALID_SCHEMA');
      }
      if (
        payload.replacementReason !== null &&
        (typeof payload.replacementReason !== 'string' ||
          payload.replacementReason.length > 2000 ||
          !payload.replacementReason.trim())
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      if (
        payload.revision !== 1 ||
        !['medical', 'dental', 'laboratory'].includes(
          String(payload.discipline),
        ) ||
        !['application/pdf', 'image/jpeg'].includes(String(payload.mimeType)) ||
        typeof payload.byteLength !== 'number' ||
        !Number.isSafeInteger(payload.byteLength) ||
        payload.byteLength < 1 ||
        payload.byteLength > 10485760 ||
        typeof payload.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(payload.sha256) ||
        (payload.replacesId === null) !== (payload.replacementReason === null)
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      break;
    case 'staff':
      text(payload.displayName);
      text(payload.licenseText, true);
      text(payload.ptrText, true);
      if (
        !['doctor', 'dentist', 'medtech', 'attendant', 'clerk'].includes(
          String(payload.role),
        ) ||
        typeof payload.isHead !== 'boolean' ||
        (payload.isHead && payload.role !== 'doctor')
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      break;
    case 'patient':
      text(payload.fullName);
      dateOnly(payload.dateOfBirth, true);
      if (
        payload.sex !== null &&
        !['female', 'male', 'other', 'unknown'].includes(String(payload.sex))
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      if (
        payload.patientCategory !== null &&
        !['employee', 'dependent', 'other', 'unknown'].includes(
          String(payload.patientCategory),
        )
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      for (const key of [
        'sex',
        'address',
        'patientCategory',
        'employeeIdentifier',
        'dateOfBirth',
      ])
        text(payload[key], true);
      break;
    case 'vitals':
      id(payload.patientId);
      id(payload.authorId);
      timestamp(payload.recordedAt);
      for (const key of numericVitals) measurement(payload[key], key);
      if (
        typeof payload.oxygenSaturation === 'number' &&
        (payload.oxygenSaturation < 0 || payload.oxygenSaturation > 100)
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      if (!['draft', 'finalized'].includes(String(payload.status)))
        throw new MirrorFailure('INVALID_SCHEMA');
      break;
    case 'entry':
      id(payload.patientId);
      id(payload.authorId);
      id(payload.vitalsId, true);
      age(payload.ageAtConsultation);
      dateOnly(payload.consultationDate, payload.discipline !== 'medical');
      for (const key of nullableEntryText) text(payload[key], true);
      if (
        !['medical', 'dental', 'laboratory'].includes(
          String(payload.discipline),
        ) ||
        !['draft', 'finalized'].includes(String(payload.status))
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      break;
    case 'correction': {
      id(payload.originalEntryId);
      id(payload.authorId);
      text(payload.reason);
      revision(payload.sourceRevision);
      if (
        !['vitals', 'entry'].includes(String(payload.originalType)) ||
        payload.revision !== 1
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      const content = object(payload.correctedContent);
      const allowed: readonly string[] =
        payload.originalType === 'vitals'
          ? [...numericVitals, 'recordedAt']
          : [...nullableEntryText, 'ageAtConsultation', 'vitalsId'];
      if (
        Object.keys(content).length === 0 ||
        Object.keys(content).some((key) => !allowed.includes(key))
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      for (const [key, value] of Object.entries(content)) {
        if (
          numericVitals.includes(key as (typeof numericVitals)[number]) ||
          key === 'ageAtConsultation'
        )
          if (key === 'ageAtConsultation') age(value);
          else measurement(value, key);
        else if (key === 'recordedAt') timestamp(value);
        else if (key === 'consultationDate') dateOnly(value);
        else if (key === 'vitalsId') id(value, true);
        else text(value, true);
      }
      break;
    }
    case 'document': {
      id(payload.patientId);
      id(payload.consultationId);
      id(payload.issuerId);
      dateOnly(payload.issueDate);
      if (
        !['prescription', 'medical_certificate'].includes(
          String(payload.kind),
        ) ||
        payload.revision !== 1
      )
        throw new MirrorFailure('INVALID_SCHEMA');
      const snapshot = object(payload.snapshot);
      keys(snapshot, [
        'patient',
        'issuer',
        'consultation',
        'body',
        'purpose',
        'remarks',
        'restriction',
        'followUp',
      ]);
      for (const key of [
        'body',
        'purpose',
        'remarks',
        'restriction',
        'followUp',
      ])
        text(snapshot[key], key !== 'body');
      const patient = object(snapshot.patient);
      keys(patient, ['id', 'fullName', 'sex', 'address', 'age', 'cs']);
      id(patient.id);
      text(patient.fullName);
      age(patient.age);
      for (const key of ['sex', 'address', 'cs']) text(patient[key], true);
      const issuer = object(snapshot.issuer);
      keys(issuer, ['id', 'displayName', 'licenseText', 'ptrText']);
      id(issuer.id);
      text(issuer.displayName);
      text(issuer.licenseText, true);
      text(issuer.ptrText, true);
      const consultation = object(snapshot.consultation);
      keys(consultation, [
        'id',
        'revision',
        'consultationDate',
        'reason',
        'findings',
        'clinicalImpression',
        'plan',
      ]);
      id(consultation.id);
      revision(consultation.revision);
      dateOnly(consultation.consultationDate);
      for (const key of [
        'consultationDate',
        'reason',
        'findings',
        'clinicalImpression',
        'plan',
      ])
        text(consultation[key], key !== 'consultationDate');
      if (
        patient.id !== payload.patientId ||
        issuer.id !== payload.issuerId ||
        consultation.id !== payload.consultationId
      )
        throw new MirrorFailure('INVALID_REFERENCE');
      break;
    }
  }
}
export function parseBatch(input: unknown, clinic: string): MirrorEvent[] {
  const envelope = object(input);
  keys(envelope, ['clinicId', 'events']);
  if (envelope.clinicId !== clinic) throw new MirrorFailure('WRONG_CLINIC');
  if (
    !Array.isArray(envelope.events) ||
    envelope.events.length < 1 ||
    envelope.events.length > 50
  )
    throw new MirrorFailure('INVALID_SCHEMA');
  const seen = new Set<string>();
  return envelope.events.map((inputEvent: unknown) => {
    const event = object(inputEvent);
    keys(event, [
      'eventId',
      'clinicId',
      'schemaVersion',
      'entityType',
      'entityId',
      'revision',
      'operation',
      'payload',
    ]);
    id(event.eventId);
    id(event.entityId);
    revision(event.revision);
    if (event.clinicId !== clinic) throw new MirrorFailure('WRONG_CLINIC');
    if (
      event.schemaVersion !== 1 ||
      event.operation !== 'upsert' ||
      !entityTypes.includes(event.entityType as EntityType)
    )
      throw new MirrorFailure('INVALID_SCHEMA');
    const payload = object(event.payload);
    validatePayload(event.entityType as EntityType, payload);
    if (
      payload.id !== event.entityId ||
      payload.revision !== event.revision ||
      seen.has(String(event.eventId))
    )
      throw new MirrorFailure('INVALID_SCHEMA');
    seen.add(String(event.eventId));
    return event as unknown as MirrorEvent;
  });
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(object(value))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function inputJson(value: Prisma.JsonValue): Prisma.InputJsonObject {
  return object(value) as Prisma.InputJsonObject;
}

import { fail } from './errors';
import type { Discipline } from './mirror-contract';
export type FieldRule = (value: unknown, key: string) => unknown;
export function invalid(key: string): never {
  return fail(400, 'VALIDATION', 'Check the supplied fields.', {
    fieldErrors: { [key]: 'Invalid value.' },
  });
}
export function object(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    invalid('body');
  const result = input as Record<string, unknown>;
  for (const key of Object.keys(result)) if (!keys.includes(key)) invalid(key);
  return result;
}
export function text(
  value: unknown,
  key: string,
  required = false,
  max = 4000,
): string | null {
  if (value === null && !required) return null;
  if (
    typeof value !== 'string' ||
    value.length > max ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(character),
    )
  )
    invalid(key);
  const result = value.trim();
  if (required && !result) invalid(key);
  return result || null;
}
export function uuid(value: unknown, key = 'id'): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalid(key);
  return value;
}
export function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    invalid('expectedRevision');
  return value;
}
export function dateOnly(value: unknown, key: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    invalid(key);
  return value;
}
export function instant(value: unknown, key: string): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid(key);
  return new Date(value);
}
export function measurement(value: unknown, key: string): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (key === 'temperature' ? value < -273.15 : value < 0) ||
    (key === 'oxygenSaturation' && value > 100)
  )
    invalid(key);
  return value;
}
export function discipline(value: string): Discipline {
  if (value !== 'medical' && value !== 'dental' && value !== 'laboratory')
    invalid('discipline');
  return value;
}
export const patientFields = [
  'fullName',
  'sex',
  'address',
  'patientCategory',
  'employeeIdentifier',
  'dateOfBirth',
] as const;
export const vitalFields = [
  'recordedAt',
  'systolic',
  'diastolic',
  'temperature',
  'pulse',
  'respiratoryRate',
  'oxygenSaturation',
  'height',
  'weight',
] as const;
export const medicalFields = [
  'consultationDate',
  'ageAtConsultation',
  'cs',
  'vitalsId',
  'reason',
  'findings',
  'clinicalImpression',
  'plan',
] as const;
export function fields(
  input: Record<string, unknown>,
  keys: readonly string[],
  rule: FieldRule,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) if (key in input) result[key] = rule(input[key], key);
  return result;
}
export function patientValue(value: unknown, key: string): string | null {
  if (key === 'dateOfBirth')
    return value === null ? null : dateOnly(value, key);
  const parsed = text(
    value,
    key,
    key === 'fullName',
    key === 'address' ? 1000 : 200,
  );
  if (
    key === 'sex' &&
    parsed !== null &&
    !['female', 'male', 'other', 'unknown'].includes(parsed)
  )
    invalid(key);
  if (
    key === 'patientCategory' &&
    parsed !== null &&
    !['employee', 'dependent', 'other', 'unknown'].includes(parsed)
  )
    invalid(key);
  return parsed;
}
export function vitalValue(value: unknown, key: string): number | null | Date {
  return key === 'recordedAt' ? instant(value, key) : measurement(value, key);
}
export function medicalValue(
  value: unknown,
  key: string,
): string | number | null {
  if (key === 'consultationDate') return dateOnly(value, key);
  if (key === 'vitalsId') return value === null ? null : uuid(value, key);
  if (key === 'ageAtConsultation') {
    if (value === null) return null;
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 2147483647
    )
      invalid(key);
    return value;
  }
  return text(value, key);
}

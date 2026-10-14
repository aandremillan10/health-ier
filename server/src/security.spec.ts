import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './auth';
import { canRead } from './clinic.service';
import { assertSyntheticDatabase } from './demo-seed';
import { snapshot } from './mirror-contract';
import type { Discipline, Principal, Role } from './mirror-contract';
import {
  dateOnly,
  measurement,
  medicalValue,
  object,
  patientValue,
  revision,
  uuid,
} from './validation';
describe('security boundaries', () => {
  it('uses salted password hashes and rejects malformed/wrong passwords', () => {
    const hash = hashPassword('synthetic-password-only');
    expect(verifyPassword('synthetic-password-only', hash)).toBe(true);
    expect(verifyPassword('different', hash)).toBe(false);
    expect(verifyPassword('different', 'broken')).toBe(false);
    expect(hashPassword('synthetic-password-only')).not.toBe(hash);
  });
  const matrix: Record<Role, readonly Discipline[]> = {
    doctor: ['medical'],
    dentist: ['dental'],
    medtech: ['laboratory'],
    attendant: [],
    clerk: [],
  };
  for (const role of Object.keys(matrix) as Role[]) {
    for (const area of ['medical', 'dental', 'laboratory'] as const) {
      it(`${role} read ${area}`, () => {
        const staff: Principal = {
          id: 'synthetic',
          displayName: 'Synthetic',
          role,
          isHead: false,
        };
        expect(canRead(staff, area)).toBe(matrix[role].includes(area));
      });
    }
  }
  it('head oversight reads every discipline', () => {
    const staff: Principal = {
      id: 'synthetic',
      displayName: 'Synthetic',
      role: 'doctor',
      isHead: true,
    };
    expect(
      ['medical', 'dental', 'laboratory'].every((area) =>
        canRead(staff, area as Discipline),
      ),
    ).toBe(true);
  });
  it('rejects unknown fields and malformed structural values', () => {
    expect(() => object({ role: 'doctor' }, ['fullName'])).toThrow();
    expect(() => object([], [])).toThrow();
    expect(() => revision(0)).toThrow();
    expect(() => uuid('missing')).toThrow();
    expect(() => dateOnly('2026-02-30', 'date')).toThrow();
    expect(() => dateOnly('bad', 'date')).toThrow();
    expect(() => patientValue('unapproved', 'patientCategory')).toThrow();
    expect(() => measurement(Number.NaN, 'pulse')).toThrow();
    expect(() => measurement(101, 'oxygenSaturation')).toThrow();
    expect(() => medicalValue(2147483648, 'ageAtConsultation')).toThrow();
    expect(measurement(240, 'systolic')).toBe(240);
    expect(measurement(null, 'weight')).toBeNull();
  });
  it('serializes only permitted attribution with no credentials', () => {
    const record = {
      id: 'synthetic',
      revision: 1,
      displayName: 'Synthetic',
      role: 'doctor',
      isHead: true,
      licenseText: null,
      ptrText: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      username: 'excluded',
      passwordHash: 'excluded',
      sessions: ['excluded'],
    };
    const allowed = snapshot('staff', record);
    expect(allowed).not.toHaveProperty('username');
    expect(allowed).not.toHaveProperty('passwordHash');
    expect(allowed).not.toHaveProperty('sessions');
    expect(allowed.createdAt).toBe('1970-01-01T00:00:00.000Z');
  });
  it('seed and reset refuse cloud, production, and non-dedicated databases', () => {
    expect(() =>
      assertSyntheticDatabase(
        'postgresql://u@cloud.invalid/healthier_demo_test',
      ),
    ).toThrow();
    expect(() =>
      assertSyntheticDatabase('postgresql://u@localhost/production'),
    ).toThrow();
    expect(() => assertSyntheticDatabase(undefined)).toThrow();
    expect(() =>
      assertSyntheticDatabase('postgresql://u@127.0.0.1/healthier_demo_test'),
    ).not.toThrow();
  });
});

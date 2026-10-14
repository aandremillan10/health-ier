import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MirrorEvent } from '../mirror-contract';
import { canonical, digest, parseBatch } from './validation';
import { MirrorService } from './mirror.service';
import { httpsTransport } from './mirror.worker';
import type { DatabaseService } from '../database/database.service';
export function patientEvent(revision = 1): MirrorEvent {
  const id = randomUUID();
  return {
    eventId: randomUUID(),
    clinicId: 'synthetic-clinic',
    schemaVersion: 1,
    entityType: 'patient',
    entityId: id,
    revision,
    operation: 'upsert',
    payload: {
      id,
      revision,
      fullName: 'Synthetic Mirror Patient',
      sex: null,
      address: null,
      patientCategory: null,
      employeeIdentifier: null,
      dateOfBirth: null,
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
    },
  };
}
describe('mirror trust boundary', () => {
  it('admits exact whitelist and excludes extra fields, unsupported entities/schema, wrong clinic and malformed versions', () => {
    const event = patientEvent();
    const envelope = { clinicId: 'synthetic-clinic', events: [event] };
    expect(parseBatch(envelope, 'synthetic-clinic')).toEqual([event]);
    for (const changed of [
      { ...event, schemaVersion: 2 },
      { ...event, clinicId: 'other' },
      { ...event, entityType: 'session' },
      { ...event, revision: 2 },
      { ...event, payload: { ...event.payload, passwordHash: 'forbidden' } },
    ])
      expect(() =>
        parseBatch({ ...envelope, events: [changed] }, 'synthetic-clinic'),
      ).toThrow();
    expect(() =>
      parseBatch({ ...envelope, events: [event, event] }, 'synthetic-clinic'),
    ).toThrow();
  });
  it('hashes semantic object ordering consistently', () => {
    expect(canonical({ b: 1, a: { z: 2 } })).toBe(
      canonical({ a: { z: 2 }, b: 1 }),
    );
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
  });
  it('requires dedicated machine token, rejects staff and missing machine credential', () => {
    const service = new MirrorService({} as DatabaseService);
    process.env.MIRROR_MACHINE_TOKEN = 'x'.repeat(64);
    expect(() =>
      service.authenticate(`Bearer ${'x'.repeat(64)}`),
    ).not.toThrow();
    expect(() => service.authenticate('Bearer staff-token')).toThrow();
    expect(() => service.authenticate(`Bearer ${'é'.repeat(64)}`)).toThrow(
      'UNAUTHORIZED_MACHINE',
    );
    expect(() => service.authenticate(undefined)).toThrow();
    delete process.env.MIRROR_MACHINE_TOKEN;
    expect(() => service.authenticate(`Bearer ${'x'.repeat(64)}`)).toThrow();
  });
  it('refuses HTTP, credentials and arbitrary paths before network transfer', async () => {
    for (const url of [
      'http://localhost/internal/mirror/events',
      'https://user:pass@example.com/internal/mirror/events',
      'https://example.com/unapproved',
      'https://example.com/internal/mirror/events?redirect=unsafe',
    ]) {
      process.env.MIRROR_URL = url;
      await expect(httpsTransport([patientEvent()])).rejects.toThrow(
        'INVALID_ENDPOINT',
      );
    }
    delete process.env.MIRROR_URL;
  });
});

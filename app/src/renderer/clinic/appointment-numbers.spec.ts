import { describe, expect, it } from 'vitest';
import { createDemoAppointments } from './appointments-demo';
import type { Appointment } from '../../shared/appointments-api';
import { appointmentResponseGuards } from '../../privileged/appointments-contracts';
import type { Result } from './contract';

function record(result: Result<Appointment>): Appointment {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

describe('synthetic appointment numbers and desktop response boundary', () => {
  it('allocates per Manila day and discipline, preserves corrections and rejects invalid IPC numbers', async () => {
    const actorId = '10000000-0000-4000-8000-000000000001';
    const patientId = '20000000-0000-4000-8000-000000000001';
    const api = createDemoAppointments({
      getStaff: () => ({
        id: actorId,
        displayName: 'Synthetic clerk',
        role: 'clerk',
        isHead: false,
      }),
      getPatient: () => ({
        id: patientId,
        fullName: 'Synthetic patient',
        dateOfBirth: null,
      }),
      isAvailable: () => true,
    });
    const create = (
      discipline: 'medical' | 'dental' | 'laboratory',
      scheduledAt = '2026-10-15T08:00:00+08:00',
    ): Promise<Appointment> =>
      api
        .createAppointment({ patientId, discipline, scheduledAt })
        .then(record);
    const first = await create('medical');
    expect(first.queueNumber).toBe(1);
    expect((await create('medical')).queueNumber).toBe(2);
    expect((await create('dental')).queueNumber).toBe(1);
    expect((await create('laboratory')).queueNumber).toBe(1);
    expect(
      (await create('medical', '2026-10-16T00:00:00+08:00')).queueNumber,
    ).toBe(1);
    expect(
      (await create('medical', '2026-10-15T23:59:59+08:00')).queueNumber,
    ).toBe(3);
    const arrived = record(
      await api.transitionAppointment({
        id: first.id,
        expectedRevision: 1,
        status: 'arrived',
      }),
    );
    const corrected = record(
      await api.correctAppointment({
        id: first.id,
        expectedRevision: arrived.revision,
        status: 'scheduled',
        reason: 'Synthetic correction',
      }),
    );
    expect(corrected.queueNumber).toBe(first.queueNumber);
    expect(
      appointmentResponseGuards.createAppointment(corrected).queueNumber,
    ).toBe(1);
    for (const invalid of [undefined, 0, -1, 1.5, '1', Number.NaN, 2147483648])
      expect(() =>
        appointmentResponseGuards.createAppointment({
          ...corrected,
          queueNumber: invalid,
        }),
      ).toThrow();
  });
});

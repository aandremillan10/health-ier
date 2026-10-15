import { describe, expect, it } from 'vitest';
import { createDemoAppointments } from './appointments-demo';
import type { Principal } from './contract';

// Public synthetic adapter seam: lifecycle, permissions, stale writes and Manila day boundaries.
describe('daily appointment flow', () => {
  it('preserves state history and rejects invalid or stale changes', async () => {
    let staff: Principal = {
      id: 'clerk',
      displayName: 'Demo clerk',
      role: 'clerk',
      isHead: false,
    };
    const api = createDemoAppointments({
      getStaff: () => staff,
      getPatient: (id) =>
        id === 'patient'
          ? { id, fullName: 'Synthetic patient', dateOfBirth: null }
          : null,
      isAvailable: () => true,
    });
    const scheduled = await api.createAppointment({
      patientId: 'patient',
      discipline: 'medical',
      scheduledAt: '2025-01-02T00:15:00+08:00',
    });
    expect(scheduled.ok).toBe(true);
    if (!scheduled.ok) return;
    const id = scheduled.data.id;
    expect(await api.listAppointments({ date: '2025-01-01' })).toMatchObject({
      ok: true,
      data: [],
    });
    expect(await api.listAppointments({ date: '2025-01-02' })).toMatchObject({
      ok: true,
      data: [{ id, status: 'scheduled' }],
    });
    expect(
      await api.transitionAppointment({
        id,
        expectedRevision: 1,
        status: 'waiting',
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      await api.transitionAppointment({
        id,
        expectedRevision: 1,
        status: 'arrived',
      }),
    ).toMatchObject({
      ok: true,
      data: {
        revision: 2,
        history: [
          { toStatus: 'scheduled' },
          { fromStatus: 'scheduled', toStatus: 'arrived' },
        ],
      },
    });
    expect(
      await api.transitionAppointment({
        id,
        expectedRevision: 1,
        status: 'arrived',
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      await api.transitionAppointment({
        id,
        expectedRevision: 2,
        status: 'waiting',
      }),
    ).toMatchObject({ ok: true, data: { revision: 3 } });
    expect(
      await api.transitionAppointment({
        id,
        expectedRevision: 3,
        status: 'with_provider',
      }),
    ).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    staff = {
      id: 'doctor',
      displayName: 'Demo doctor',
      role: 'doctor',
      isHead: false,
    };
    expect(
      await api.transitionAppointment({
        id,
        expectedRevision: 3,
        status: 'with_provider',
      }),
    ).toMatchObject({ ok: true, data: { revision: 4 } });
    expect(
      await api.transitionAppointment({
        id,
        expectedRevision: 4,
        status: 'lab',
      }),
    ).toMatchObject({ ok: true, data: { revision: 5 } });
    expect(
      await api.transitionAppointment({
        id,
        expectedRevision: 5,
        status: 'completed',
      }),
    ).toMatchObject({ ok: true, data: { revision: 6 } });
    expect(
      await api.correctAppointment({
        id,
        expectedRevision: 6,
        status: 'lab',
        reason: 'Completion was selected in error.',
      }),
    ).toMatchObject({ ok: true, data: { revision: 7, status: 'lab' } });
    const corrected = await api.listAppointments({
      date: '2025-01-02',
      discipline: 'medical',
    });
    expect(corrected.ok && corrected.data[0].history.at(-1)).toMatchObject({
      kind: 'correction',
      actorId: 'doctor',
      reason: 'Completion was selected in error.',
      fromStatus: 'completed',
      toStatus: 'lab',
    });
    expect(
      await api.listAppointments({ date: '2025-01-02', discipline: 'dental' }),
    ).toMatchObject({ ok: true, data: [] });
    staff = {
      id: 'clerk',
      displayName: 'Demo clerk',
      role: 'clerk',
      isHead: false,
    };
    const missed = await api.createAppointment({
      patientId: 'patient',
      discipline: 'dental',
      scheduledAt: '2025-01-02T23:45:00+08:00',
    });
    if (!missed.ok) throw new Error('Expected synthetic appointment');
    expect(
      await api.transitionAppointment({
        id: missed.data.id,
        expectedRevision: 1,
        status: 'no_show',
      }),
    ).toMatchObject({ ok: true, data: { status: 'no_show' } });
    expect(
      await api.transitionAppointment({
        id: missed.data.id,
        expectedRevision: 2,
        status: 'arrived',
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });
});

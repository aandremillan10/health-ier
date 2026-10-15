import { describe, expect, it, vi } from 'vitest';
import { createPractice, availableTopics } from './practice';
import type { PracticeSession } from './practice';
import { demoStaff } from './demo';
import type { EntryInput } from './contract';
import { today } from './format';

function data<T>(
  result: { ok: true; data: T } | { ok: false; error: { message: string } },
): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
async function open(
  role: 'doctor' | 'dentist' | 'medtech' | 'attendant' | 'clerk',
  topic: Parameters<typeof createPractice>[1],
): Promise<PracticeSession> {
  return createPractice({ role, isHead: role === 'doctor' }, topic);
}

describe('production practice isolation', () => {
  it('can initialize every permitted role/topic with synthetic identity and no network', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Practice must not fetch'));
    try {
      for (const staff of demoStaff)
        for (const topic of availableTopics(staff)) {
          const session = await createPractice(staff, topic);
          expect(session.staff.role).toBe(staff.role);
          expect(session.staff.isHead).toBe(staff.isHead);
          expect(session.staff.id).toMatch(/^demo-/);
          expect(session.steps.length).toBeGreaterThan(1);
          expect(
            data(await session.api.findPatients({ search: 'Lina' })),
          ).toHaveLength(2);
          session.dispose();
        }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it('denies session and export calls, clears listeners and refuses actions after disposal', async () => {
    const session = await open('doctor', 'medical');
    const listener = vi.fn();
    session.subscribe(listener);
    expect(
      (
        await session.api.login({
          username: 'real-user',
          password: 'never-used',
        })
      ).ok,
    ).toBe(false);
    expect((await session.api.logout()).ok).toBe(false);
    expect((await session.api.me()).ok).toBe(false);
    expect(
      (
        await session.api.exportReport({
          from: '2026-10-01',
          to: '2026-10-15',
          fingerprint: 'x',
        })
      ).ok,
    ).toBe(false);
    session.dispose();
    listener.mockClear();
    expect((await session.api.findPatients({ search: '' })).ok).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
  it('isolates writes and discards them on replay', async () => {
    const first = await open('clerk', 'registry');
    const patient = data(await first.api.getPatient({ id: 'DEMO-0001' }));
    data(
      await first.api.updatePatient({
        ...patient,
        expectedRevision: patient.revision,
        address: 'Changed only here',
      }),
    );
    expect(data(await first.api.getPatient({ id: patient.id })).address).toBe(
      'Changed only here',
    );
    const next = await open('clerk', 'registry');
    expect(
      data(await next.api.getPatient({ id: patient.id })).address,
    ).not.toBe('Changed only here');
    first.dispose();
    next.dispose();
  });
  it('exercises draft, conflict, recovery, finalization, correction and inert document actions', async () => {
    const session = await open('doctor', 'medical');
    const input: EntryInput = {
      consultationDate: '2026-10-15',
      ageAtConsultation: 37,
      cs: '',
      vitalsId: 'demo-vitals-1',
      reason: 'Practice only',
      findings: '',
      clinicalImpression: '',
      plan: '',
    };
    const created = data(
      await session.api.saveEntry({
        ...input,
        patientId: 'DEMO-0001',
        discipline: 'medical',
      }),
    );
    session.conflictNext();
    expect(
      (
        await session.api.saveEntry({
          ...input,
          patientId: created.patientId,
          discipline: 'medical',
          id: created.id,
          expectedRevision: created.revision,
        })
      ).ok,
    ).toBe(false);
    const latest = data(
      await session.api.listEntries({
        patientId: created.patientId,
        discipline: 'medical',
      }),
    ).find((entry) => entry.id === created.id)!;
    const saved = data(
      await session.api.saveEntry({
        ...input,
        patientId: created.patientId,
        discipline: 'medical',
        id: created.id,
        expectedRevision: latest.revision,
      }),
    );
    const finalized = data(
      await session.api.finalizeEntry({
        id: saved.id,
        expectedRevision: saved.revision,
      }),
    );
    const corrected = data(
      await session.api.correctEntry({
        id: finalized.id,
        expectedRevision: finalized.revision,
        reason: 'Practice correction',
        correctedContent: { ...input, findings: 'Corrected fictional text' },
      }),
    );
    expect(corrected.findings).toBe('');
    expect(corrected.corrections).toHaveLength(1);
    const document = {
      entryId: corrected.id,
      expectedRevision: corrected.revision,
      kind: 'certificate' as const,
      issueDate: '2026-10-15',
      body: '',
      findings: 'Fictional',
      remarks: '',
      purpose: 'Practice only',
    };
    expect(data(await session.api.previewDocument(document)).status).toBe(
      'preview',
    );
    const issued = data(await session.api.issueDocument(document));
    expect(
      data(await session.api.listDocuments({ patientId: created.patientId })),
    ).toHaveLength(1);
    expect(data(await session.api.getDocument({ id: issued.id! })).id).toBe(
      issued.id,
    );
    expect(data(await session.api.listPrinters())[0]?.id).toBe(
      'practice-printer',
    );
    expect(
      data(
        await session.api.printDocument({
          documentId: issued.id!,
          printerId: 'practice-printer',
        }),
      ).submitted,
    ).toBe(true);
    session.dispose();
  });
  it('uses only local selection metadata for historical scans and preserves replacements', async () => {
    const session = await open('doctor', 'historical');
    const selected = data(
      await session.api.selectHistoricalFile({ patientId: 'DEMO-0001' }),
    ).selection!;
    const original = data(
      await session.api.importHistoricalDocument({
        patientId: 'DEMO-0001',
        selectionToken: selected.token,
        discipline: 'medical',
        documentType: 'Practice scan',
        documentDate: '2026-10-15',
        description: 'Fictional scan',
      }),
    );
    expect(
      data(
        await session.api.readHistoricalDocument({
          patientId: original.patientId,
          id: original.id,
        }),
      ).id,
    ).toBe(original.id);
    expect(
      (
        await session.api.readHistoricalDocumentContent({
          patientId: original.patientId,
          id: original.id,
        })
      ).ok,
    ).toBe(false);
    const next = data(
      await session.api.selectHistoricalFile({ patientId: 'DEMO-0001' }),
    ).selection!;
    const replacement = data(
      await session.api.importHistoricalDocument({
        patientId: 'DEMO-0001',
        selectionToken: next.token,
        discipline: 'medical',
        documentType: 'Practice replacement',
        documentDate: '2026-10-15',
        description: 'Fictional scan',
        replacesId: original.id,
        replacementReason: 'Fictional clearer copy',
      }),
    );
    expect(replacement.replacesId).toBe(original.id);
    expect(
      data(
        await session.api.listHistoricalDocuments({
          patientId: original.patientId,
        }),
      ).documents,
    ).toHaveLength(2);
    session.dispose();
  });
  it('rejects invalid scan metadata and duplicate successors without consuming the selected scan or changing history', async () => {
    const session = await open('doctor', 'historical');
    const selected = data(
      await session.api.selectHistoricalFile({ patientId: 'DEMO-0001' }),
    ).selection!;
    const input = {
      patientId: 'DEMO-0001',
      selectionToken: selected.token,
      discipline: 'medical' as const,
      documentType: 'Practice scan',
      documentDate: '2024-02-29',
      description: 'Fictional original',
    };
    for (const documentDate of [
      '2026-02-29',
      '2026-04-31',
      '2026-1-01',
      'not-a-date',
    ]) {
      expect(
        await session.api.importHistoricalDocument({ ...input, documentDate }),
      ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
    expect(
      await session.api.importHistoricalDocument({
        ...input,
        replacementReason: 'Orphan reason',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const original = data(await session.api.importHistoricalDocument(input));
    data(
      await session.api.selectHistoricalFile({ patientId: input.patientId }),
    );
    for (const replacementReason of [undefined, ' ', 'x'.repeat(2001)]) {
      expect(
        await session.api.importHistoricalDocument({
          ...input,
          replacesId: original.id,
          replacementReason,
        }),
      ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
    const replacement = data(
      await session.api.importHistoricalDocument({
        ...input,
        replacesId: original.id,
        replacementReason: 'Clearer fictional scan',
      }),
    );
    data(
      await session.api.selectHistoricalFile({ patientId: input.patientId }),
    );
    expect(
      await session.api.importHistoricalDocument({
        ...input,
        replacesId: original.id,
        replacementReason: 'Duplicate successor',
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      data(
        await session.api.listHistoricalDocuments({
          patientId: input.patientId,
        }),
      ).documents,
    ).toEqual([replacement, original]);
    const latest = data(
      await session.api.importHistoricalDocument({
        ...input,
        replacesId: replacement.id,
        replacementReason: 'Correct next link',
      }),
    );
    expect(latest.replacesId).toBe(replacement.id);
    expect(
      data(
        await session.api.readHistoricalDocument({
          patientId: input.patientId,
          id: original.id,
        }),
      ),
    ).toEqual(original);
    session.dispose();
  });
  it('preserves nullable vitals and original attribution across finalization and correction', async () => {
    const session = await open('attendant', 'vitals');
    const fields = {
      recordedAt: '2026-10-15T01:00:00.000Z',
      systolic: null,
      diastolic: null,
      temperature: null,
      pulse: 74,
      respiratoryRate: null,
      oxygenSaturation: null,
      weight: null,
      height: null,
    };
    const saved = data(
      await session.api.saveVitals({ ...fields, patientId: 'DEMO-0001' }),
    );
    const final = data(
      await session.api.finalizeVitals({
        id: saved.id,
        expectedRevision: saved.revision,
      }),
    );
    const corrected = data(
      await session.api.correctVitals({
        id: final.id,
        expectedRevision: final.revision,
        reason: 'Fictional correction',
        correctedContent: { ...fields, pulse: 75 },
      }),
    );
    expect(corrected.pulse).toBe(74);
    expect(corrected.temperature).toBeNull();
    expect(corrected.corrections[0]?.authorId).toBe(session.staff.id);
    session.dispose();
  });
  it('maintains appointment transitions in local state', async () => {
    const appointmentSession = await open('clerk', 'appointments');
    const appointment = data(
      await appointmentSession.api.listAppointments({ date: today() }),
    )[0]!;
    const arrived = data(
      await appointmentSession.api.transitionAppointment({
        id: appointment.id,
        expectedRevision: appointment.revision,
        status: 'arrived',
      }),
    );
    const waiting = data(
      await appointmentSession.api.transitionAppointment({
        id: arrived.id,
        expectedRevision: arrived.revision,
        status: 'waiting',
      }),
    );
    expect(waiting.history).toHaveLength(3);
    expect(
      (
        await appointmentSession.api.transitionAppointment({
          id: waiting.id,
          expectedRevision: waiting.revision,
          status: 'with_provider',
        })
      ).ok,
    ).toBe(false);
    appointmentSession.dispose();
  });
  it('performs laboratory roles without switching real accounts', async () => {
    const medtech = await open('medtech', 'laboratory');
    const order = data(
      await medtech.api.listLabOrders({ patientId: 'DEMO-0001' }),
    ).find((item) => item.requestedTests[0] === 'Practice test')!;
    const started = data(
      await medtech.api.startLabOrder({
        id: order.id,
        expectedRevision: order.revision,
      }),
    );
    const saved = data(
      await medtech.api.saveLabResult({
        orderId: order.id,
        expectedRevision: started.revision,
        values: [
          {
            test: 'Practice test',
            value: 'Fictional',
            unit: null,
            referenceRange: null,
            flag: 'unspecified',
          },
        ],
        notes: null,
      }),
    );
    const draft = saved.results[0]!;
    const finalized = data(
      await medtech.api.finalizeLabResult({
        id: draft.id,
        expectedRevision: draft.revision,
        expectedOrderRevision: saved.revision,
      }),
    );
    expect(finalized.status).toBe('resulted');
    expect(
      (
        await medtech.api.reviewLabOrder({
          id: finalized.id,
          expectedRevision: finalized.revision,
        })
      ).ok,
    ).toBe(false);
    const provider = await open('doctor', 'laboratory');
    const returned = data(
      await provider.api.listLabOrders({ patientId: 'DEMO-0001' }),
    ).find((item) => item.status === 'resulted')!;
    expect(
      data(
        await provider.api.reviewLabOrder({
          id: returned.id,
          expectedRevision: returned.revision,
        }),
      ).status,
    ).toBe('reviewed');
    expect(
      data(
        await provider.api.createLabOrder({
          patientId: 'DEMO-0001',
          requestedTests: ['Local new order'],
          clinicalContext: null,
          priority: 'routine',
          requestedFor: today(),
        }),
      ).status,
    ).toBe('ordered');
    medtech.dispose();
    provider.dispose();
  });
  it('completes seeded receiving referrals with appropriate local result links', async () => {
    for (const role of ['doctor', 'dentist', 'medtech'] as const) {
      const session = await open(role, 'referrals');
      const referral = data(
        await session.api.listReferralInbox({ scope: 'pending' }),
      )[0]!;
      const accepted = data(
        await session.api.acceptReferral({
          id: referral.id,
          expectedRevision: referral.revision,
        }),
      );
      const started = data(
        await session.api.startReferral({
          id: referral.id,
          expectedRevision: accepted.revision,
        }),
      );
      const orders = data(
        await session.api.listLabOrders({ patientId: 'DEMO-0001' }),
      );
      const result = orders
        .find((order) => order.id === started.labOrderId)
        ?.results.find((item) => item.status === 'finalized');
      expect(
        data(
          await session.api.completeReferral({
            id: started.id,
            expectedRevision: started.revision,
            completionNote: 'Practice task complete',
            completionReference: null,
            labResultId: role === 'medtech' ? result!.id : null,
          }),
        ).status,
      ).toBe('completed');
      session.dispose();
    }
  });
  it('saves sourced summary history and enforces scoped read/oversight access', async () => {
    const session = await open('doctor', 'summary');
    const item = data(
      await session.api.createSummaryItem({
        patientId: 'DEMO-0001',
        content: {
          kind: 'allergy',
          substance: 'Practice substance',
        },
        source: 'Practice record',
        notes: null,
      }),
    );
    expect(
      data(await session.api.readSummaryHistory({ id: item.id })),
    ).toHaveLength(1);
    expect(
      data(await session.api.readReport({ from: today(), to: today() })).from,
    ).toBe(today());
    expect(
      data(await session.api.listAuditEvents({ from: today(), to: today() }))
        .events.length,
    ).toBeGreaterThan(0);
    const ordinary = await createPractice(
      { role: 'doctor', isHead: false },
      'medical',
    );
    expect(
      (await ordinary.api.listAuditEvents({ from: today(), to: today() })).ok,
    ).toBe(false);
    const dental = await open('dentist', 'dental');
    expect(
      (
        await dental.api.listEntries({
          patientId: 'DEMO-0001',
          discipline: 'medical',
        })
      ).ok,
    ).toBe(false);
    expect(
      data(
        await dental.api.listEntries({
          patientId: 'DEMO-0001',
          discipline: 'dental',
        }),
      ),
    ).toHaveLength(1);
    session.dispose();
    ordinary.dispose();
    dental.dispose();
  });
  it('drops an in-flight synthetic completion on disposal', async () => {
    const session = await open('clerk', 'registry');
    const listener = vi.fn();
    session.subscribe(listener);
    const pending = session.api.findPatients({ search: 'Lina' });
    session.dispose();
    expect((await pending).ok).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});

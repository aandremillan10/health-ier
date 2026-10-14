import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ClinicBroker } from './broker';
import { record, text } from './validation';
import type { Printer, Requests, Responses } from '../shared/clinic-api';

describe('real synthetic EDGE broker integration', () => {
  it.skipIf(!process.env.HEALTH_IER_LIVE_CREDENTIALS)(
    'executes named operations against real NestJS/PostgreSQL without exposing a token',
    async () => {
      const credentials = record(
        JSON.parse(
          await readFile(process.env.HEALTH_IER_LIVE_CREDENTIALS ?? '', 'utf8'),
        ) as unknown,
      );
      if (!Array.isArray(credentials.accounts))
        throw new Error('Invalid private account file');
      const accounts = credentials.accounts.map(record);
      const sender = {
        senderId: 7,
        isMainFrame: true,
        url: 'file:///synthetic/index.html',
      };
      const broker = new ClinicBroker({
        serverUrl:
          process.env.HEALTH_IER_LIVE_SERVER ?? 'http://127.0.0.1:3000',
        allowSyntheticHttp: true,
        packaged: false,
        rendererUrl: sender.url,
        senderId: 7,
        fetch: (url, options): Promise<Response> => fetch(url, options),
        reset: (): void => undefined,
        printer: {
          listPrinters: async (): Promise<Printer[]> => [
            {
              name: 'Synthetic test adapter',
              displayName: 'Synthetic test adapter',
            },
          ],
          print: async (): Promise<void> => undefined,
          cancel: (): void => undefined,
        },
      });
      async function call<K extends keyof Requests>(
        name: K,
        input: Requests[K],
      ): Promise<Responses[K]> {
        const result = await broker.invoke(name, input, sender);
        if (!result.ok) throw new Error(`${name} failed: ${result.error.code}`);
        return result.data;
      }
      async function signIn(username: string): Promise<void> {
        const account = accounts.find(
          (candidate) => candidate.username === username,
        );
        if (!account) throw new Error('Missing named synthetic account');
        const staff = await call('login', {
          username,
          password: text(1024, 1)(account.password),
        });
        expect(Object.keys(staff).sort()).toEqual([
          'displayName',
          'id',
          'isHead',
          'role',
        ]);
        expect((await call('currentStaff', undefined)).id).toBe(staff.id);
      }
      expect(await call('health', undefined)).toEqual({
        status: 'ok',
        mode: 'EDGE',
      });
      await signIn('demo.clerk');
      const created = await call('createPatient', {
        fullName: 'Synthetic Electron Boundary Patient',
        sex: 'female',
        address: 'Synthetic address',
        patientCategory: 'other',
        employeeIdentifier: null,
        dateOfBirth: null,
      });
      const updated = await call('updatePatient', {
        id: created.id,
        expectedRevision: created.revision,
        address: 'Updated synthetic address',
      });
      expect(updated.revision).toBe(created.revision + 1);
      expect(
        (
          await call('searchPatients', {
            search: 'Synthetic Electron Boundary',
          })
        ).some((patient) => patient.id === created.id),
      ).toBe(true);
      const conflict = await broker.invoke(
        'updatePatient',
        {
          id: created.id,
          expectedRevision: created.revision,
          address: 'Stale',
        },
        sender,
      );
      expect(conflict).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT', currentRevision: updated.revision },
      });
      await signIn('demo.attendant');
      const vitals = await call('createVitals', {
        patientId: created.id,
        systolic: 120,
        diastolic: 80,
        temperature: 36.5,
        pulse: 70,
        respiratoryRate: 18,
        oxygenSaturation: 98,
        weight: null,
      });
      const editedVitals = await call('updateVitals', {
        id: vitals.id,
        expectedRevision: vitals.revision,
        pulse: 71,
      });
      const finalizedVitals = await call('finalizeVitals', {
        id: vitals.id,
        expectedRevision: editedVitals.revision,
      });
      const vitalCorrection = await call('correctVitals', {
        id: vitals.id,
        expectedRevision: finalizedVitals.revision,
        reason: 'Synthetic transcription correction',
        correctedContent: { pulse: 72 },
      });
      expect(vitalCorrection.original.pulse).toBe(71);
      expect(
        (await call('readVitals', { patientId: created.id }))[0]?.corrections[0]
          ?.id,
      ).toBe(vitalCorrection.correction.id);
      await signIn('demo.doctor');
      const entry = await call('createMedicalEntry', {
        patientId: created.id,
        consultationDate: '2026-10-14',
        ageAtConsultation: null,
        cs: null,
        vitalsId: vitals.id,
        reason: 'Synthetic reason',
        findings: 'Synthetic findings',
        clinicalImpression: 'Synthetic impression',
        plan: 'Synthetic instructions',
      });
      const editedEntry = await call('updateMedicalEntry', {
        id: entry.id,
        expectedRevision: entry.revision,
        findings: 'Synthetic updated findings',
      });
      const finalizedEntry = await call('finalizeEntry', {
        id: entry.id,
        expectedRevision: editedEntry.revision,
      });
      const corrected = await call('correctEntry', {
        id: entry.id,
        expectedRevision: finalizedEntry.revision,
        reason: 'Synthetic correction',
        correctedContent: { findings: 'Synthetic corrected findings' },
      });
      expect((await call('readCorrections', { id: entry.id }))[0]?.id).toBe(
        corrected.correction.id,
      );
      expect(
        (
          await call('readEntries', {
            patientId: created.id,
            discipline: 'medical',
          })
        )[0]?.findings,
      ).toBe('Synthetic updated findings');
      const input = {
        kind: 'prescription',
        consultationId: entry.id,
        expectedRevision: corrected.original.revision,
        body: 'Synthetic print instructions',
      } satisfies Requests['issueDocument'];
      const preview = await call('previewDocument', input);
      const issued = await call('issueDocument', input);
      expect(issued.snapshot).toEqual(preview.snapshot);
      expect(await call('readDocument', { id: issued.id })).toEqual(issued);
      expect((await call('listPrinters', undefined))[0]?.name).toBe(
        'Synthetic test adapter',
      );
      expect(
        await call('printDocument', {
          documentId: issued.id,
          printerName: 'Synthetic test adapter',
          copies: 1,
          duplexMode: 'simplex',
        }),
      ).toEqual({ documentId: issued.id, submitted: true });
      // This printer is a test adapter; no physical/Electron submission is claimed.
      await signIn('demo.medtech.one');
      const minimum = await call('searchPatients', {
        search: 'Synthetic Electron Boundary',
      });
      expect(minimum[0]).not.toHaveProperty('address');
      await signIn('demo.doctor.head');
      const seedPatient = '20000000-0000-4000-8000-000000000001';
      expect(
        (
          await call('readEntries', {
            patientId: seedPatient,
            discipline: 'dental',
          })
        ).length,
      ).toBeGreaterThan(0);
      expect(
        (
          await call('readEntries', {
            patientId: seedPatient,
            discipline: 'laboratory',
          })
        ).length,
      ).toBeGreaterThan(0);
      await call('logout', undefined);
      expect(
        await broker.invoke('currentStaff', undefined, sender),
      ).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    },
    30000,
  );
});

import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService, StaffGuard, tokenHash } from '../src/auth';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';
import { ClinicalSummaryController } from '../src/clinical-summary/clinical-summary.controller';
import { ClinicalSummaryService } from '../src/clinical-summary/clinical-summary.service';

// Public HTTP seam: an explicitly supplied, disposable synthetic database only.
describe.skipIf(!process.env.SUMMARY_E2E_DATABASE_URL)(
  'clinical summary HTTP acceptance',
  () => {
    let app: NestExpressApplication;
    let db: DatabaseService;
    const patientId = '24000000-0000-4000-8000-000000000014';
    const doctorId = '14000000-0000-4000-8000-000000000014';
    const otherId = '14000000-0000-4000-8000-000000000015';
    const clerkId = '14000000-0000-4000-8000-000000000016';
    const token = 's'.repeat(43);
    const otherToken = 't'.repeat(43);
    const clerkToken = 'u'.repeat(43);
    const content = {
      kind: 'allergy',
      substance: 'Synthetic penicillin',
    };
    let itemId: string;

    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.SUMMARY_E2E_DATABASE_URL;
      process.env.SERVER_MODE = 'EDGE';
      const module = await Test.createTestingModule({
        controllers: [ClinicalSummaryController],
        providers: [
          ClinicalSummaryService,
          DatabaseService,
          AuthService,
          StaffGuard,
        ],
      }).compile();
      db = module.get(DatabaseService);
      await db.patient.create({
        data: { id: patientId, fullName: 'Synthetic Summary Acceptance' },
      });
      for (const [id, staffToken, role] of [
        [doctorId, token, 'doctor'],
        [otherId, otherToken, 'dentist'],
        [clerkId, clerkToken, 'clerk'],
      ]) {
        await db.staff.create({
          data: {
            id,
            username: `summary-${id}`,
            passwordHash: 'unused',
            displayName: 'Synthetic summary staff',
            role,
          },
        });
        await db.session.create({
          data: {
            tokenHash: tokenHash(staffToken),
            staffId: id,
            expiresAt: new Date(Date.now() + 60000),
          },
        });
      }
      app = module.createNestApplication<NestExpressApplication>({
        bodyParser: false,
      });
      configureHttp(app);
      await app.init();
    });

    it('enforces reads, author changes, stale revisions and immutable clinical provenance', async () => {
      const client = request(app.getHttpServer());
      const path = `/patients/${patientId}/clinical-summary`;
      await client.get(path).expect(401);
      await client.get(path).auth(clerkToken, { type: 'bearer' }).expect(403);
      const empty = await client
        .get(path)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(empty.body).toEqual({ patientId, canCreate: true, items: [] });
      const created = await client
        .post(path)
        .auth(token, { type: 'bearer' })
        .send({ content, source: 'Synthetic patient report', notes: null })
        .expect(201);
      itemId = created.body.id as string;
      expect(created.body).toMatchObject({
        patientId,
        revision: 1,
        status: 'active',
        content,
        authorId: doctorId,
        canEdit: true,
      });
      await client
        .patch(`/clinical-summary-items/${itemId}`)
        .auth(otherToken, { type: 'bearer' })
        .send({
          expectedRevision: 1,
          content,
          source: 'Synthetic patient report',
          notes: 'Denied',
          reason: 'Synthetic edit',
        })
        .expect(403);
      await client
        .post(`/clinical-summary-items/${itemId}/corrections`)
        .auth(token, { type: 'bearer' })
        .send({
          expectedRevision: 1,
          content: { ...content, substance: 'Synthetic latex' },
          source: 'Synthetic patient report',
          notes: null,
          reason: 'Corrected substance',
        })
        .expect(201);
      await client
        .post(`/clinical-summary-items/${itemId}/inactivate`)
        .auth(token, { type: 'bearer' })
        .send({ expectedRevision: 1, reason: 'Stale request' })
        .expect(409);
      await client
        .post(`/clinical-summary-items/${itemId}/inactivate`)
        .auth(token, { type: 'bearer' })
        .send({ expectedRevision: 2, reason: 'Recorded in error' })
        .expect(201);
      const shared = await client
        .get(path)
        .auth(otherToken, { type: 'bearer' })
        .expect(200);
      expect(shared.body.items[0]).toMatchObject({
        revision: 3,
        status: 'inactive',
        canEdit: false,
        content: { substance: 'Synthetic latex' },
      });
      const history = await client
        .get(`/clinical-summary-items/${itemId}/history`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(
        history.body.map((event: { revision: number; action: string }) => [
          event.revision,
          event.action,
        ]),
      ).toEqual([
        [3, 'inactivate'],
        [2, 'correct'],
        [1, 'create'],
      ]);
      expect(history.body[2].snapshot.content.substance).toBe(
        'Synthetic penicillin',
      );
      await client
        .post(path)
        .auth(token, { type: 'bearer' })
        .send({
          content: { ...content, onsetDate: '2026-02-30' },
          source: 'Synthetic',
          notes: null,
        })
        .expect(400);
    });

    it('accepts only reduced fields and projects retained legacy records and revisions', async () => {
      const client = request(app.getHttpServer());
      const path = '/patients/' + patientId + '/clinical-summary';
      const legacyAllergyId = '34000000-0000-4000-8000-000000000014';
      const legacyImmunizationId = '34000000-0000-4000-8000-000000000015';
      const legacyContent = {
        kind: 'allergy',
        substance: 'Synthetic ragweed',
        reaction: 'Legacy reaction',
        severity: 'moderate',
        onsetDate: null,
      };
      const legacy = await db.clinicalSummaryItem.create({
        data: {
          id: legacyAllergyId,
          patientId,
          authorId: doctorId,
          kind: 'allergy',
          content: legacyContent,
          source: 'Legacy chart',
          notes: 'Legacy note',
        },
      });
      await db.clinicalSummaryRevision.create({
        data: {
          itemId: legacy.id,
          authorId: doctorId,
          revision: 1,
          action: 'create',
          snapshot: {
            content: legacyContent,
            source: legacy.source,
            notes: legacy.notes,
            status: legacy.status,
          },
        },
      });
      const oldImmunization = await db.clinicalSummaryItem.create({
        data: {
          id: legacyImmunizationId,
          patientId,
          authorId: doctorId,
          kind: 'immunization',
          content: {
            kind: 'immunization',
            name: 'Retired vaccine',
            administeredOn: '2026-10-01',
            lotNumber: null,
            nextDueOn: null,
          },
          source: 'Legacy chart',
          notes: null,
        },
      });
      await db.clinicalSummaryRevision.create({
        data: {
          itemId: oldImmunization.id,
          authorId: doctorId,
          revision: 1,
          action: 'create',
          snapshot: {
            content: oldImmunization.content,
            source: oldImmunization.source,
            notes: oldImmunization.notes,
            status: oldImmunization.status,
          },
        },
      });

      const medication = await client
        .post(path)
        .auth(token, { type: 'bearer' })
        .send({
          content: {
            kind: 'medication',
            name: 'Synthetic tablet',
            dose: '500 mg',
          },
          source: 'Synthetic medication list',
          notes: null,
        })
        .expect(201);
      expect(medication.body.content).toEqual({
        kind: 'medication',
        name: 'Synthetic tablet',
        dose: '500 mg',
      });
      const condition = await client
        .post(path)
        .auth(token, { type: 'bearer' })
        .send({
          content: { kind: 'condition', name: 'Synthetic condition' },
          source: 'Synthetic patient report',
          notes: 'Current note',
        })
        .expect(201);
      expect(condition.body.content).toEqual({
        kind: 'condition',
        name: 'Synthetic condition',
      });

      const summary = await client
        .get(path)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(
        summary.body.items.find(
          (item: { id: string }) => item.id === legacyAllergyId,
        ),
      ).toMatchObject({
        content: { kind: 'allergy', substance: 'Synthetic ragweed' },
        source: 'Legacy chart',
        notes: 'Legacy note',
      });
      expect(
        summary.body.items.some(
          (item: { id: string }) => item.id === legacyImmunizationId,
        ),
      ).toBe(false);
      expect(
        summary.body.items.find(
          (item: { id: string }) => item.id === medication.body.id,
        ).content,
      ).toEqual({
        kind: 'medication',
        name: 'Synthetic tablet',
        dose: '500 mg',
      });
      expect(
        summary.body.items.find(
          (item: { id: string }) => item.id === condition.body.id,
        ).content,
      ).toEqual({
        kind: 'condition',
        name: 'Synthetic condition',
      });

      const oldHistory = await client
        .get('/clinical-summary-items/' + legacyAllergyId + '/history')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(oldHistory.body[0].snapshot.content).toEqual({
        kind: 'allergy',
        substance: 'Synthetic ragweed',
      });

      await client
        .patch('/clinical-summary-items/' + legacyAllergyId)
        .auth(token, { type: 'bearer' })
        .send({
          expectedRevision: 1,
          reason: 'Synthetic update',
          content: { kind: 'allergy', substance: 'Synthetic ragweed' },
          source: 'Legacy chart',
          notes: 'Updated note',
        })
        .expect(200);
      const updatedHistory = await client
        .get('/clinical-summary-items/' + legacyAllergyId + '/history')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(updatedHistory.body).toHaveLength(2);
      expect(updatedHistory.body[0].snapshot.content).toEqual({
        kind: 'allergy',
        substance: 'Synthetic ragweed',
      });
      expect(updatedHistory.body[1].snapshot.content).toEqual({
        kind: 'allergy',
        substance: 'Synthetic ragweed',
      });
      const stillRetainedRevision =
        await db.clinicalSummaryRevision.findUniqueOrThrow({
          where: {
            itemId_revision: { itemId: legacyAllergyId, revision: 1 },
          },
        });
      expect(stillRetainedRevision.snapshot).toMatchObject({
        content: { reaction: 'Legacy reaction' },
      });

      await client
        .get('/clinical-summary-items/' + legacyImmunizationId + '/history')
        .auth(token, { type: 'bearer' })
        .expect(404);
      await client
        .patch('/clinical-summary-items/' + legacyImmunizationId)
        .auth(token, { type: 'bearer' })
        .send({
          expectedRevision: 1,
          reason: 'Synthetic edit',
          content: { kind: 'allergy', substance: 'Synthetic pollen' },
          source: 'Synthetic record',
          notes: null,
        })
        .expect(404);
      await client
        .post(path)
        .auth(token, { type: 'bearer' })
        .send({
          content: {
            kind: 'allergy',
            substance: 'Synthetic pollen',
            reaction: 'Retired reaction',
          },
          source: 'Synthetic record',
          notes: null,
        })
        .expect(400);
      await client
        .post(path)
        .auth(token, { type: 'bearer' })
        .send({
          content: {
            kind: 'immunization',
            name: 'Retired vaccine',
            administeredOn: '2026-10-01',
            lotNumber: null,
            nextDueOn: null,
          },
          source: 'Synthetic record',
          notes: null,
        })
        .expect(400);
    });
    afterAll(async () => {
      if (!db) return;
      await db.clinicalSummaryRevision.deleteMany({
        where: { item: { patientId } },
      });
      await db.clinicalSummaryItem.deleteMany({ where: { patientId } });
      await db.session.deleteMany({
        where: { staffId: { in: [doctorId, otherId, clerkId] } },
      });
      await db.staff.deleteMany({
        where: { id: { in: [doctorId, otherId, clerkId] } },
      });
      await db.patient.deleteMany({ where: { id: patientId } });
      await app?.close();
    });
  },
);

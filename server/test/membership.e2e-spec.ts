import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService, StaffGuard, tokenHash } from '../src/auth';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';
import { MembershipController } from '../src/membership/membership.controller';
import { MembershipService } from '../src/membership/membership.service';

// Public HTTP seam; no migration or reset is performed by this acceptance check.
describe.skipIf(!process.env.MEMBERSHIP_E2E_DATABASE_URL)(
  'membership HTTP acceptance',
  () => {
    let app: NestExpressApplication;
    let db: DatabaseService;
    const ids = [1, 2, 3, 4].map(
      (value) => `28000000-0000-4000-8000-00000000000${value}`,
    );
    const staffIds = [1, 2, 3].map(
      (value) => `18000000-0000-4000-8000-00000000000${value}`,
    );
    const tokens = ['m'.repeat(43), 'n'.repeat(43), 'o'.repeat(43)];
    const createdPatients: string[] = [];
    const createdStaff: string[] = [];
    const eligibility = {
      state: 'active',
      effectiveStart: '2026-01-01',
      effectiveEnd: '2026-12-31',
    };
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.MEMBERSHIP_E2E_DATABASE_URL;
      process.env.SERVER_MODE = 'EDGE';
      const module = await Test.createTestingModule({
        controllers: [MembershipController],
        providers: [
          MembershipService,
          DatabaseService,
          AuthService,
          StaffGuard,
        ],
      }).compile();
      db = module.get(DatabaseService);
      for (const [index, id] of ids.entries()) {
        await db.patient.create({
          data: {
            id,
            fullName: `Synthetic family ${index + 1}`,
            dateOfBirth: [
              '1980-01-01',
              '1982-01-01',
              '2010-01-01',
              '1950-01-01',
            ][index],
          },
        });
        createdPatients.push(id);
      }
      for (const [index, id] of staffIds.entries()) {
        await db.staff.create({
          data: {
            id,
            username: `membership-${id}`,
            passwordHash: 'unused',
            displayName: 'Synthetic membership staff',
            role: ['clerk', 'doctor', 'medtech'][index],
          },
        });
        createdStaff.push(id);
        await db.session.create({
          data: {
            tokenHash: tokenHash(tokens[index]),
            staffId: id,
            expiresAt: new Date(Date.now() + 120000),
          },
        });
      }
      app = module.createNestApplication<NestExpressApplication>({
        bodyParser: false,
      });
      configureHttp(app);
      await app.init();
    });
    it('shares explicit family eligibility, guards links and revisions, and preserves removed/corrected history', async () => {
      const client = request(app.getHttpServer());
      const path = `/patients/${ids[0]}/family?asOf=2026-10-15`;
      await client.get(path).expect(401);
      await client.get(path).auth(tokens[2], { type: 'bearer' }).expect(403);
      const empty = await client
        .get(path)
        .auth(tokens[0], { type: 'bearer' })
        .expect(200);
      expect(empty.body).toMatchObject({ membership: null, memberOf: [] });
      const membership = await client
        .post(`/patients/${ids[0]}/membership`)
        .auth(tokens[0], { type: 'bearer' })
        .send({ memberNumber: 'SYNTHETIC-HMO-18', ...eligibility })
        .expect(201);
      const membershipId = membership.body.id as string;
      await client
        .post(`/patients/${ids[1]}/membership`)
        .auth(tokens[1], { type: 'bearer' })
        .send({ memberNumber: 'DENIED', ...eligibility })
        .expect(403);
      for (const [index, relationship] of [
        'spouse',
        'child',
        'parent',
      ].entries()) {
        await client
          .post(`/memberships/${membershipId}/dependents`)
          .auth(tokens[0], { type: 'bearer' })
          .send({
            dependentPatientId: ids[index + 1],
            relationship,
            ...eligibility,
          })
          .expect(201);
      }
      await client
        .post(`/memberships/${membershipId}/dependents`)
        .auth(tokens[0], { type: 'bearer' })
        .send({
          dependentPatientId: ids[0],
          relationship: 'spouse',
          ...eligibility,
        })
        .expect(400);
      await client
        .post(`/memberships/${membershipId}/dependents`)
        .auth(tokens[0], { type: 'bearer' })
        .send({
          dependentPatientId: ids[2],
          relationship: 'child',
          ...eligibility,
        })
        .expect(409);
      const dependent = await client
        .get(`/patients/${ids[2]}/family?asOf=2026-10-15`)
        .auth(tokens[1], { type: 'bearer' })
        .expect(200);
      expect(dependent.body.memberOf[0]).toMatchObject({
        membershipId,
        relationship: 'child',
        eligibility: 'eligible',
        memberNumber: null,
        member: { id: ids[0] },
      });
      const linkId = dependent.body.memberOf[0].id as string;
      const childMembership = await client
        .post(`/patients/${ids[2]}/membership`)
        .auth(tokens[0], { type: 'bearer' })
        .send({ memberNumber: 'SYNTHETIC-HMO-18-CHILD', ...eligibility })
        .expect(201);
      await client
        .post(`/memberships/${childMembership.body.id as string}/dependents`)
        .auth(tokens[0], { type: 'bearer' })
        .send({
          dependentPatientId: ids[0],
          relationship: 'parent',
          ...eligibility,
        })
        .expect(400);
      await client
        .post(`/dependent-links/${linkId}/corrections`)
        .auth(tokens[0], { type: 'bearer' })
        .send({
          dependentPatientId: ids[2],
          relationship: 'child',
          expectedRevision: 1,
          reason: 'Corrected eligibility end',
          ...eligibility,
          effectiveEnd: '2026-11-30',
        })
        .expect(201);
      await client
        .post(`/dependent-links/${linkId}/unlink`)
        .auth(tokens[0], { type: 'bearer' })
        .send({ expectedRevision: 1, reason: 'Stale request' })
        .expect(409);
      await client
        .post(`/dependent-links/${linkId}/unlink`)
        .auth(tokens[0], { type: 'bearer' })
        .send({ expectedRevision: 2, reason: 'Eligibility ended' })
        .expect(201);
      const history = await client
        .get(`/dependent-links/${linkId}/history`)
        .auth(tokens[0], { type: 'bearer' })
        .expect(200);
      expect(
        history.body.map((event: { action: string }) => event.action),
      ).toEqual(['unlink', 'correct', 'create']);
      expect(history.body[2].snapshot.effectiveEnd).toBe('2026-12-31');
      const expired = await client
        .get(`/patients/${ids[0]}/family?asOf=2027-01-01`)
        .auth(tokens[0], { type: 'bearer' })
        .expect(200);
      expect(expired.body.membership.eligibility).toBe('expired');
      await client
        .patch(`/memberships/${membershipId}`)
        .auth(tokens[0], { type: 'bearer' })
        .send({
          memberNumber: 'SYNTHETIC-HMO-18',
          ...eligibility,
          state: 'inactive',
          expectedRevision: 1,
          reason: 'Membership ended',
        })
        .expect(200);
      const inactive = await client
        .get(path)
        .auth(tokens[0], { type: 'bearer' })
        .expect(200);
      expect(inactive.body.membership.eligibility).toBe('inactive');
    });
    afterAll(async () => {
      if (!db) return;
      const memberships = await db.membership.findMany({
        where: { patientId: { in: createdPatients } },
        select: { id: true },
      });
      const membershipIds = memberships.map((membership) => membership.id);
      await db.dependentLinkRevision.deleteMany({
        where: { link: { membershipId: { in: membershipIds } } },
      });
      await db.dependentLink.deleteMany({
        where: { membershipId: { in: membershipIds } },
      });
      await db.membershipRevision.deleteMany({
        where: { membershipId: { in: membershipIds } },
      });
      await db.membership.deleteMany({ where: { id: { in: membershipIds } } });
      await db.session.deleteMany({ where: { staffId: { in: createdStaff } } });
      await db.staff.deleteMany({ where: { id: { in: createdStaff } } });
      await db.patient.deleteMany({ where: { id: { in: createdPatients } } });
      await app?.close();
    });
  },
);

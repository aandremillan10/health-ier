import { Test } from '@nestjs/testing';
import type { ExecutionContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { expect, it } from 'vitest';
import { StaffGuard } from '../src/auth';
import { AuditController } from '../src/audit/audit.controller';
import { AuditService } from '../src/audit/audit.service';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';

it('head can filter bounded audit metadata; ordinary staff cannot read the trail', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const calls: unknown[] = [];
  const module = await Test.createTestingModule({
    controllers: [AuditController],
    providers: [
      AuditService,
      {
        provide: DatabaseService,
        useValue: {
          auditEvent: {
            findMany: async (query: unknown): Promise<unknown[]> => {
              calls.push(query);
              return [];
            },
          },
          staff: { findMany: async (): Promise<unknown[]> => [] },
        },
      },
    ],
  })
    .overrideGuard(StaffGuard)
    .useValue({
      canActivate(context: ExecutionContext): boolean {
        const req = context
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; staff: unknown }>();
        req.staff = {
          id,
          displayName: 'Synthetic doctor',
          role: 'doctor',
          isHead: req.headers['x-test-head'] === 'yes',
        };
        return true;
      },
    })
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureHttp(app);
  await app.init();
  try {
    await request(app.getHttpServer())
      .get('/audit-events?from=2026-10-01&to=2026-10-15')
      .expect(403);
    const response = await request(app.getHttpServer())
      .get(
        `/audit-events?from=2026-10-01&to=2026-10-15&patientId=${id}&action=view`,
      )
      .set('x-test-head', 'yes')
      .expect(200);
    expect(response.body).toEqual({ events: [], nextCursor: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      take: 51,
      where: {
        patientId: id,
        action: 'view',
        createdAt: {
          gte: new Date('2026-09-30T16:00:00Z'),
          lt: new Date('2026-10-15T16:00:00Z'),
        },
      },
    });
    await request(app.getHttpServer())
      .get('/audit-events?from=2026-10-20&to=2026-10-01')
      .set('x-test-head', 'yes')
      .expect(400);
  } finally {
    await app.close();
  }
});

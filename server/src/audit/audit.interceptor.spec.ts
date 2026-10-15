import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { lastValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service';
import { AuditInterceptor } from './audit.interceptor';

const staff = {
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Synthetic doctor',
  role: 'doctor',
  isHead: false,
};
const patientId = '20000000-0000-4000-8000-000000000001';
const id = '30000000-0000-4000-8000-000000000001';
async function fixture(): Promise<{
  interceptor: AuditInterceptor;
  create: ReturnType<typeof vi.fn>;
}> {
  const create = vi.fn().mockResolvedValue({});
  const module = await Test.createTestingModule({
    providers: [
      AuditInterceptor,
      { provide: DatabaseService, useValue: { auditEvent: { create } } },
    ],
  }).compile();
  return { interceptor: module.get(AuditInterceptor), create };
}
describe('audit interceptor sensitive operation metadata', () => {
  it('records a patient open without copying returned clinical contents, request contents or bearer credentials', async () => {
    const { interceptor, create } = await fixture();
    const context = new ExecutionContextHost([
      {
        staff,
        path: `/patients/${patientId}`,
        method: 'GET',
        params: { id: patientId },
        ip: '192.0.2.10',
        headers: { authorization: 'Bearer synthetic-secret-token' },
        body: { password: 'synthetic-secret-password' },
      },
    ]);
    const value = {
      id: patientId,
      clinicalNote: 'Synthetic private clinical note',
    };
    expect(
      await lastValueFrom(
        interceptor.intercept(context, { handle: () => of(value) }),
      ),
    ).toBe(value);
    expect(create).toHaveBeenCalledExactlyOnceWith({
      data: {
        actorId: staff.id,
        actorName: staff.displayName,
        actorRole: staff.role,
        action: 'view',
        patientId,
        resourceType: 'patients',
        resourceId: patientId,
        workstation: '192.0.2.10',
        outcome: 'success',
        source: 'clinic-api',
      },
    });
    expect(JSON.stringify(create.mock.calls)).not.toMatch(
      /secret|clinicalNote|private clinical/,
    );
  });
  it.each([
    ['PATCH', `/entries/${id}`, 'change'],
    ['POST', `/entries/${id}/finalize`, 'finalize'],
    ['POST', `/entries/${id}/corrections`, 'correction'],
    ['POST', '/reports/export', 'export'],
    ['POST', `/patients/${patientId}/historical-documents`, 'import'],
  ])(
    'attributes failed %s %s as %s and preserves the original failure',
    async (method, path, action) => {
      const { interceptor, create } = await fixture();
      const failure = new Error('synthetic-private-failure');
      const context = new ExecutionContextHost([
        {
          staff,
          method,
          path,
          params: { id, patientId },
          body: { clinicalNote: 'private', contentBase64: 'private-file' },
          ip: '192.0.2.10',
        },
      ]);
      await expect(
        lastValueFrom(
          interceptor.intercept(context, {
            handle: () => throwError(() => failure),
          }),
        ),
      ).rejects.toBe(failure);
      expect(create).toHaveBeenCalledExactlyOnceWith({
        data: expect.objectContaining({
          actorId: staff.id,
          resourceId: id,
          patientId,
          action,
          outcome: 'failure',
        }),
      });
      expect(JSON.stringify(create.mock.calls)).not.toMatch(
        /private|clinicalNote|contentBase64/,
      );
    },
  );
  it('preserves the original denial when failure logging cannot reach the database', async () => {
    const { interceptor, create } = await fixture();
    create.mockRejectedValue(new Error('database-private-detail'));
    const original = new Error('original-safe-denial');
    const context = new ExecutionContextHost([
      { staff, path: `/entries/${id}`, method: 'PATCH', params: { id } },
    ]);
    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => original),
        }),
      ),
    ).rejects.toBe(original);
  });
});

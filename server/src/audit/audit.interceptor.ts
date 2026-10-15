import { Injectable } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, mergeMap } from 'rxjs';
import type { Observable } from 'rxjs';
import type { StaffRequest } from '../auth';
import { DatabaseService } from '../database/database.service';
import { recordAudit, setAuditWorkstation } from './audit.service';
import type { AuditAction, AuditInput } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly db: DatabaseService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<StaffRequest>();
    if (req.staff) setAuditWorkstation(req.staff, req.ip);
    if (
      !req.staff ||
      !/^\/(patients|entries|vitals|documents|clinical-summary-items|lab-orders|lab-results|appointments|referrals|reports)(\/|$)/.test(
        req.path,
      )
    )
      return next.handle();
    const resourceType = req.path.includes('/historical-documents')
      ? 'historical-document'
      : req.path.split('/')[1];
    const validId = (value: unknown): string | undefined =>
      typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
        ? value
        : undefined;
    const metadata = (value?: unknown): Omit<AuditInput, 'action'> => {
      const row =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      return {
        resourceType,
        resourceId: validId(row.id) ?? validId(req.params.id),
        patientId:
          validId(row.patientId) ??
          validId(req.params.patientId) ??
          (resourceType === 'patients' ? validId(req.params.id) : undefined),
        workstation: req.ip?.slice(0, 64),
      };
    };
    return next.handle().pipe(
      mergeMap(async (value: unknown): Promise<unknown> => {
        if (req.method === 'GET' || req.path === '/documents/preview') {
          await recordAudit(this.db, req.staff, {
            ...metadata(value),
            action: 'view',
          });
        }
        return value;
      }),
      catchError(async (error: unknown): Promise<never> => {
        const action: AuditAction =
          req.path.endsWith('/historical-documents') && req.method === 'POST'
            ? 'import'
            : req.method === 'GET' || req.path === '/documents/preview'
              ? 'view'
              : req.path.includes('correction')
                ? 'correction'
                : req.path === '/reports/export'
                  ? 'export'
                  : req.path.endsWith('/finalize')
                    ? 'finalize'
                    : req.method === 'PATCH' ||
                        /\/(transitions|inactivate|unlink|accept|start|cancel|reject|review|complete)$/.test(
                          req.path,
                        )
                      ? 'change'
                      : 'create';
        try {
          await recordAudit(this.db, req.staff, {
            ...metadata(),
            action,
            outcome: 'failure',
          });
        } catch {
          /* Preserve the original safe failure when the database is unavailable. */
        }
        throw error;
      }),
    );
  }
}

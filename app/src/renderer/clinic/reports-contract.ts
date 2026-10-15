import type { Result as WireResult } from '../../shared/clinic-api';
import type {
  ClinicReport,
  OperationsRequests,
  OperationsResponses,
  ReportQuery,
} from '../../shared/operations-api';
import type { Result } from './contract';

export interface ReportsApi {
  readReport(input: ReportQuery): Promise<Result<ClinicReport>>;
  exportReport(
    input: OperationsRequests['exportReport'],
  ): Promise<Result<OperationsResponses['exportReport']>>;
}
export interface ReportsWireApi {
  readReport(input: ReportQuery): Promise<WireResult<ClinicReport>>;
  exportReport(
    input: OperationsRequests['exportReport'],
  ): Promise<WireResult<OperationsResponses['exportReport']>>;
}
export function createReportsDesktopClient(wire: ReportsWireApi): ReportsApi {
  async function result<T>(
    operation: Promise<WireResult<T>>,
  ): Promise<Result<T>> {
    const response = await operation;
    if (response.ok) return response;
    const error = response.error;
    return {
      ok: false,
      error: {
        code:
          error.code === 'FORBIDDEN'
            ? 'DENIED'
            : error.code === 'SESSION_CHANGED'
              ? 'UNAUTHENTICATED'
              : [
                    'VALIDATION',
                    'UNAUTHENTICATED',
                    'NOT_FOUND',
                    'CONFLICT',
                  ].includes(error.code)
                ? (error.code as
                    'VALIDATION' | 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT')
                : 'UNAVAILABLE',
        message: error.message,
        fieldErrors: error.fieldErrors,
        latestRevision: error.currentRevision,
      },
    };
  }
  return {
    readReport: (input) => result(wire.readReport(input)),
    exportReport: (input) => result(wire.exportReport(input)),
  };
}

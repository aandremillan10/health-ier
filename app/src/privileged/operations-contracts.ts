import type {
  OperationsRequests,
  OperationsResponses,
  AuditEvent,
  ClinicReport,
} from '../shared/operations-api';
import { auditActions } from '../shared/operations-api';
import {
  array,
  choice,
  date,
  nothing,
  nullable,
  number,
  object,
  optional,
  text,
  timestamp,
  uuid,
} from './validation';

const range = { from: date, to: date };
const fingerprint = (value: unknown): string => {
  const result = text(64, 64)(value);
  if (!/^[a-f0-9]{64}$/.test(result))
    throw new Error('Invalid report identity');
  return result;
};
const event = object<AuditEvent>({
  id: uuid,
  actorId: uuid,
  actorName: text(200, 1),
  actorRole: choice(['doctor', 'dentist', 'medtech', 'attendant', 'clerk']),
  action: choice(auditActions),
  patientId: nullable(uuid),
  resourceType: text(80, 1),
  resourceId: nullable(uuid),
  outcome: choice(['success', 'failure']),
  source: text(80, 1),
  workstation: nullable(text(64)),
  createdAt: timestamp,
});
const count = number(0, Number.MAX_SAFE_INTEGER, true);
const report = object<ClinicReport>({
  ...range,
  generatedAt: timestamp,
  fingerprint,
  totals: object<ClinicReport['totals']>({
    visits: count,
    noShows: count,
    pendingLabs: count,
    averageLabMinutes: nullable(number()),
    newPatients: count,
  }),
  daily: array(object<ClinicReport['daily'][number]>({ date, visits: count })),
  sexBreakdown: array(
    object<ClinicReport['sexBreakdown'][number]>({
      sex: choice(['female', 'male', 'other', 'not_recorded']),
      patients: count,
    }),
  ),
  departments: array(
    object<ClinicReport['departments'][number]>({
      discipline: choice(['medical', 'dental', 'laboratory']),
      patients: count,
    }),
  ),
});
export const operationsRequestGuards = {
  listAuditEvents: object<OperationsRequests['listAuditEvents']>({
    ...range,
    actorId: optional(uuid),
    patientId: optional(uuid),
    resourceId: optional(uuid),
    action: optional(choice(auditActions)),
    cursor: optional(uuid),
  }),
  listAuditActors: nothing,
  readReport: object<OperationsRequests['readReport']>(range),
  exportReport: object<OperationsRequests['exportReport']>({
    ...range,
    fingerprint,
  }),
};
export const operationsResponseGuards = {
  listAuditEvents: object<OperationsResponses['listAuditEvents']>({
    events: array(event),
    nextCursor: nullable(uuid),
  }),
  listAuditActors: array(
    object<{ id: string; displayName: string }>({
      id: uuid,
      displayName: text(200, 1),
    }),
  ),
  readReport: report,
  exportReport: object<OperationsResponses['exportReport']>({
    filename: text(150, 1),
    csv: text(2000000),
    fingerprint,
  }),
};
export function operationsRoute(
  name: keyof OperationsRequests,
  input: unknown,
): { path: string; method: 'GET' | 'POST'; body?: unknown } {
  if (name === 'listAuditActors')
    return { path: '/audit-events/actors', method: 'GET' };
  if (name === 'exportReport')
    return { path: '/reports/export', method: 'POST', body: input };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input as Record<string, string>))
    if (value !== undefined) query.set(key, value);
  return {
    path: `${name === 'listAuditEvents' ? '/audit-events' : '/reports'}?${query}`,
    method: 'GET',
  };
}

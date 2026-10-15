import type {
  LabOrder,
  LabOrderFields,
  LabResult,
  LabResultFields,
  LabValue,
  LaboratoryRequests,
  LaboratoryResponses,
} from '../shared/laboratory-api';
import type { Guard } from './validation';
import {
  array,
  choice,
  date,
  nullable,
  object,
  record,
  revision,
  text,
  timestamp,
  uuid,
} from './validation';

function bounded<T>(guard: Guard<T>, min: number, max: number): Guard<T[]> {
  return (input): T[] => {
    const parsed = array(guard)(input);
    if (parsed.length < min || parsed.length > max)
      throw new Error('Invalid laboratory list length');
    return parsed;
  };
}
const labValue = object<LabValue>({
  test: text(200, 1),
  value: text(1000, 1),
  unit: nullable(text(100)),
  referenceRange: nullable(text(200)),
  flag: choice(['normal', 'abnormal', 'critical', 'unspecified']),
});
const resultFields = {
  values: bounded(labValue, 1, 100),
  notes: nullable(text(4000)),
} satisfies { [K in keyof LabResultFields]: Guard<LabResultFields[K]> };
const orderFields = {
  requestedTests: bounded(text(200, 1), 1, 50),
  clinicalContext: nullable(text(4000)),
  priority: choice(['routine', 'urgent']),
  requestedFor: date,
} satisfies { [K in keyof LabOrderFields]: Guard<LabOrderFields[K]> };
const expected = { id: uuid, expectedRevision: revision };
const resultExpected = { ...expected, expectedOrderRevision: revision };
export const laboratoryRequestGuards = {
  listLabOrders: object<LaboratoryRequests['listLabOrders']>({
    patientId: uuid,
  }),
  listLabQueue: object<LaboratoryRequests['listLabQueue']>({
    scope: choice(['pending', 'all']),
  }),
  createLabOrder: object<LaboratoryRequests['createLabOrder']>({
    patientId: uuid,
    ...orderFields,
  }),
  startLabOrder: object<LaboratoryRequests['startLabOrder']>(expected),
  cancelLabOrder: object<LaboratoryRequests['cancelLabOrder']>({
    ...expected,
    reason: text(4000, 1),
  }),
  rejectLabOrder: object<LaboratoryRequests['rejectLabOrder']>({
    ...expected,
    reason: text(4000, 1),
  }),
  saveLabResult: object<LaboratoryRequests['saveLabResult']>({
    orderId: uuid,
    expectedRevision: revision,
    ...resultFields,
  }),
  finalizeLabResult:
    object<LaboratoryRequests['finalizeLabResult']>(resultExpected),
  correctLabResult: object<LaboratoryRequests['correctLabResult']>({
    ...resultExpected,
    reason: text(4000, 1),
    ...resultFields,
  }),
  reviewLabOrder: object<LaboratoryRequests['reviewLabOrder']>(expected),
} satisfies { [K in keyof LaboratoryRequests]: Guard<LaboratoryRequests[K]> };
const parseResult = object<LabResult>({
  id: uuid,
  orderId: uuid,
  authorId: uuid,
  authorName: text(200, 1),
  status: choice(['draft', 'finalized']),
  revision,
  ...resultFields,
  correctionOfId: nullable(uuid),
  correctionReason: nullable(text(4000, 1)),
  sourceRevision: nullable(revision),
  finalizedAt: nullable(timestamp),
  createdAt: timestamp,
  updatedAt: timestamp,
});
const parseOrder = object<LabOrder>({
  id: uuid,
  patientId: uuid,
  patient: object<LabOrder['patient']>({
    id: uuid,
    revision,
    fullName: text(200, 1),
    sex: nullable(text(50)),
    dateOfBirth: nullable(date),
  }),
  orderingProviderId: uuid,
  orderingProviderName: text(200, 1),
  discipline: choice(['medical', 'dental']),
  ...orderFields,
  status: choice([
    'ordered',
    'in_progress',
    'resulted',
    'reviewed',
    'cancelled',
    'rejected',
  ]),
  revision,
  startedAt: nullable(timestamp),
  finalizedAt: nullable(timestamp),
  reviewedAt: nullable(timestamp),
  reviewedById: nullable(uuid),
  closedAt: nullable(timestamp),
  closeReason: nullable(text(4000, 1)),
  createdAt: timestamp,
  updatedAt: timestamp,
  results: bounded(parseResult, 0, 10000),
});
export function laboratoryOrder(input: unknown): LabOrder {
  const order = parseOrder(input);
  if (
    order.patientId !== order.patient.id ||
    order.results.some((result) => result.orderId !== order.id)
  )
    throw new Error('Laboratory identity mismatch');
  const ids = new Set(order.results.map((result) => result.id));
  if (
    ids.size !== order.results.length ||
    order.results.some(
      (result) =>
        result.correctionOfId !== null && !ids.has(result.correctionOfId),
    )
  )
    throw new Error('Laboratory correction identity mismatch');
  return order;
}
export const laboratoryResponseGuards = {
  listLabOrders: array(laboratoryOrder),
  listLabQueue: array(laboratoryOrder),
  createLabOrder: laboratoryOrder,
  startLabOrder: laboratoryOrder,
  cancelLabOrder: laboratoryOrder,
  rejectLabOrder: laboratoryOrder,
  saveLabResult: laboratoryOrder,
  finalizeLabResult: laboratoryOrder,
  correctLabResult: laboratoryOrder,
  reviewLabOrder: laboratoryOrder,
} satisfies { [K in keyof LaboratoryResponses]: Guard<LaboratoryResponses[K]> };
export interface LaboratoryRoute {
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
}
export function laboratoryRoute(
  name: string,
  input: unknown,
): LaboratoryRoute | undefined {
  if (!Object.hasOwn(laboratoryRequestGuards, name)) return undefined;
  const key = name as keyof LaboratoryRequests;
  const value = record(laboratoryRequestGuards[key](input));
  const { id, patientId, orderId, ...content } = value;
  switch (key) {
    case 'listLabOrders':
      return {
        path: `/patients/${patientId as string}/lab-orders`,
        method: 'GET',
      };
    case 'listLabQueue':
      return {
        path: `/laboratory/queue?scope=${value.scope as string}`,
        method: 'GET',
      };
    case 'createLabOrder':
      return {
        path: `/patients/${patientId as string}/lab-orders`,
        method: 'POST',
        body: content,
      };
    case 'saveLabResult':
      return {
        path: `/lab-orders/${orderId as string}/result`,
        method: 'POST',
        body: content,
      };
    case 'finalizeLabResult':
      return {
        path: `/lab-results/${id as string}/finalize`,
        method: 'POST',
        body: content,
      };
    case 'correctLabResult':
      return {
        path: `/lab-results/${id as string}/corrections`,
        method: 'POST',
        body: content,
      };
    case 'startLabOrder':
      return {
        path: `/lab-orders/${id as string}/start`,
        method: 'POST',
        body: content,
      };
    case 'cancelLabOrder':
      return {
        path: `/lab-orders/${id as string}/cancel`,
        method: 'POST',
        body: content,
      };
    case 'rejectLabOrder':
      return {
        path: `/lab-orders/${id as string}/reject`,
        method: 'POST',
        body: content,
      };
    case 'reviewLabOrder':
      return {
        path: `/lab-orders/${id as string}/review`,
        method: 'POST',
        body: content,
      };
  }
}

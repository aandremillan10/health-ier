import type {
  Referral,
  ReferralCompletion,
  ReferralFields,
  ReferralsRequests,
  ReferralsResponses,
} from '../shared/referrals-api';
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

const unit = choice(['medical', 'dental', 'laboratory']);
const fields = {
  receivingDiscipline: unit,
  reason: text(4000, 1),
  labOrderId: nullable(uuid),
} satisfies { [K in keyof ReferralFields]: Guard<ReferralFields[K]> };
const completion = {
  completionNote: nullable(text(4000)),
  completionReference: nullable(text(200)),
  labResultId: nullable(uuid),
} satisfies { [K in keyof ReferralCompletion]: Guard<ReferralCompletion[K]> };
const expected = { id: uuid, expectedRevision: revision };
const scope = { scope: choice(['pending', 'all']) };
export const referralsRequestGuards = {
  listReferrals: object<ReferralsRequests['listReferrals']>({
    patientId: uuid,
  }),
  listReferralInbox: object<ReferralsRequests['listReferralInbox']>(scope),
  listSentReferrals: object<ReferralsRequests['listSentReferrals']>(scope),
  createReferral: object<ReferralsRequests['createReferral']>({
    patientId: uuid,
    ...fields,
  }),
  acceptReferral: object<ReferralsRequests['acceptReferral']>(expected),
  startReferral: object<ReferralsRequests['startReferral']>(expected),
  completeReferral: object<ReferralsRequests['completeReferral']>({
    ...expected,
    ...completion,
  }),
  cancelReferral: object<ReferralsRequests['cancelReferral']>({
    ...expected,
    reason: text(4000, 1),
  }),
  rejectReferral: object<ReferralsRequests['rejectReferral']>({
    ...expected,
    reason: text(4000, 1),
  }),
} satisfies { [K in keyof ReferralsRequests]: Guard<ReferralsRequests[K]> };
const parseReferral = object<Referral>({
  id: uuid,
  patientId: uuid,
  patient: object<Referral['patient']>({
    id: uuid,
    revision,
    fullName: text(200, 1),
    sex: nullable(text(50)),
    dateOfBirth: nullable(date),
  }),
  originStaffId: uuid,
  originStaffName: text(200, 1),
  originDiscipline: choice(['medical', 'dental']),
  ...fields,
  status: choice([
    'pending',
    'accepted',
    'in_progress',
    'completed',
    'cancelled',
    'rejected',
  ]),
  revision,
  acceptedAt: nullable(timestamp),
  acceptedById: nullable(uuid),
  acceptedByName: nullable(text(200, 1)),
  startedAt: nullable(timestamp),
  startedById: nullable(uuid),
  startedByName: nullable(text(200, 1)),
  completedAt: nullable(timestamp),
  completedById: nullable(uuid),
  completedByName: nullable(text(200, 1)),
  ...completion,
  closedAt: nullable(timestamp),
  closedById: nullable(uuid),
  closedByName: nullable(text(200, 1)),
  closeReason: nullable(text(4000, 1)),
  labOrder: nullable(
    object<NonNullable<Referral['labOrder']>>({
      id: uuid,
      requestedTests: array(text(200, 1)),
      status: choice([
        'ordered',
        'in_progress',
        'resulted',
        'reviewed',
        'cancelled',
        'rejected',
      ]),
    }),
  ),
  labResult: nullable(
    object<NonNullable<Referral['labResult']>>({
      id: uuid,
      orderId: uuid,
      finalizedAt: nullable(timestamp),
      correctionOfId: nullable(uuid),
      supersededById: nullable(uuid),
    }),
  ),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export function referral(input: unknown): Referral {
  const record = parseReferral(input);
  if (
    record.patientId !== record.patient.id ||
    record.labOrderId !== (record.labOrder?.id ?? null) ||
    record.labResultId !== (record.labResult?.id ?? null)
  )
    throw new Error('Referral identity mismatch');
  if (
    (record.receivingDiscipline === 'laboratory') !==
      (record.labOrderId !== null) ||
    (record.labResult && record.labResult.orderId !== record.labOrderId)
  )
    throw new Error('Referral laboratory link mismatch');
  if (
    record.status === 'completed' &&
    (!record.completedAt ||
      !record.completedById ||
      (record.receivingDiscipline === 'laboratory'
        ? !record.labResultId
        : !record.completionNote?.trim()))
  )
    throw new Error('Incomplete referral completion provenance');
  return record;
}
export const referralsResponseGuards = {
  listReferrals: array(referral),
  listReferralInbox: array(referral),
  listSentReferrals: array(referral),
  createReferral: referral,
  acceptReferral: referral,
  startReferral: referral,
  completeReferral: referral,
  cancelReferral: referral,
  rejectReferral: referral,
} satisfies { [K in keyof ReferralsResponses]: Guard<ReferralsResponses[K]> };
export interface ReferralRoute {
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
}
export function referralsRoute(
  name: string,
  input: unknown,
): ReferralRoute | undefined {
  if (!Object.hasOwn(referralsRequestGuards, name)) return undefined;
  const key = name as keyof ReferralsRequests;
  const value = record(referralsRequestGuards[key](input));
  const { id, patientId, ...body } = value;
  switch (key) {
    case 'listReferrals':
      return {
        path: `/patients/${patientId as string}/referrals`,
        method: 'GET',
      };
    case 'listReferralInbox':
      return {
        path: `/referrals/inbox?scope=${value.scope as string}`,
        method: 'GET',
      };
    case 'listSentReferrals':
      return {
        path: `/referrals/sent?scope=${value.scope as string}`,
        method: 'GET',
      };
    case 'createReferral':
      return {
        path: `/patients/${patientId as string}/referrals`,
        method: 'POST',
        body,
      };
    case 'acceptReferral':
      return {
        path: `/referrals/${id as string}/accept`,
        method: 'POST',
        body,
      };
    case 'startReferral':
      return { path: `/referrals/${id as string}/start`, method: 'POST', body };
    case 'completeReferral':
      return {
        path: `/referrals/${id as string}/complete`,
        method: 'POST',
        body,
      };
    case 'cancelReferral':
      return {
        path: `/referrals/${id as string}/cancel`,
        method: 'POST',
        body,
      };
    case 'rejectReferral':
      return {
        path: `/referrals/${id as string}/reject`,
        method: 'POST',
        body,
      };
  }
}

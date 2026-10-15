import type {
  ClinicalSummary,
  SummaryContent,
  SummaryFields,
  SummaryHistory,
  SummaryItem,
  SummaryRequests,
  SummaryResponses,
} from '../shared/clinical-summary';
import {
  array,
  boolean,
  choice,
  type Guard,
  nullable,
  object,
  record,
  revision,
  text,
  timestamp,
  uuid,
} from './validation';

const required =
  (max: number): Guard<string> =>
  (value): string => {
    const parsed = text(max, 1)(value);
    if (!parsed.trim()) throw new Error('Required text');
    return parsed;
  };
const contentGuards = {
  allergy: object<Extract<SummaryContent, { kind: 'allergy' }>>({
    kind: choice(['allergy']),
    substance: required(200),
  }),
  medication: object<Extract<SummaryContent, { kind: 'medication' }>>({
    kind: choice(['medication']),
    name: required(200),
    dose: nullable(text(200)),
  }),
  condition: object<Extract<SummaryContent, { kind: 'condition' }>>({
    kind: choice(['condition']),
    name: required(200),
  }),
};
export const summaryContent: Guard<SummaryContent> = (
  value,
): SummaryContent => {
  const kind = choice(['allergy', 'medication', 'condition'])(
    record(value).kind,
  );
  return contentGuards[kind](value);
};
const fields = {
  content: summaryContent,
  source: required(1000),
  notes: nullable(text(4000)),
} satisfies { [K in keyof SummaryFields]: Guard<SummaryFields[K]> };
const status = choice(['active', 'inactive']);
export const summaryItem = object<SummaryItem>({
  ...fields,
  id: uuid,
  patientId: uuid,
  authorId: uuid,
  authorName: required(200),
  status,
  revision,
  createdAt: timestamp,
  updatedAt: timestamp,
  canEdit: boolean,
});
const summary = object<ClinicalSummary>({
  patientId: uuid,
  canCreate: boolean,
  items: array(summaryItem),
});
const history = object<SummaryHistory>({
  id: uuid,
  itemId: uuid,
  authorId: uuid,
  authorName: required(200),
  revision,
  action: choice(['create', 'update', 'correct', 'inactivate']),
  reason: nullable(text(4000)),
  snapshot: object<SummaryHistory['snapshot']>({ ...fields, status }),
  createdAt: timestamp,
});
const change = {
  ...fields,
  id: uuid,
  expectedRevision: revision,
  reason: required(4000),
};
export const summaryRequestGuards = {
  readClinicalSummary: object<SummaryRequests['readClinicalSummary']>({
    patientId: uuid,
  }),
  createSummaryItem: object<SummaryRequests['createSummaryItem']>({
    ...fields,
    patientId: uuid,
  }),
  updateSummaryItem: object<SummaryRequests['updateSummaryItem']>(change),
  correctSummaryItem: object<SummaryRequests['correctSummaryItem']>(change),
  inactivateSummaryItem: object<SummaryRequests['inactivateSummaryItem']>({
    id: uuid,
    expectedRevision: revision,
    reason: required(4000),
  }),
  readSummaryHistory: object<SummaryRequests['readSummaryHistory']>({
    id: uuid,
  }),
} satisfies { [K in keyof SummaryRequests]: Guard<SummaryRequests[K]> };
export const summaryResponseGuards = {
  readClinicalSummary: (value: unknown): ClinicalSummary => {
    const parsed = summary(value);
    if (parsed.items.some((item) => item.patientId !== parsed.patientId))
      throw new Error('Summary patient mismatch');
    return parsed;
  },
  createSummaryItem: summaryItem,
  updateSummaryItem: summaryItem,
  correctSummaryItem: summaryItem,
  inactivateSummaryItem: summaryItem,
  readSummaryHistory: array(history),
} satisfies { [K in keyof SummaryResponses]: Guard<SummaryResponses[K]> };

export function clinicalSummaryRoute(
  name: keyof SummaryRequests,
  input: SummaryRequests[keyof SummaryRequests],
): { path: string; method: 'GET' | 'POST' | 'PATCH'; body?: unknown } {
  const parsed = record(input);
  switch (name) {
    case 'readClinicalSummary':
      return {
        path: `/patients/${uuid(parsed.patientId)}/clinical-summary`,
        method: 'GET',
      };
    case 'createSummaryItem': {
      const { patientId, ...body } =
        summaryRequestGuards.createSummaryItem(input);
      return {
        path: `/patients/${patientId}/clinical-summary`,
        method: 'POST',
        body,
      };
    }
    case 'readSummaryHistory':
      return {
        path: `/clinical-summary-items/${uuid(parsed.id)}/history`,
        method: 'GET',
      };
    case 'updateSummaryItem':
    case 'correctSummaryItem': {
      const { id, ...body } = summaryRequestGuards[name](input);
      return {
        path: `/clinical-summary-items/${id}${name === 'correctSummaryItem' ? '/corrections' : ''}`,
        method: name === 'updateSummaryItem' ? 'PATCH' : 'POST',
        body,
      };
    }
    case 'inactivateSummaryItem': {
      const { id, ...body } = summaryRequestGuards.inactivateSummaryItem(input);
      return {
        path: `/clinical-summary-items/${id}/inactivate`,
        method: 'POST',
        body,
      };
    }
  }
}

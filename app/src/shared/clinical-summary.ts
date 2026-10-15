import type { Result, Staff } from './clinic-api';

export type SummaryContent =
  | {
      kind: 'allergy';
      substance: string;
    }
  | {
      kind: 'medication';
      name: string;
      dose: string | null;
    }
  | {
      kind: 'condition';
      name: string;
    };

export interface SummaryFields {
  content: SummaryContent;
  source: string;
  notes: string | null;
}
export interface SummaryItem extends SummaryFields {
  id: string;
  patientId: string;
  authorId: string;
  authorName: string;
  status: 'active' | 'inactive';
  revision: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}
export interface ClinicalSummary {
  patientId: string;
  canCreate: boolean;
  items: SummaryItem[];
}
export interface SummaryHistory {
  id: string;
  itemId: string;
  authorId: string;
  authorName: string;
  revision: number;
  action: 'create' | 'update' | 'correct' | 'inactivate';
  reason: string | null;
  snapshot: SummaryFields & { status: 'active' | 'inactive' };
  createdAt: string;
}
export interface SummaryRequests {
  readClinicalSummary: { patientId: string };
  createSummaryItem: SummaryFields & { patientId: string };
  updateSummaryItem: SummaryFields & {
    id: string;
    expectedRevision: number;
    reason: string;
  };
  correctSummaryItem: SummaryFields & {
    id: string;
    expectedRevision: number;
    reason: string;
  };
  inactivateSummaryItem: {
    id: string;
    expectedRevision: number;
    reason: string;
  };
  readSummaryHistory: { id: string };
}
export interface SummaryResponses {
  readClinicalSummary: ClinicalSummary;
  createSummaryItem: SummaryItem;
  updateSummaryItem: SummaryItem;
  correctSummaryItem: SummaryItem;
  inactivateSummaryItem: SummaryItem;
  readSummaryHistory: SummaryHistory[];
}
export type ClinicalSummaryApi = {
  readonly [K in keyof SummaryRequests]: (
    input: SummaryRequests[K],
  ) => Promise<Result<SummaryResponses[K]>>;
};
export function canReadClinicalSummary(staff: Staff): boolean {
  return staff.role === 'doctor' || staff.role === 'dentist' || staff.isHead;
}

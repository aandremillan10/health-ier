import type { Result, Staff } from './clinic-api';

export type SummaryContent =
  | {
      kind: 'allergy';
      substance: string;
      reaction: string | null;
      severity: 'unknown' | 'mild' | 'moderate' | 'severe';
      onsetDate: string | null;
    }
  | {
      kind: 'medication';
      name: string;
      dose: string | null;
      route: string | null;
      frequency: string | null;
      startDate: string | null;
      endDate: string | null;
    }
  | {
      kind: 'condition';
      name: string;
      code: string | null;
      onsetDate: string | null;
      resolvedDate: string | null;
    }
  | {
      kind: 'immunization';
      name: string;
      administeredOn: string;
      lotNumber: string | null;
      nextDueOn: string | null;
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

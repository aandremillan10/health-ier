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

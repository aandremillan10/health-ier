export type SummaryContent =
  | { kind: 'allergy'; substance: string }
  | { kind: 'medication'; name: string; dose: string | null }
  | { kind: 'condition'; name: string };
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

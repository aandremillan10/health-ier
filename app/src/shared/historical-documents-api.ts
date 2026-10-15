export const historicalFileLimit = 10 * 1024 * 1024;
export type HistoricalDiscipline = 'medical' | 'dental' | 'laboratory';
export type HistoricalMimeType = 'application/pdf' | 'image/jpeg';
export interface HistoricalDocumentFields {
  discipline: HistoricalDiscipline;
  documentType: string;
  documentDate: string;
  description: string;
  replacesId?: string;
  replacementReason?: string;
}
export interface HistoricalDocument {
  id: string;
  patientId: string;
  discipline: HistoricalDiscipline;
  documentType: string;
  documentDate: string;
  description: string;
  filename: string;
  mimeType: HistoricalMimeType;
  byteLength: number;
  sha256: string;
  uploaderId: string;
  uploaderName: string;
  createdAt: string;
  replacesId: string | null;
  replacementReason: string | null;
}
export interface HistoricalSelection {
  token: string;
  patientId: string;
  filename: string;
  mimeType: HistoricalMimeType;
  byteLength: number;
}
export interface HistoricalDocumentsRequests {
  selectHistoricalFile: { patientId: string };
  discardHistoricalFile: { selectionToken: string };
  importHistoricalDocument: HistoricalDocumentFields & {
    patientId: string;
    selectionToken: string;
  };
  listHistoricalDocuments: {
    patientId: string;
    discipline?: HistoricalDiscipline;
    cursor?: string;
  };
  readHistoricalDocument: { patientId: string; id: string };
  readHistoricalDocumentContent: { patientId: string; id: string };
}
export interface HistoricalDocumentsResponses {
  selectHistoricalFile: { selection: HistoricalSelection | null };
  discardHistoricalFile: { discarded: true };
  importHistoricalDocument: HistoricalDocument;
  listHistoricalDocuments: {
    documents: HistoricalDocument[];
    nextCursor: string | null;
  };
  readHistoricalDocument: HistoricalDocument;
  readHistoricalDocumentContent: {
    document: HistoricalDocument;
    contentBase64: string;
  };
}

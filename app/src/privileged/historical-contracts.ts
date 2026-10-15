import type {
  HistoricalDocument,
  HistoricalDocumentsRequests,
  HistoricalDocumentsResponses,
  HistoricalSelection,
} from '../shared/historical-documents-api';
import { historicalFileLimit } from '../shared/historical-documents-api';
import {
  array,
  choice,
  date,
  nullable,
  number,
  object,
  optional,
  text,
  timestamp,
  uuid,
} from './validation';
const area = choice(['medical', 'dental', 'laboratory']);
const mimeType = choice(['application/pdf', 'image/jpeg']);
const byteLength = number(1, historicalFileLimit, true);
const fields = {
  discipline: area,
  documentType: text(80, 1),
  documentDate: date,
  description: text(2000, 1),
  replacesId: optional(uuid),
  replacementReason: optional(text(2000, 1)),
};
export const historicalDocument = object<HistoricalDocument>({
  id: uuid,
  patientId: uuid,
  discipline: area,
  documentType: text(80, 1),
  documentDate: date,
  description: text(2000, 1),
  filename: text(150, 1),
  mimeType,
  byteLength,
  sha256: (value) => {
    const result = text(64, 64)(value);
    if (!/^[a-f0-9]{64}$/.test(result)) throw new Error('Invalid checksum');
    return result;
  },
  uploaderId: uuid,
  uploaderName: text(200, 1),
  createdAt: timestamp,
  replacesId: nullable(uuid),
  replacementReason: nullable(text(2000, 1)),
});
const selection = object<HistoricalSelection>({
  token: uuid,
  patientId: uuid,
  filename: text(150, 1),
  mimeType,
  byteLength,
});
function choiceTrue(value: unknown): true {
  if (value !== true) throw new Error('Invalid acknowledgement');
  return true;
}
export const historicalRequestGuards = {
  selectHistoricalFile: object<
    HistoricalDocumentsRequests['selectHistoricalFile']
  >({ patientId: uuid }),
  discardHistoricalFile: object<
    HistoricalDocumentsRequests['discardHistoricalFile']
  >({ selectionToken: uuid }),
  importHistoricalDocument: object<
    HistoricalDocumentsRequests['importHistoricalDocument']
  >({ patientId: uuid, selectionToken: uuid, ...fields }),
  listHistoricalDocuments: object<
    HistoricalDocumentsRequests['listHistoricalDocuments']
  >({ patientId: uuid, discipline: optional(area), cursor: optional(uuid) }),
  readHistoricalDocument: object<
    HistoricalDocumentsRequests['readHistoricalDocument']
  >({ patientId: uuid, id: uuid }),
  readHistoricalDocumentContent: object<
    HistoricalDocumentsRequests['readHistoricalDocumentContent']
  >({ patientId: uuid, id: uuid }),
};
export const historicalResponseGuards = {
  selectHistoricalFile: object<
    HistoricalDocumentsResponses['selectHistoricalFile']
  >({ selection: nullable(selection) }),
  discardHistoricalFile: object<
    HistoricalDocumentsResponses['discardHistoricalFile']
  >({ discarded: choiceTrue }),
  importHistoricalDocument: historicalDocument,
  listHistoricalDocuments: object<
    HistoricalDocumentsResponses['listHistoricalDocuments']
  >({ documents: array(historicalDocument), nextCursor: nullable(uuid) }),
  readHistoricalDocument: historicalDocument,
  readHistoricalDocumentContent: object<
    HistoricalDocumentsResponses['readHistoricalDocumentContent']
  >({
    document: historicalDocument,
    contentBase64: text(Math.ceil(historicalFileLimit / 3) * 4, 4),
  }),
};
export function historicalRoute(
  name: string,
  input: unknown,
): { path: string; method: 'GET' } | undefined {
  if (
    ![
      'listHistoricalDocuments',
      'readHistoricalDocument',
      'readHistoricalDocumentContent',
    ].includes(name)
  )
    return undefined;
  const body = input as {
    patientId: string;
    id?: string;
    discipline?: string;
    cursor?: string;
  };
  const path = `/patients/${body.patientId}/historical-documents`;
  if (name !== 'listHistoricalDocuments')
    return {
      path: `${path}/${body.id}${name === 'readHistoricalDocumentContent' ? '/content' : ''}`,
      method: 'GET',
    };
  const query = new URLSearchParams();
  if (body.discipline) query.set('discipline', body.discipline);
  if (body.cursor) query.set('cursor', body.cursor);
  return { path: `${path}?${query}`, method: 'GET' };
}

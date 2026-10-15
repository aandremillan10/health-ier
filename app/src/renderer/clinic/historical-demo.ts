import type {
  HistoricalDocument,
  HistoricalSelection,
} from '../../shared/historical-documents-api';
import type { HistoricalApi, Principal, Result } from './contract';
import { visibleDisciplines } from './contract';

export function createHistoricalDemo(
  getStaff: () => Principal | null,
): HistoricalApi {
  const documents: HistoricalDocument[] = [];
  let selection: HistoricalSelection | null = null;
  const denied = <T>(): Result<T> => ({
    ok: false,
    error: {
      code: 'DENIED',
      message: 'This historical document is not available for your role.',
    },
  });
  const success = <T>(data: T): Result<T> => ({
    ok: true,
    data: structuredClone(data),
  });
  return {
    async selectHistoricalFile({
      patientId,
    }): ReturnType<HistoricalApi['selectHistoricalFile']> {
      const staff = getStaff();
      if (!staff || !['doctor', 'dentist', 'medtech'].includes(staff.role))
        return denied();
      selection = {
        token: 'practice-selection',
        patientId,
        filename: 'fictional-scan.jpg',
        mimeType: 'image/jpeg',
        byteLength: 1200,
      };
      return success({ selection });
    },
    async discardHistoricalFile(): ReturnType<
      HistoricalApi['discardHistoricalFile']
    > {
      selection = null;
      return success({ discarded: true as const });
    },
    async importHistoricalDocument(
      input,
    ): ReturnType<HistoricalApi['importHistoricalDocument']> {
      const staff = getStaff();
      const discipline =
        staff?.role === 'doctor'
          ? 'medical'
          : staff?.role === 'dentist'
            ? 'dental'
            : staff?.role === 'medtech'
              ? 'laboratory'
              : null;
      if (
        !staff ||
        input.discipline !== discipline ||
        !selection ||
        selection.patientId !== input.patientId ||
        selection.token !== input.selectionToken
      )
        return denied();
      if (input.replacesId) {
        const original = documents.find(
          (record) => record.id === input.replacesId,
        );
        if (
          !original ||
          original.patientId !== input.patientId ||
          original.discipline !== discipline ||
          original.uploaderId !== staff.id
        )
          return denied();
        if (documents.some((record) => record.replacesId === input.replacesId))
          return {
            ok: false,
            error: {
              code: 'CONFLICT',
              message: 'This historical record already has a replacement.',
            },
          };
      }
      if (
        !input.documentType.trim() ||
        input.documentType.length > 80 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate) ||
        !Number.isFinite(Date.parse(input.documentDate)) ||
        new Date(input.documentDate).toISOString().slice(0, 10) !==
          input.documentDate ||
        !input.description.trim() ||
        input.description.length > 2000 ||
        (input.replacesId !== undefined) !==
          (input.replacementReason !== undefined) ||
        (input.replacesId !== undefined && !input.replacesId.trim()) ||
        (input.replacementReason !== undefined &&
          (!input.replacementReason.trim() ||
            input.replacementReason.trim().length > 2000))
      )
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message:
              'Enter the document type, date, description, and replacement reason when replacing an original.',
          },
        };
      const record: HistoricalDocument = {
        id: `practice-history-${documents.length + 1}`,
        patientId: input.patientId,
        discipline: input.discipline,
        documentType: input.documentType.trim(),
        documentDate: input.documentDate,
        description: input.description,
        filename: selection.filename,
        mimeType: selection.mimeType,
        byteLength: selection.byteLength,
        sha256: 'fictional-practice-hash',
        uploaderId: staff.id,
        uploaderName: staff.displayName,
        createdAt: new Date().toISOString(),
        replacesId: input.replacesId ?? null,
        replacementReason: input.replacementReason?.trim() ?? null,
      };
      documents.unshift(record);
      selection = null;
      return success(record);
    },
    async listHistoricalDocuments({
      patientId,
      discipline,
    }): ReturnType<HistoricalApi['listHistoricalDocuments']> {
      const staff = getStaff();
      if (!staff || !visibleDisciplines(staff).length) return denied();
      return success({
        documents: documents.filter(
          (record) =>
            record.patientId === patientId &&
            visibleDisciplines(staff).includes(record.discipline) &&
            (!discipline || record.discipline === discipline),
        ),
        nextCursor: null,
      });
    },
    async readHistoricalDocument({
      patientId,
      id,
    }): ReturnType<HistoricalApi['readHistoricalDocument']> {
      const staff = getStaff();
      const record = documents.find(
        (item) => item.id === id && item.patientId === patientId,
      );
      return staff &&
        record &&
        visibleDisciplines(staff).includes(record.discipline)
        ? success(record)
        : denied();
    },
    async readHistoricalDocumentContent(): ReturnType<
      HistoricalApi['readHistoricalDocumentContent']
    > {
      return {
        ok: false,
        error: {
          code: 'DENIED',
          message:
            'Practice scans have no file content. Use the labeled fictional preview.',
        },
      };
    },
  };
}

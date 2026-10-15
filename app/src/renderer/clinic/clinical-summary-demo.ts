import type { Result, Staff } from '../../shared/clinic-api';
import type {
  ClinicalSummaryApi,
  SummaryFields,
  SummaryHistory,
  SummaryItem,
  SummaryRequests,
} from '../../shared/clinical-summary';
import { canReadClinicalSummary } from '../../shared/clinical-summary';

// Explicit synthetic demo only. Records stay in this instance and never use a live transport.
export function createClinicalSummaryDemo(
  getStaff: () => Staff | null,
  patientExists: (id: string) => boolean,
): ClinicalSummaryApi {
  const items = new Map<string, SummaryItem>();
  const history = new Map<string, SummaryHistory[]>();
  const failure = (
    code: 'FORBIDDEN' | 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
    currentRevision?: number,
  ): Result<never> => ({
    ok: false,
    error: { code, message, ...(currentRevision ? { currentRevision } : {}) },
  });
  function authorize(write = false): Result<Staff> {
    const staff = getStaff();
    if (!staff)
      return failure(
        'UNAUTHENTICATED',
        'Sign in to use this synthetic summary.',
      );
    if (
      !canReadClinicalSummary(staff) ||
      (write && staff.role !== 'doctor' && staff.role !== 'dentist')
    )
      return failure(
        'FORBIDDEN',
        'Clinical summaries are restricted to clinicians and clinic head oversight.',
      );
    return { ok: true, data: staff };
  }
  function readItem(item: SummaryItem, staff: Staff): SummaryItem {
    return structuredClone({
      ...item,
      canEdit:
        item.authorId === staff.id &&
        (staff.role === 'doctor' || staff.role === 'dentist'),
    });
  }
  function record(
    item: SummaryItem,
    staff: Staff,
    action: SummaryHistory['action'],
    reason: string | null,
  ): void {
    const previous = history.get(item.id) ?? [];
    history.set(item.id, [
      {
        id: crypto.randomUUID(),
        itemId: item.id,
        authorId: staff.id,
        authorName: staff.displayName,
        revision: item.revision,
        action,
        reason,
        createdAt: item.updatedAt,
        snapshot: structuredClone({
          content: item.content,
          source: item.source,
          notes: item.notes,
          status: item.status,
        }),
      },
      ...previous,
    ]);
  }
  function change(
    input:
      | SummaryRequests['inactivateSummaryItem']
      | SummaryRequests['correctSummaryItem'],
    action: 'update' | 'correct' | 'inactivate',
  ): Result<SummaryItem> {
    const auth = authorize(true);
    if (!auth.ok) return auth;
    const item = items.get(input.id);
    if (!item)
      return failure(
        'NOT_FOUND',
        'The summary item is unavailable. Refresh the summary.',
      );
    if (item.authorId !== auth.data.id)
      return failure(
        'FORBIDDEN',
        'Only the original author can change this item.',
      );
    if (item.revision !== input.expectedRevision)
      return failure(
        'CONFLICT',
        'This item changed. Cancel this edit, then refresh the summary.',
        item.revision,
      );
    if (item.status === 'inactive' && action !== 'correct')
      return failure(
        'CONFLICT',
        'This item is inactive. Add a correction to change its content.',
      );
    if (!input.reason.trim())
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: 'Enter the reason for this change.',
          fieldErrors: { reason: 'Enter a reason.' },
        },
      };
    const fields: SummaryFields =
      'content' in input
        ? { content: input.content, source: input.source, notes: input.notes }
        : { content: item.content, source: item.source, notes: item.notes };
    if (fields.content.kind !== item.content.kind)
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: 'The item type cannot change. Add a separate item.',
        },
      };
    const updated = {
      ...item,
      ...structuredClone(fields),
      revision: item.revision + 1,
      updatedAt: new Date().toISOString(),
      status: action === 'inactivate' ? ('inactive' as const) : item.status,
    };
    items.set(item.id, updated);
    record(updated, auth.data, action, input.reason.trim());
    return { ok: true, data: readItem(updated, auth.data) };
  }
  return {
    readClinicalSummary: async ({
      patientId,
    }): ReturnType<ClinicalSummaryApi['readClinicalSummary']> => {
      const auth = authorize();
      if (!auth.ok) return auth;
      if (!patientExists(patientId))
        return failure(
          'NOT_FOUND',
          'The synthetic patient is unavailable. Open a patient from the demo registry.',
        );
      return {
        ok: true,
        data: {
          patientId,
          canCreate:
            auth.data.role === 'doctor' || auth.data.role === 'dentist',
          items: [...items.values()]
            .filter((item) => item.patientId === patientId)
            .map((item) => readItem(item, auth.data)),
        },
      };
    },
    createSummaryItem: async ({
      patientId,
      ...fields
    }): ReturnType<ClinicalSummaryApi['createSummaryItem']> => {
      const auth = authorize(true);
      if (!auth.ok) return auth;
      if (!patientExists(patientId))
        return failure(
          'NOT_FOUND',
          'The synthetic patient is unavailable. Open a patient from the demo registry.',
        );
      if (!fields.source.trim())
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: 'Enter the source of this information.',
            fieldErrors: { source: 'Enter a source.' },
          },
        };
      const now = new Date().toISOString();
      const item: SummaryItem = {
        ...structuredClone(fields),
        id: crypto.randomUUID(),
        patientId,
        authorId: auth.data.id,
        authorName: auth.data.displayName,
        status: 'active',
        revision: 1,
        createdAt: now,
        updatedAt: now,
        canEdit: true,
      };
      items.set(item.id, item);
      record(item, auth.data, 'create', null);
      return { ok: true, data: readItem(item, auth.data) };
    },
    updateSummaryItem: async (input) => change(input, 'update'),
    correctSummaryItem: async (input) => change(input, 'correct'),
    inactivateSummaryItem: async (input) => change(input, 'inactivate'),
    readSummaryHistory: async ({
      id,
    }): ReturnType<ClinicalSummaryApi['readSummaryHistory']> => {
      const auth = authorize();
      if (!auth.ok) return auth;
      if (!items.has(id))
        return failure(
          'NOT_FOUND',
          'The synthetic item is unavailable. Refresh the summary.',
        );
      return { ok: true, data: structuredClone(history.get(id) ?? []) };
    },
  };
}

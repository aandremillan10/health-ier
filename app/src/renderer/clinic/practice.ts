import type { ClinicApi, Patient, Principal, Result } from './contract';
import { canEditRegistry, canReadVitals, visibleDisciplines } from './contract';
import { createDemoClinic, demoStaff } from './demo';
import { today } from './format';
import { canReadClinicalSummary } from '../../shared/clinical-summary';

export type PracticeTopic =
  | 'session'
  | 'registry'
  | 'appointments'
  | 'vitals'
  | 'medical'
  | 'dental'
  | 'laboratory'
  | 'referrals'
  | 'summary'
  | 'documents'
  | 'reports'
  | 'audit'
  | 'historical';
export type PracticeScreen =
  | {
      kind:
        | 'registry'
        | 'appointments'
        | 'laboratory'
        | 'referrals'
        | 'reports'
        | 'audit'
        | 'historical';
    }
  | {
      kind: 'chart';
      tab: 'details' | 'vitals' | 'medical' | 'dental' | 'laboratory';
    };
export interface PracticeEvent {
  method: string;
  ok: boolean;
}
export interface PracticeStep {
  title: string;
  text: string;
  target: string;
  match?: string;
  action?: { method: string; ok?: boolean } | { click: true };
}
export interface PracticeSession {
  api: ClinicApi;
  staff: Principal;
  patient: Patient | null;
  screen: PracticeScreen;
  topic: PracticeTopic;
  steps: PracticeStep[];
  subscribe: (listener: (event: PracticeEvent) => void) => () => void;
  conflictNext: () => void;
  emit: (event: PracticeEvent) => void;
  dispose: () => void;
}
export const topicNames: Record<PracticeTopic, string> = {
  session: 'Sign-in and session',
  registry: 'Patient records',
  appointments: 'Clinic flow',
  vitals: 'Vital signs',
  medical: 'Medical chart',
  dental: 'Dental chart',
  laboratory: 'Laboratory orders',
  referrals: 'Referrals',
  summary: 'Clinical summary',
  documents: 'Documents',
  reports: 'Reports',
  audit: 'Audit trail',
  historical: 'Historical documents',
};
export const topicHelp: Record<PracticeTopic, string> = {
  session:
    'Check your name and role before working. Sign out when leaving this workstation. If your session expires, sign in again before opening private records.',
  registry:
    'Search by name or patient number. Compare birth date and number before opening a record. Check existing records before registering someone new.',
  appointments:
    'Choose the clinic date, then update the visit as care progresses. Queue changes do not save consultation findings or laboratory results.',
  vitals:
    'Check the selected patient and measurement time. Leave untaken values blank. The attendant saves a draft, reviews it, then finalizes; later changes need an attributed correction.',
  medical:
    'Start with the correct patient and consultation date. Select their finalized vital signs when relevant. Save a draft, review it, then finalize. Only the original author can correct or issue documents.',
  dental:
    'Read the dental record and its author. Dental chart authoring is not available in this version. Use the existing referral and laboratory workflows for supported tasks.',
  laboratory:
    'Providers order tests for the selected patient. Laboratory staff start work, save and finalize results. The ordering provider reviews finalized results; colleagues cannot take over another author’s draft.',
  referrals:
    'Read the requested task and receiving unit. Receiving staff accept, start, and complete the task with a note or linked result. Sending a referral does not itself complete clinical care.',
  summary:
    'Review allergies, medicines, and conditions. An empty section does not confirm absence. Record the information source; only the original author changes an item, with history preserved.',
  documents:
    'Use your own finalized medical consultation. Preview and review the entire document before issuing. Editing invalidates review. Issued copies keep their identity and content when reopened.',
  reports:
    'Choose and apply a date range. Check the applied dates and report scope before using totals. Refresh changed data before export; report access follows your role.',
  audit:
    'Apply dates and optional staff, action, patient, or record filters. The clinic head can review who accessed or changed records; clinical text and credentials are excluded.',
  historical:
    'Select the correct patient, then import an existing PDF or JPEG scan into your discipline. Review its type, date and description. Originals remain unchanged; corrections use a linked replacement with a reason.',
};
export function availableTopics(staff: Principal): PracticeTopic[] {
  return [
    'session',
    'registry',
    'appointments',
    ...(canReadVitals(staff) ? (['vitals'] as const) : []),
    ...(visibleDisciplines(staff).includes('medical')
      ? (['medical'] as const)
      : []),
    ...(visibleDisciplines(staff).includes('dental')
      ? (['dental'] as const)
      : []),
    ...(['doctor', 'dentist', 'medtech'].includes(staff.role)
      ? (['laboratory', 'referrals'] as const)
      : []),
    ...(canReadClinicalSummary(staff) ? (['summary'] as const) : []),
    ...(staff.role === 'doctor' ? (['documents'] as const) : []),
    ...(staff.isHead || ['clerk', 'attendant'].includes(staff.role)
      ? (['reports'] as const)
      : []),
    ...(staff.isHead ? (['audit'] as const) : []),
    ...(visibleDisciplines(staff).length ? (['historical'] as const) : []),
  ];
}
const read = (
  title: string,
  text: string,
  target: string,
  match?: string,
): PracticeStep => ({ title, text, target, match });
const click = (
  title: string,
  text: string,
  match: string,
  target = 'button',
): PracticeStep => ({ title, text, target, match, action: { click: true } });
const action = (
  title: string,
  text: string,
  method: string,
  target: string,
  match?: string,
  ok = true,
): PracticeStep => ({ title, text, target, match, action: { method, ok } });

export function practiceSteps(
  topic: PracticeTopic,
  staff: Principal,
): PracticeStep[] {
  switch (topic) {
    case 'session':
      return [
        read(
          'Check your role',
          'This fictional staff member has the same role and head designation as you. Access still follows that role. Practice never switches your real account.',
          '.staff-identity',
        ),
        click(
          'Try a safe sign-out',
          'Select Simulate sign-out. This only clears the small practice session example; your real sign-in remains active.',
          'Simulate sign-out',
        ),
        click(
          'Return to the example',
          'Select Simulate sign-in. Real session expiry always closes practice and clears private screens.',
          'Simulate sign-in',
        ),
      ];
    case 'registry':
      return [
        action(
          'Find a fictional patient',
          'Enter Lina, then select Find patient. No real patient information is used.',
          'findPatients',
          '#patient-search',
        ),
        action(
          'Choose the right record',
          'Two patients share a name. Compare their birth dates and select Open record for DEMO-0001.',
          'getPatient',
          'button[aria-label="Open Lina Marquez DEMO-0001"]',
        ),
        ...(canEditRegistry(staff)
          ? [
              click(
                'Edit identity carefully',
                'Select Edit patient details. Keep the patient number in view.',
                'Edit patient details',
              ),
              action(
                'Save a practice change',
                'Change the address to Practice address, then select Save patient. This writes only to this practice dataset.',
                'updatePatient',
                '#address',
              ),
            ]
          : [
              read(
                'Confirm the patient',
                'Your role can read this identity. Registry edits are reserved for the clerk and attendant. Next, open the chart allowed for your role.',
                '.patient-banner',
              ),
            ]),
      ];
    case 'appointments':
      return [
        read(
          'Check the clinic date',
          'The fictional appointment is on today’s date. This board describes visit progress, not clinical findings.',
          '#appointment-date',
        ),
        action(
          'Advance the visit',
          ['clerk', 'attendant'].includes(staff.role)
            ? 'Select Mark arrived and confirm the fictional patient. Then move the visit to Waiting.'
            : staff.role === 'medtech'
              ? 'Select Move to lab and confirm. The appointment was seeded at Waiting for your laboratory discipline.'
              : 'Select Start provider care and confirm. The appointment was seeded at Waiting for your discipline.',
          'transitionAppointment',
          '.appointment-buttons',
        ),
        action(
          'Record the next state',
          ['clerk', 'attendant'].includes(staff.role)
            ? 'Select Move to waiting and confirm. Clinical staff take over from here.'
            : 'Select Complete visit and confirm when the simulated work is done.',
          'transitionAppointment',
          '.appointment-buttons',
        ),
        click(
          'Read the history',
          'Open State history to see the prior states and who changed them. Clinical findings still belong in the chart.',
          'State history',
          'summary',
        ),
      ];
    case 'vitals':
      return staff.role === 'attendant'
        ? [
            click(
              'Start measurements',
              'Select Record vital signs. Use fictional measurements only; this tour provides no clinical advice.',
              'Record vital signs',
            ),
            action(
              'Save nullable measurements',
              'Enter a sample pulse such as 74. Leave untaken measurements blank, then Save draft.',
              'saveVitals',
              '#pulse',
            ),
            action(
              'Finalize after review',
              'Review the new draft, choose its Finalize entry button, and confirm. The original will be preserved.',
              'finalizeVitals',
              '[data-testid="vitals"] .entry-actions',
            ),
            click(
              'Correct without replacing',
              'Choose Add correction on the newly finalized entry. The earlier values stay in history.',
              'Add correction',
            ),
            action(
              'Save an attributed correction',
              'Enter a correction reason and adjust a sample measurement, then Save correction.',
              'correctVitals',
              '#correctionReason',
            ),
          ]
        : [
            read(
              'Read measurements',
              'Check the patient, time, author, and Not taken values. Only the original attendant can change measurements.',
              '[data-testid="vitals"]',
            ),
            click(
              'Open the medical context',
              'Return to Patient details when you have reviewed the measurements. A consultation may explicitly have no linked vital signs.',
              'Patient details',
            ),
          ];
    case 'medical':
      return [
        click(
          'Start a consultation',
          'Select New medical entry. The seeded finalized vital signs belong to this same fictional patient.',
          'New medical entry',
        ),
        action(
          'Link and save a draft',
          'Choose finalized vital signs or None, enter a fictional reason, and Save draft.',
          'saveEntry',
          '#vitalsId',
        ),
        click(
          'Continue your draft',
          'Select Edit draft on the entry you just created. Only your own entries offer editing.',
          'Edit draft',
        ),
        action(
          'Experience a revision conflict',
          'Select Simulate revision conflict in the guide, then Save draft. Your input stays in place when the local conflict is shown.',
          'saveEntry',
          '.form-actions',
          undefined,
          false,
        ),
        click(
          'Compare the saved version',
          'Select Review latest version. Read it before accepting its revision; your text remains in the form.',
          'Review latest version',
        ),
        click(
          'Keep your input safely',
          'Select Use latest revision and keep my input after comparing the versions.',
          'Use latest revision and keep my input',
        ),
        action(
          'Retry your draft',
          'Select Save draft again. This succeeds against the latest local revision.',
          'saveEntry',
          '.form-actions',
        ),
        action(
          'Finalize the reviewed draft',
          'Review your draft, choose Finalize entry and confirm. Finalization preserves the original content.',
          'finalizeEntry',
          '[data-testid="entry"] .entry-actions',
        ),
        click(
          'Add an attributed correction',
          'Choose Add correction on your new finalized entry. A colleague’s entry remains read-only, even for the head.',
          'Add correction',
        ),
        action(
          'Preserve the original',
          'Enter a correction reason and adjust the fictional content, then Save correction. Read the original and correction together.',
          'correctEntry',
          '#correctionReason',
        ),
      ];
    case 'dental':
      return [
        read(
          'Read the dental chart',
          'This synthetic dental record is limited to your permitted discipline or head oversight. Check its author and date.',
          '[data-testid="entry"]',
        ),
        read(
          'Know the current limit',
          'Dental chart authoring is not available in this version. This guide does not invent an editor. Existing referrals and laboratory orders remain available to dentists.',
          '[data-testid="entry"] .hint',
        ),
        click(
          'Return to the identity',
          'Select Patient details before choosing the next supported task.',
          'Patient details',
        ),
      ];
    case 'laboratory':
      return staff.role === 'medtech'
        ? [
            click(
              'Select the order',
              'Open the seeded fictional order. Confirm patient identity and requested tests.',
              'Practice test',
              '.lab-order-option',
            ),
            action(
              'Start laboratory work',
              'Select Start laboratory work. This changes only the local order state.',
              'startLabOrder',
              '.lab-actions',
              'Start laboratory work',
            ),
            click(
              'Enter a result draft',
              'Select Enter laboratory result. Use a fictional value such as practice value, not clinical advice.',
              'Enter laboratory result',
            ),
            action(
              'Save the result',
              'Enter a value for each requested test, then Save result draft. Review before finalizing.',
              'saveLabResult',
              '.lab-editor',
            ),
            action(
              'Finalize for provider review',
              'Select Finalize laboratory result and confirm. The ordering provider can then review the result.',
              'finalizeLabResult',
              '.lab-actions',
            ),
          ]
        : [
            click(
              'Create an order',
              'Select New laboratory order. Use fictional test names and only context needed by the laboratory.',
              'New laboratory order',
            ),
            action(
              'Send requested tests',
              'Enter Practice test on its own line and select Create laboratory order.',
              'createLabOrder',
              '#lab-tests',
            ),
            click(
              'Read a returned result',
              'Select the seeded Practice reviewed test order. Its result was finalized by a fictional technologist.',
              'Practice reviewed test',
              '.lab-order-option',
            ),
            action(
              'Acknowledge review',
              'Read the result, then select Mark results reviewed. Only the ordering provider can do this.',
              'reviewLabOrder',
              '.lab-actions',
              'Mark results reviewed',
            ),
          ];
    case 'referrals':
      return [
        click(
          'Read your unit’s task',
          'Open the seeded referral addressed to your discipline. Check the patient, request, and originating staff.',
          'Lina Marquez',
          '.referral-option',
        ),
        action(
          'Accept responsibility',
          'Select Accept referral. The receiving task is assigned to this fictional staff member.',
          'acceptReferral',
          '.referral-actions',
          'Accept referral',
        ),
        action(
          'Start the task',
          'Select Start referral task. Acceptance and start are separate milestones.',
          'startReferral',
          '.referral-actions',
          'Start referral task',
        ),
        click(
          'Record completion',
          'Select Complete referral. Add a fictional completion note; laboratory completion also needs its finalized result.',
          'Complete referral',
        ),
        action(
          'Complete the hand-off',
          'Enter Practice task completed, choose the seeded result if requested, and confirm completion.',
          'completeReferral',
          '.referral-detail',
        ),
        ...(staff.role !== 'medtech'
          ? [
              click(
                'Send a new request',
                'Select New referral to practice the sending side for this same patient.',
                'New referral',
              ),
              action(
                'Send to another unit',
                'Choose another unit, enter a fictional requested task, and Send referral. A laboratory referral also needs an existing order.',
                'createReferral',
                '#referral-reason',
              ),
            ]
          : []),
      ];
    case 'summary':
      return [
        read(
          'Review the summary',
          'Empty allergies do not mean no known allergies. Confirm information and record its source.',
          '.clinical-summary',
        ),
        click(
          'Add a sourced item',
          'Select Add allergy. Use the fictional substance Practice substance and source Practice record.',
          'Add allergy',
        ),
        action(
          'Save the source',
          'Complete Substance and Source, then Save summary item. Only this local dataset changes.',
          'createSummaryItem',
          '#summary-source',
        ),
        action(
          'Read the history',
          'Open View history for the new item to see its original content and author.',
          'readSummaryHistory',
          '.summary-history summary',
        ),
      ];
    case 'documents':
      return [
        click(
          'Prepare from your own entry',
          'Select Prepare certificate on your own finalized consultation. Colleagues’ entries remain read-only.',
          'Prepare certificate',
        ),
        action(
          'Preview before issue',
          'Enter Practice certificate only as purpose, add fictional findings if useful, then Preview certificate.',
          'previewDocument',
          '#purpose',
        ),
        read(
          'Review the whole page',
          'Scroll the page and check identity, date, wording and signature area. Any edit invalidates this preview and review.',
          '.document-paper',
        ),
        action(
          'Issue the reviewed practice copy',
          'Check I have reviewed this document, then Issue certificate. This is an in-memory simulation.',
          'issueDocument',
          '.review-controls',
        ),
        action(
          'Try the inert print affordance',
          'Choose the practice printer, select Print certificate and confirm. No print job, file or PDF is created.',
          'printDocument',
          '.print-controls',
        ),
        click(
          'Keep clipboard private',
          'Select Copy document ID. In practice this explains the real action without writing to your clipboard.',
          'Copy document ID',
          'button[aria-label="Copy document ID"]',
        ),
        click(
          'Return to history',
          'Select Back to chart. The practice copy is listed under Issued documents until you exit or restart.',
          'Back to chart',
        ),
        action(
          'Reopen the issued copy',
          'Select View / reprint in Issued documents. Its local identity and content are preserved.',
          'getDocument',
          '.document-list button',
        ),
      ];
    case 'reports':
      return [
        read(
          'Check your scope',
          'This synthetic report follows your role. No live totals are copied into practice.',
          '.reports-view, .reports, main h1',
        ),
        action(
          'Apply the range',
          'Choose a date range and select Apply date range. Confirm the applied dates before using the totals.',
          'readReport',
          'form',
        ),
        click(
          'Try a safe export',
          'Select Export applied report as CSV. Practice explains the action without downloading a file or calling the export service.',
          'Export applied report as CSV',
        ),
      ];
    case 'audit':
      return [
        read(
          'Read the audit scope',
          'Only the clinic head sees this lesson. Synthetic events exclude clinical text, credentials and file content.',
          '#audit-from',
        ),
        action(
          'Apply audit filters',
          'Choose an action or staff member and select Apply audit filters. Clearing a filter broadens only this synthetic view.',
          'listAuditEvents',
          '#audit-action',
        ),
        read(
          'Interpret the event',
          'Compare time, actor, action, record and outcome. An audit event is evidence of the recorded action, not permission to change another author’s work.',
          '[aria-label="Audit events"]',
        ),
      ];
    case 'historical':
      return [
        click(
          'Attach a historical scan',
          'Select Import historical document. Your role can import only into its own discipline; head oversight permits broader reading, not broader importing.',
          'Import historical document',
        ),
        action(
          'Choose the fictional file',
          'Select Choose fictional scan. Practice uses only local metadata and never opens a file picker.',
          'selectHistoricalFile',
          'button',
          'Choose fictional scan',
        ),
        action(
          'Save its context',
          'Enter Practice record as document type and Fictional scan as description, then select Save historical document. No file is stored in practice.',
          'importHistoricalDocument',
          '#history-type',
        ),
        action(
          'Read the original',
          'Select View original scan. This practice representation contains no real PDF or image bytes.',
          'readHistoricalDocument',
          '.history-list button',
          'View original scan',
        ),
        click(
          'Preserve and replace',
          'Close the preview, then select Import replacement. The original remains available.',
          'Import replacement',
        ),
        action(
          'Record a replacement reason',
          'Choose the fictional scan again, enter a reason, and Save historical document. The new record links to its original.',
          'importHistoricalDocument',
          '#history-reason',
        ),
      ];
  }
}

function requireData<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

// No live API, staff identity or patient record crosses this factory boundary.
export async function createPractice(
  role: Pick<Principal, 'role' | 'isHead'>,
  topic: PracticeTopic,
): Promise<PracticeSession> {
  const fixture = createDemoClinic();
  const identity = demoStaff.find(
    (person) => person.role === role.role && person.isHead === role.isHead,
  );
  if (!identity || !availableTopics(identity).includes(topic))
    throw new Error('This practice guide is unavailable for your role.');
  fixture.selectStaff('demo-clerk');
  const discipline =
    role.role === 'dentist'
      ? 'dental'
      : role.role === 'medtech'
        ? 'laboratory'
        : 'medical';
  let appointment = requireData(
    await fixture.api.createAppointment({
      patientId: 'DEMO-0001',
      discipline,
      scheduledAt: `${today()}T09:00:00+08:00`,
    }),
  );
  if (!['clerk', 'attendant'].includes(role.role)) {
    appointment = requireData(
      await fixture.api.transitionAppointment({
        id: appointment.id,
        expectedRevision: appointment.revision,
        status: 'arrived',
      }),
    );
    await fixture.api.transitionAppointment({
      id: appointment.id,
      expectedRevision: appointment.revision,
      status: 'waiting',
    });
  }
  const providerId =
    role.role === 'dentist'
      ? identity.id
      : role.role === 'doctor'
        ? identity.id
        : 'demo-doctor-1';
  fixture.selectStaff(providerId);
  const order = requireData(
    await fixture.api.createLabOrder({
      patientId: 'DEMO-0001',
      requestedTests: ['Practice test'],
      priority: 'routine',
      requestedFor: today(),
      clinicalContext: 'Fictional training only',
    }),
  );
  const reviewedOrder = requireData(
    await fixture.api.createLabOrder({
      patientId: 'DEMO-0001',
      requestedTests: ['Practice reviewed test'],
      priority: 'routine',
      requestedFor: today(),
      clinicalContext: 'Fictional training only',
    }),
  );
  fixture.selectStaff('demo-medtech-1');
  const started = requireData(
    await fixture.api.startLabOrder({
      id: reviewedOrder.id,
      expectedRevision: reviewedOrder.revision,
    }),
  );
  const result = requireData(
    await fixture.api.saveLabResult({
      orderId: started.id,
      expectedRevision: started.revision,
      values: [
        {
          test: 'Practice reviewed test',
          value: 'Fictional result',
          unit: null,
          referenceRange: null,
          flag: 'unspecified',
        },
      ],
      notes: null,
    }),
  );
  const draft = result.results[0];
  if (draft)
    await fixture.api.finalizeLabResult({
      id: draft.id,
      expectedRevision: draft.revision,
      expectedOrderRevision: result.revision,
    });
  if (['doctor', 'dentist', 'medtech'].includes(role.role)) {
    fixture.selectStaff(
      role.role === 'doctor'
        ? 'demo-dentist-1'
        : providerId === identity.id
          ? 'demo-doctor-1'
          : providerId,
    );
    await fixture.api.createReferral({
      patientId: 'DEMO-0001',
      receivingDiscipline: discipline,
      reason: 'Practice receiving task',
      labOrderId: role.role === 'medtech' ? order.id : null,
    });
    // A laboratory referral completes against its own authoritative local result.
    if (role.role === 'medtech' && topic === 'referrals') {
      fixture.selectStaff(identity.id);
      const begun = requireData(
        await fixture.api.startLabOrder({
          id: order.id,
          expectedRevision: order.revision,
        }),
      );
      const saved = requireData(
        await fixture.api.saveLabResult({
          orderId: order.id,
          expectedRevision: begun.revision,
          values: [
            {
              test: 'Practice test',
              value: 'Fictional result',
              unit: null,
              referenceRange: null,
              flag: 'unspecified',
            },
          ],
          notes: null,
        }),
      );
      const row = saved.results[0];
      if (row && topic === 'referrals')
        await fixture.api.finalizeLabResult({
          id: row.id,
          expectedRevision: row.revision,
          expectedOrderRevision: saved.revision,
        });
    }
  }
  const staff = fixture.selectStaff(identity.id);
  const patient = requireData(
    await fixture.api.getPatient({ id: 'DEMO-0001' }),
  );
  let active = true;
  const listeners = new Set<(event: PracticeEvent) => void>();
  const emit = (event: PracticeEvent): void => {
    if (active) for (const listener of listeners) listener(event);
  };
  const blocked = (): Promise<Result<never>> =>
    Promise.resolve({
      ok: false,
      error: {
        code: 'DENIED',
        message:
          'This action is unavailable in practice. Your real session is unchanged.',
      },
    });
  const localApi: ClinicApi = {
    ...fixture.api,
    login: blocked,
    logout: blocked,
    me: blocked,
    listPrinters: async () => ({
      ok: true,
      data: [
        {
          id: 'practice-printer',
          name: 'Practice printer · no output',
          isDefault: true,
        },
      ],
    }),
    printDocument: async () => ({ ok: true, data: { submitted: true } }),
    exportReport: blocked,
  };
  const cache = new Map<PropertyKey, unknown>();
  const api = new Proxy(localApi, {
    get(target, key, receiver): unknown {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      if (!cache.has(key))
        cache.set(key, async (...args: unknown[]): Promise<unknown> => {
          if (!active) return blocked();
          const response: unknown = await (
            value as (...input: unknown[]) => unknown
          )(...args);
          if (
            active &&
            typeof response === 'object' &&
            response !== null &&
            'ok' in response &&
            typeof response.ok === 'boolean'
          )
            emit({ method: String(key), ok: response.ok });
          return active ? response : blocked();
        });
      return cache.get(key);
    },
  });
  const screen: PracticeScreen =
    topic === 'registry' || topic === 'session'
      ? { kind: 'registry' }
      : topic === 'medical' || topic === 'documents'
        ? { kind: 'chart', tab: 'medical' }
        : topic === 'dental' || topic === 'vitals'
          ? { kind: 'chart', tab: topic }
          : topic === 'summary'
            ? { kind: 'chart', tab: 'details' }
            : { kind: topic };
  return {
    api,
    staff,
    patient: ['registry', 'session', 'reports', 'audit'].includes(topic)
      ? null
      : patient,
    screen,
    topic,
    steps: practiceSteps(topic, staff),
    subscribe(listener): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    conflictNext: fixture.conflictNext,
    emit,
    dispose(): void {
      active = false;
      listeners.clear();
    },
  };
}

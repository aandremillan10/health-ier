import { contextBridge, ipcRenderer } from 'electron';
import type {
  ClinicApi,
  DesktopApi,
  Requests,
  Responses,
  Result,
  SessionReset,
} from '../shared/clinic-api';

function invoke<K extends keyof Requests>(
  name: K,
  input: Requests[K],
): Promise<Result<Responses[K]>> {
  return ipcRenderer.invoke(`clinic:${name}`, input) as Promise<
    Result<Responses[K]>
  >;
}
const clinic = Object.freeze({
  selectHistoricalFile: (
    input: Requests['selectHistoricalFile'],
  ): Promise<Result<Responses['selectHistoricalFile']>> =>
    invoke('selectHistoricalFile', input),
  discardHistoricalFile: (
    input: Requests['discardHistoricalFile'],
  ): Promise<Result<Responses['discardHistoricalFile']>> =>
    invoke('discardHistoricalFile', input),
  importHistoricalDocument: (
    input: Requests['importHistoricalDocument'],
  ): Promise<Result<Responses['importHistoricalDocument']>> =>
    invoke('importHistoricalDocument', input),
  listHistoricalDocuments: (
    input: Requests['listHistoricalDocuments'],
  ): Promise<Result<Responses['listHistoricalDocuments']>> =>
    invoke('listHistoricalDocuments', input),
  readHistoricalDocument: (
    input: Requests['readHistoricalDocument'],
  ): Promise<Result<Responses['readHistoricalDocument']>> =>
    invoke('readHistoricalDocument', input),
  readHistoricalDocumentContent: (
    input: Requests['readHistoricalDocumentContent'],
  ): Promise<Result<Responses['readHistoricalDocumentContent']>> =>
    invoke('readHistoricalDocumentContent', input),
  listReferrals: (
    input: Requests['listReferrals'],
  ): Promise<Result<Responses['listReferrals']>> =>
    invoke('listReferrals', input),
  listReferralInbox: (
    input: Requests['listReferralInbox'],
  ): Promise<Result<Responses['listReferralInbox']>> =>
    invoke('listReferralInbox', input),
  listSentReferrals: (
    input: Requests['listSentReferrals'],
  ): Promise<Result<Responses['listSentReferrals']>> =>
    invoke('listSentReferrals', input),
  createReferral: (
    input: Requests['createReferral'],
  ): Promise<Result<Responses['createReferral']>> =>
    invoke('createReferral', input),
  acceptReferral: (
    input: Requests['acceptReferral'],
  ): Promise<Result<Responses['acceptReferral']>> =>
    invoke('acceptReferral', input),
  startReferral: (
    input: Requests['startReferral'],
  ): Promise<Result<Responses['startReferral']>> =>
    invoke('startReferral', input),
  completeReferral: (
    input: Requests['completeReferral'],
  ): Promise<Result<Responses['completeReferral']>> =>
    invoke('completeReferral', input),
  cancelReferral: (
    input: Requests['cancelReferral'],
  ): Promise<Result<Responses['cancelReferral']>> =>
    invoke('cancelReferral', input),
  rejectReferral: (
    input: Requests['rejectReferral'],
  ): Promise<Result<Responses['rejectReferral']>> =>
    invoke('rejectReferral', input),
  readPatientFamily: (
    input: Requests['readPatientFamily'],
  ): Promise<Result<Responses['readPatientFamily']>> =>
    invoke('readPatientFamily', input),
  createMembership: (
    input: Requests['createMembership'],
  ): Promise<Result<Responses['createMembership']>> =>
    invoke('createMembership', input),
  updateMembership: (
    input: Requests['updateMembership'],
  ): Promise<Result<Responses['updateMembership']>> =>
    invoke('updateMembership', input),
  correctMembership: (
    input: Requests['correctMembership'],
  ): Promise<Result<Responses['correctMembership']>> =>
    invoke('correctMembership', input),
  linkDependent: (
    input: Requests['linkDependent'],
  ): Promise<Result<Responses['linkDependent']>> =>
    invoke('linkDependent', input),
  updateDependent: (
    input: Requests['updateDependent'],
  ): Promise<Result<Responses['updateDependent']>> =>
    invoke('updateDependent', input),
  correctDependent: (
    input: Requests['correctDependent'],
  ): Promise<Result<Responses['correctDependent']>> =>
    invoke('correctDependent', input),
  unlinkDependent: (
    input: Requests['unlinkDependent'],
  ): Promise<Result<Responses['unlinkDependent']>> =>
    invoke('unlinkDependent', input),
  readMembershipHistory: (
    input: Requests['readMembershipHistory'],
  ): Promise<Result<Responses['readMembershipHistory']>> =>
    invoke('readMembershipHistory', input),
  readDependentHistory: (
    input: Requests['readDependentHistory'],
  ): Promise<Result<Responses['readDependentHistory']>> =>
    invoke('readDependentHistory', input),
  listLabOrders: (
    input: Requests['listLabOrders'],
  ): Promise<Result<Responses['listLabOrders']>> =>
    invoke('listLabOrders', input),
  listLabQueue: (
    input: Requests['listLabQueue'],
  ): Promise<Result<Responses['listLabQueue']>> =>
    invoke('listLabQueue', input),
  createLabOrder: (
    input: Requests['createLabOrder'],
  ): Promise<Result<Responses['createLabOrder']>> =>
    invoke('createLabOrder', input),
  startLabOrder: (
    input: Requests['startLabOrder'],
  ): Promise<Result<Responses['startLabOrder']>> =>
    invoke('startLabOrder', input),
  cancelLabOrder: (
    input: Requests['cancelLabOrder'],
  ): Promise<Result<Responses['cancelLabOrder']>> =>
    invoke('cancelLabOrder', input),
  rejectLabOrder: (
    input: Requests['rejectLabOrder'],
  ): Promise<Result<Responses['rejectLabOrder']>> =>
    invoke('rejectLabOrder', input),
  saveLabResult: (
    input: Requests['saveLabResult'],
  ): Promise<Result<Responses['saveLabResult']>> =>
    invoke('saveLabResult', input),
  finalizeLabResult: (
    input: Requests['finalizeLabResult'],
  ): Promise<Result<Responses['finalizeLabResult']>> =>
    invoke('finalizeLabResult', input),
  correctLabResult: (
    input: Requests['correctLabResult'],
  ): Promise<Result<Responses['correctLabResult']>> =>
    invoke('correctLabResult', input),
  reviewLabOrder: (
    input: Requests['reviewLabOrder'],
  ): Promise<Result<Responses['reviewLabOrder']>> =>
    invoke('reviewLabOrder', input),
  listAppointments: (
    input: Requests['listAppointments'],
  ): Promise<Result<Responses['listAppointments']>> =>
    invoke('listAppointments', input),
  createAppointment: (
    input: Requests['createAppointment'],
  ): Promise<Result<Responses['createAppointment']>> =>
    invoke('createAppointment', input),
  transitionAppointment: (
    input: Requests['transitionAppointment'],
  ): Promise<Result<Responses['transitionAppointment']>> =>
    invoke('transitionAppointment', input),
  correctAppointment: (
    input: Requests['correctAppointment'],
  ): Promise<Result<Responses['correctAppointment']>> =>
    invoke('correctAppointment', input),
  readClinicalSummary: (
    input: Requests['readClinicalSummary'],
  ): Promise<Result<Responses['readClinicalSummary']>> =>
    invoke('readClinicalSummary', input),
  createSummaryItem: (
    input: Requests['createSummaryItem'],
  ): Promise<Result<Responses['createSummaryItem']>> =>
    invoke('createSummaryItem', input),
  updateSummaryItem: (
    input: Requests['updateSummaryItem'],
  ): Promise<Result<Responses['updateSummaryItem']>> =>
    invoke('updateSummaryItem', input),
  correctSummaryItem: (
    input: Requests['correctSummaryItem'],
  ): Promise<Result<Responses['correctSummaryItem']>> =>
    invoke('correctSummaryItem', input),
  inactivateSummaryItem: (
    input: Requests['inactivateSummaryItem'],
  ): Promise<Result<Responses['inactivateSummaryItem']>> =>
    invoke('inactivateSummaryItem', input),
  readSummaryHistory: (
    input: Requests['readSummaryHistory'],
  ): Promise<Result<Responses['readSummaryHistory']>> =>
    invoke('readSummaryHistory', input),
  listAuditEvents: (
    input: Requests['listAuditEvents'],
  ): Promise<Result<Responses['listAuditEvents']>> =>
    invoke('listAuditEvents', input),
  listAuditActors: (): Promise<Result<Responses['listAuditActors']>> =>
    invoke('listAuditActors', undefined),
  readReport: (
    input: Requests['readReport'],
  ): Promise<Result<Responses['readReport']>> => invoke('readReport', input),
  exportReport: (
    input: Requests['exportReport'],
  ): Promise<Result<Responses['exportReport']>> =>
    invoke('exportReport', input),
  login: (input: Requests['login']): Promise<Result<Responses['login']>> =>
    invoke('login', input),
  currentStaff: (): Promise<Result<Responses['currentStaff']>> =>
    invoke('currentStaff', undefined),
  logout: (): Promise<Result<Responses['logout']>> =>
    invoke('logout', undefined),
  health: (): Promise<Result<Responses['health']>> =>
    invoke('health', undefined),
  searchPatients: (
    input: Requests['searchPatients'],
  ): Promise<Result<Responses['searchPatients']>> =>
    invoke('searchPatients', input),
  readPatient: (
    input: Requests['readPatient'],
  ): Promise<Result<Responses['readPatient']>> => invoke('readPatient', input),
  readDocuments: (
    input: Requests['readDocuments'],
  ): Promise<Result<Responses['readDocuments']>> =>
    invoke('readDocuments', input),
  createPatient: (
    input: Requests['createPatient'],
  ): Promise<Result<Responses['createPatient']>> =>
    invoke('createPatient', input),
  updatePatient: (
    input: Requests['updatePatient'],
  ): Promise<Result<Responses['updatePatient']>> =>
    invoke('updatePatient', input),
  readVitals: (
    input: Requests['readVitals'],
  ): Promise<Result<Responses['readVitals']>> => invoke('readVitals', input),
  createVitals: (
    input: Requests['createVitals'],
  ): Promise<Result<Responses['createVitals']>> =>
    invoke('createVitals', input),
  updateVitals: (
    input: Requests['updateVitals'],
  ): Promise<Result<Responses['updateVitals']>> =>
    invoke('updateVitals', input),
  finalizeVitals: (
    input: Requests['finalizeVitals'],
  ): Promise<Result<Responses['finalizeVitals']>> =>
    invoke('finalizeVitals', input),
  correctVitals: (
    input: Requests['correctVitals'],
  ): Promise<Result<Responses['correctVitals']>> =>
    invoke('correctVitals', input),
  readEntries: (
    input: Requests['readEntries'],
  ): Promise<Result<Responses['readEntries']>> => invoke('readEntries', input),
  createMedicalEntry: (
    input: Requests['createMedicalEntry'],
  ): Promise<Result<Responses['createMedicalEntry']>> =>
    invoke('createMedicalEntry', input),
  updateMedicalEntry: (
    input: Requests['updateMedicalEntry'],
  ): Promise<Result<Responses['updateMedicalEntry']>> =>
    invoke('updateMedicalEntry', input),
  finalizeEntry: (
    input: Requests['finalizeEntry'],
  ): Promise<Result<Responses['finalizeEntry']>> =>
    invoke('finalizeEntry', input),
  correctEntry: (
    input: Requests['correctEntry'],
  ): Promise<Result<Responses['correctEntry']>> =>
    invoke('correctEntry', input),
  readCorrections: (
    input: Requests['readCorrections'],
  ): Promise<Result<Responses['readCorrections']>> =>
    invoke('readCorrections', input),
  previewDocument: (
    input: Requests['previewDocument'],
  ): Promise<Result<Responses['previewDocument']>> =>
    invoke('previewDocument', input),
  issueDocument: (
    input: Requests['issueDocument'],
  ): Promise<Result<Responses['issueDocument']>> =>
    invoke('issueDocument', input),
  readDocument: (
    input: Requests['readDocument'],
  ): Promise<Result<Responses['readDocument']>> =>
    invoke('readDocument', input),
  listPrinters: (): Promise<Result<Responses['listPrinters']>> =>
    invoke('listPrinters', undefined),
  printDocument: (
    input: Requests['printDocument'],
  ): Promise<Result<Responses['printDocument']>> =>
    invoke('printDocument', input),
  onSessionReset: (listener: (event: SessionReset) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      reset: SessionReset,
    ): void => listener(reset);
    ipcRenderer.on('clinic:session-reset', handler);
    return (): void => {
      ipcRenderer.removeListener('clinic:session-reset', handler);
    };
  },
} satisfies ClinicApi);
contextBridge.exposeInMainWorld(
  'desktop',
  Object.freeze({ platform: process.platform, clinic } satisfies DesktopApi),
);

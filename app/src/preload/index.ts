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

import type {
  ErrorCode,
  IssuedDocument,
  PrintInput,
  Printer,
  Requests,
  Responses,
  Result,
  SessionReset,
  Staff,
} from '../shared/clinic-api';
import {
  issuedDocument,
  patientIdentity,
  requestGuards,
  responseGuards,
  staff,
} from './contracts';
import { array, object, record, revision, text, timestamp } from './validation';

export interface RequestSender {
  senderId: number;
  isMainFrame: boolean;
  url: string;
}
export interface PrintService {
  listPrinters: () => Promise<Printer[]>;
  print: (
    document: IssuedDocument,
    options: PrintInput,
    stillAuthorized: () => boolean,
  ) => Promise<void>;
  cancel: () => void;
}
export interface BrokerOptions {
  serverUrl: string;
  allowSyntheticHttp: boolean;
  packaged: boolean;
  rendererUrl: string;
  senderId: number;
  fetch: (url: string, options: RequestInit) => Promise<Response>;
  reset: (event: SessionReset) => void;
  printer: PrintService;
  timeoutMs?: number;
}
type ErrorDetails = {
  fieldErrors?: Record<string, string>;
  currentRevision?: number;
};
export class BoundaryError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
  }
}
export function serverOrigin(
  value: string,
  allowSyntheticHttp: boolean,
  packaged: boolean,
): string {
  const url = new URL(value);
  const synthetic =
    !packaged &&
    allowSyntheticHttp &&
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    (!synthetic && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Configure a trusted HTTPS clinic server origin; synthetic HTTP is loopback-only and unpackaged.',
    );
  return url.origin;
}
const messages: Record<ErrorCode, string> = {
  VALIDATION: 'Check the supplied fields.',
  UNAUTHENTICATED: 'Sign in to continue.',
  FORBIDDEN: 'This operation is not permitted.',
  NOT_FOUND: 'The requested record is unavailable.',
  CONFLICT: 'The record changed; reload before saving.',
  UNAVAILABLE: 'The clinic server is unavailable. No save was confirmed.',
  INVALID_RESPONSE: 'The clinic server returned an unexpected response.',
  SESSION_CHANGED: 'The staff session changed. Reload after signing in.',
  PRINT_FAILED:
    'The printer did not confirm submission. Check the printer before retrying.',
  PRINTER_UNAVAILABLE: 'Select an available printer.',
  TEMPLATE_UNAVAILABLE: 'The approved print template is not installed.',
};
function failed<T>(code: ErrorCode, details: ErrorDetails = {}): Result<T> {
  return { ok: false, error: { code, message: messages[code], ...details } };
}
function errorDetails(
  value: unknown,
  status: number,
  body: unknown,
): ErrorDetails {
  try {
    const error = record(value);
    if (
      status === 409 &&
      (error.code === 'STALE_REVISION' || error.code === 'CONFLICT')
    )
      return { currentRevision: revision(error.currentRevision) };
    if (status === 400 && error.code === 'VALIDATION') {
      const fields = record(error.fieldErrors);
      const input = record(body);
      if (Object.keys(fields).length > 30) return {};
      const fieldErrors: Record<string, string> = {};
      for (const [key, message] of Object.entries(fields)) {
        if (
          Object.hasOwn(input, key) &&
          /^[a-zA-Z][a-zA-Z0-9]*$/.test(key) &&
          typeof message === 'string' &&
          message.length <= 200
        )
          fieldErrors[key] = 'Invalid value.';
      }
      return Object.keys(fieldErrors).length ? { fieldErrors } : {};
    }
  } catch {
    /* Untrusted error detail never changes the safe status message. */
  }
  return {};
}
interface Route {
  path: string;
  method: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}
function route<K extends keyof Requests>(name: K, input: Requests[K]): Route {
  const value = input as unknown as Record<string, unknown> | undefined;
  const id = value?.id as string;
  const patientId = value?.patientId as string;
  const body = Object.fromEntries(
    Object.entries(value ?? {}).filter(
      ([key]) => key !== 'id' && key !== 'patientId',
    ),
  );
  // IDs were validated before this fixed route construction.
  switch (name) {
    case 'login':
      return { path: '/auth/login', method: 'POST', body: input };
    case 'currentStaff':
      return { path: '/auth/me', method: 'GET' };
    case 'logout':
      return { path: '/auth/logout', method: 'POST', body: {} };
    case 'health':
      return { path: '/health', method: 'GET' };
    case 'searchPatients':
      return {
        path: `/patients?search=${encodeURIComponent(value?.search as string)}`,
        method: 'GET',
      };
    case 'readPatient':
      return { path: `/patients/${id}`, method: 'GET' };
    case 'readDocuments':
      return { path: `/patients/${patientId}/documents`, method: 'GET' };
    case 'createPatient':
      return { path: '/patients', method: 'POST', body: input };
    case 'updatePatient':
      return { path: `/patients/${id}`, method: 'PATCH', body };
    case 'readVitals':
      return { path: `/patients/${patientId}/vitals`, method: 'GET' };
    case 'createVitals':
      return { path: `/patients/${patientId}/vitals`, method: 'POST', body };
    case 'updateVitals':
      return { path: `/vitals/${id}`, method: 'PATCH', body };
    case 'finalizeVitals':
      return { path: `/vitals/${id}/finalize`, method: 'POST', body };
    case 'correctVitals':
      return { path: `/vitals/${id}/corrections`, method: 'POST', body };
    case 'readEntries':
      return {
        path: `/patients/${patientId}/charts/${value?.discipline as string}/entries`,
        method: 'GET',
      };
    case 'createMedicalEntry':
      return {
        path: `/patients/${patientId}/charts/medical/entries`,
        method: 'POST',
        body,
      };
    case 'updateMedicalEntry':
      return { path: `/entries/${id}`, method: 'PATCH', body };
    case 'finalizeEntry':
      return { path: `/entries/${id}/finalize`, method: 'POST', body };
    case 'correctEntry':
      return { path: `/entries/${id}/corrections`, method: 'POST', body };
    case 'readCorrections':
      return { path: `/entries/${id}/corrections`, method: 'GET' };
    case 'previewDocument':
      return { path: '/documents/preview', method: 'POST', body: input };
    case 'issueDocument':
      return { path: '/documents', method: 'POST', body: input };
    case 'readDocument':
      return { path: `/documents/${id}`, method: 'GET' };
    default:
      throw new BoundaryError('FORBIDDEN', 'Unknown operation');
  }
}
export class ClinicBroker {
  private readonly origin: string;
  private token: string | undefined;
  private principal: Staff | undefined;
  private generation = 0;
  private readonly pending = new Set<AbortController>();
  constructor(private readonly options: BrokerOptions) {
    this.origin = serverOrigin(
      options.serverUrl,
      options.allowSyntheticHttp,
      options.packaged,
    );
  }
  clear(reason: SessionReset['reason']): void {
    this.token = undefined;
    this.principal = undefined;
    this.generation += 1;
    for (const request of this.pending) request.abort();
    this.options.printer.cancel();
    this.options.reset({ generation: this.generation, reason });
  }
  private trusted(sender: RequestSender): boolean {
    return (
      sender.senderId === this.options.senderId &&
      sender.isMainFrame &&
      sender.url === this.options.rendererUrl
    );
  }
  private async request(target: Route, token?: string): Promise<unknown> {
    const url = `${this.origin}${target.path}`;
    const controller = new AbortController();
    this.pending.add(controller);
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 10000,
    );
    try {
      const response = await this.options.fetch(url, {
        method: target.method,
        headers: {
          Accept: 'application/json',
          ...(target.body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:
          target.body === undefined ? undefined : JSON.stringify(target.body),
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.url && response.url !== url)
        throw new BoundaryError(
          'INVALID_RESPONSE',
          'Unexpected server identity',
        );
      if (!response.ok) {
        const codes: Record<number, ErrorCode> = {
          400: 'VALIDATION',
          401: 'UNAUTHENTICATED',
          403: 'FORBIDDEN',
          404: 'NOT_FOUND',
          409: 'CONFLICT',
          503: 'UNAVAILABLE',
        };
        let details: ErrorDetails = {};
        if (
          [400, 409].includes(response.status) &&
          response.headers.get('content-type')?.includes('application/json')
        ) {
          try {
            const raw = await response.text();
            if (raw.length <= 10000)
              details = errorDetails(
                JSON.parse(raw) as unknown,
                response.status,
                target.body,
              );
          } catch {
            /* The HTTP status is enough if the safe error body cannot be read. */
          }
        }
        throw new BoundaryError(
          codes[response.status] ?? 'UNAVAILABLE',
          'Server operation failed',
          details,
        );
      }
      if (
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .includes('application/json')
      )
        throw new BoundaryError('INVALID_RESPONSE', 'Expected JSON');
      const raw = await response.text();
      if (raw.length > 2_000_000)
        throw new BoundaryError('INVALID_RESPONSE', 'Response too large');
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw new BoundaryError('INVALID_RESPONSE', 'Malformed JSON');
      }
    } catch (error: unknown) {
      if (error instanceof BoundaryError) throw error;
      throw new BoundaryError('UNAVAILABLE', 'Network failure');
    } finally {
      clearTimeout(timer);
      this.pending.delete(controller);
    }
  }
  async invoke<K extends keyof Requests>(
    name: K,
    payload: unknown,
    sender: RequestSender,
  ): Promise<Result<Responses[K]>> {
    if (!this.trusted(sender) || !Object.hasOwn(requestGuards, name))
      return failed('FORBIDDEN');
    let input: Requests[K];
    try {
      input = requestGuards[name](payload) as Requests[K];
    } catch {
      return failed('VALIDATION');
    }
    if (name === 'login') {
      const previousToken = this.token;
      this.clear('account-switch');
      if (previousToken)
        void this.request(route('logout', undefined), previousToken).catch(
          () => undefined,
        );
    }
    const generation = this.generation;
    const token = this.token;
    if (name === 'logout') {
      this.clear('logout');
      const logoutGeneration = this.generation;
      let serverRevoked = false;
      if (token) {
        try {
          object<{ loggedOut: true }>({
            loggedOut: (value): true => {
              if (value !== true)
                throw new Error('Invalid logout acknowledgement');
              return true;
            },
          })(await this.request(route('logout', undefined), token));
          serverRevoked = true;
        } catch {
          /* Local logout must finish even when the server is unavailable. */
        }
      }
      if (logoutGeneration !== this.generation)
        return failed('SESSION_CHANGED');
      return {
        ok: true,
        data: { loggedOut: true, serverRevoked } as Responses[K],
      };
    }
    if (name !== 'login' && name !== 'health' && !token)
      return failed('UNAUTHENTICATED');
    try {
      let data: unknown;
      if (name === 'listPrinters')
        data = await this.options.printer.listPrinters();
      else if (name === 'printDocument') {
        const options = input as Requests['printDocument'];
        const document = issuedDocument(
          await this.request(
            route('readDocument', { id: options.documentId }),
            token,
          ),
        );
        if (document.id !== options.documentId)
          throw new BoundaryError(
            'INVALID_RESPONSE',
            'Document identity mismatch',
          );
        const printers = await this.options.printer.listPrinters();
        if (!printers.some((printer) => printer.name === options.printerName))
          throw new BoundaryError('PRINTER_UNAVAILABLE', 'Printer unavailable');
        if (generation !== this.generation) return failed('SESSION_CHANGED');
        await this.options.printer.print(
          document,
          options,
          () => generation === this.generation && token === this.token,
        );
        data = { documentId: document.id, submitted: true };
      } else {
        const raw = await this.request(
          route(name, input),
          name === 'health' ? undefined : token,
        );
        if (name === 'login') {
          const login = object<{
            staff: Staff;
            token: string;
            expiresAt: string;
          }>({
            staff,
            token: (value): string => {
              const parsed = text(4096, 16)(value);
              if (!/^[A-Za-z0-9_-]+$/.test(parsed))
                throw new Error('Invalid token');
              return parsed;
            },
            expiresAt: timestamp,
          })(raw);
          if (generation !== this.generation) {
            void this.request(route('logout', undefined), login.token).catch(
              () => undefined,
            );
            return failed('SESSION_CHANGED');
          }
          if (Date.parse(login.expiresAt) <= Date.now())
            throw new BoundaryError('UNAUTHENTICATED', 'Expired session');
          if (login.staff.isHead && login.staff.role !== 'doctor')
            throw new BoundaryError('INVALID_RESPONSE', 'Invalid principal');
          this.token = login.token;
          this.principal = login.staff;
          data = { staff: login.staff, generation };
        } else {
          const guard =
            (name === 'searchPatients' || name === 'readPatient') &&
            this.principal?.role === 'medtech'
              ? name === 'searchPatients'
                ? array(patientIdentity)
                : patientIdentity
              : responseGuards[name as keyof typeof responseGuards];
          data = guard(raw);
          if (
            name === 'currentStaff' &&
            JSON.stringify(data) !== JSON.stringify(this.principal)
          )
            throw new BoundaryError(
              'UNAUTHENTICATED',
              'Session identity changed',
            );
          if (
            name === 'readEntries' &&
            (data as Responses['readEntries']).some(
              (entry) =>
                entry.discipline !==
                (input as Requests['readEntries']).discipline,
            )
          )
            throw new BoundaryError('INVALID_RESPONSE', 'Wrong discipline');
          if (
            name === 'readPatient' &&
            (data as Responses['readPatient']).id !==
              (input as Requests['readPatient']).id.toLowerCase()
          )
            throw new BoundaryError(
              'INVALID_RESPONSE',
              'Patient identity mismatch',
            );
          if (
            name === 'readDocuments' &&
            (data as Responses['readDocuments']).some(
              (document) =>
                document.patientId !==
                (input as Requests['readDocuments']).patientId.toLowerCase(),
            )
          )
            throw new BoundaryError(
              'INVALID_RESPONSE',
              'Patient history mismatch',
            );
          if (
            name === 'readDocument' &&
            (data as IssuedDocument).id !==
              (input as Requests['readDocument']).id
          )
            throw new BoundaryError(
              'INVALID_RESPONSE',
              'Document identity mismatch',
            );
        }
      }
      if (generation !== this.generation) return failed('SESSION_CHANGED');
      return { ok: true, data: data as Responses[K] };
    } catch (error: unknown) {
      if (generation !== this.generation) return failed('SESSION_CHANGED');
      const code =
        error instanceof BoundaryError ? error.code : 'INVALID_RESPONSE';
      if (code === 'UNAUTHENTICATED' && token === this.token)
        this.clear('expired');
      return failed(code, error instanceof BoundaryError ? error.details : {});
    }
  }
}

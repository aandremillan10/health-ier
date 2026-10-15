import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  ClinicApi,
  ClinicError,
  ClinicDocument,
  Entry,
  Patient,
  Principal,
  Vitals,
} from './clinic/contract';
import {
  canReadVitals,
  roleNames,
  visibleDisciplines,
} from './clinic/contract';
import { createDemoClinic, demoStaff } from './clinic/demo';
import { CommandPalette } from './clinic/CommandPalette';
import { Registry, PatientForm } from './clinic/Registry';
import { Chart } from './clinic/Chart';
import { chartNames } from './clinic/contract';
import type { ChartTab } from './clinic/contract';
import { EntryForm, VitalsForm } from './clinic/ClinicalForms';
import { Documents } from './clinic/Documents';
import { ClinicIcon, ErrorNotice, Field } from './clinic/ui';
import { useOperation } from './clinic/use-operation';
import { date } from './clinic/format';
import { createDesktopClient } from './clinic/desktop-client';
import { ClinicalSummary } from './clinic/ClinicalSummary';
import { canReadClinicalSummary } from '../shared/clinical-summary';
import { AuditViewer } from './clinic/AuditViewer';
import { Appointments } from './clinic/Appointments';
import { Laboratory } from './clinic/Laboratory';
import { Reports } from './clinic/Reports';
import { PatientFamily } from './clinic/PatientFamily';
import { Referrals } from './clinic/Referrals';
import './clinic/operations.css';

type Screen =
  | {
      kind:
        | 'registry'
        | 'register'
        | 'editPatient'
        | 'audit'
        | 'appointments'
        | 'laboratory'
        | 'reports'
        | 'family'
        | 'referrals';
    }
  | { kind: 'chart'; tab: ChartTab }
  | { kind: 'entry'; entry?: Entry; correction?: boolean }
  | { kind: 'vitals'; record?: Vitals; correction?: boolean }
  | {
      kind: 'document';
      entry?: Entry;
      document?: ClinicDocument;
      documentKind?: 'prescription' | 'certificate';
    };

const toolNames: Partial<Record<Screen['kind'], string>> = {
  audit: 'Audit trail',
  appointments: 'Clinic flow',
  laboratory: 'Laboratory orders',
  reports: 'Reports',
  family: 'Family and eligibility',
  referrals: 'Referrals',
};

function revealPatientNavigation(event: FocusEvent<HTMLElement>): void {
  const identity =
    event.currentTarget.previousElementSibling?.getBoundingClientRect();
  const control = event.target.getBoundingClientRect();
  if (identity && control.top < identity.bottom)
    window.scrollBy({
      top: control.top - identity.bottom - 12,
      behavior: 'instant',
    });
}

export function App(): ReactElement {
  const [fixture] = useState(() =>
    __CLINIC_BROWSER_QA__ ? createDemoClinic() : null,
  );
  const [bridge] = useState(() =>
    window.desktop?.clinic
      ? createDesktopClient(window.desktop.clinic)
      : __CLINIC_BROWSER_QA__
        ? (window.clinicApi ?? null)
        : null,
  );
  const [api, setApi] = useState<ClinicApi | null>(() => bridge);
  const [staff, setStaff] = useState<Principal | null>(null);
  const [demo, setDemo] = useState(false);
  const [session, setSession] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('demo-doctor-1');
  const [sessionNotice, setSessionNotice] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const loginAttempt = useRef(0);
  const loginPending = useRef(false);
  const { busy, error, run, clearError } = useOperation();
  const expire = useCallback((): void => {
    loginAttempt.current++;
    setStaff(null);
    setPassword('');
    setUsername('');
    setSession((s) => s + 1);
    setSessionNotice('Your session changed or expired. Sign in again.');
  }, []);
  useEffect(() => {
    if (demo) return;
    return bridge?.onSessionReset?.((reason) => {
      expire();
      if (reason !== 'expired') setSessionNotice('');
    });
  }, [bridge, demo, expire]);
  async function login(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (signingOut || loginPending.current) return;
    if (!bridge) {
      setSessionNotice(
        fixture
          ? 'Live sign-in requires the desktop app. Use the labeled frontend demo for browser QA.'
          : 'The desktop connection is unavailable. Restart the clinic app and try again.',
      );
      setPassword('');
      return;
    }
    loginPending.current = true;
    const attempt = ++loginAttempt.current;
    setStaff(null);
    setSession((s) => s + 1);
    const result = await run(() => bridge.login({ username, password }));
    loginPending.current = false;
    setPassword('');
    if (attempt !== loginAttempt.current) return;
    if (result) {
      setApi(bridge);
      setDemo(false);
      setStaff(result);
      setSession((s) => s + 1);
      setSessionNotice('');
    }
  }
  function openDemo(): void {
    if (!fixture) return;
    loginAttempt.current++;
    clearError();
    setApi(fixture.api);
    setDemo(true);
    setStaff(fixture.selectStaff(selectedStaff));
    setSession((s) => s + 1);
    setPassword('');
    setSessionNotice('');
  }
  const logout = useCallback(async (): Promise<void> => {
    // Clear the renderer even if invalidation fails. Backend owns token cleanup.
    loginAttempt.current++;
    setStaff(null);
    setPassword('');
    setUsername('');
    clearError();
    setSession((s) => s + 1);
    setSessionNotice('');
    setSigningOut(true);
    try {
      const result = await api?.logout();
      if (result && !result.ok)
        setSessionNotice(
          'Local view cleared. Server sign-out could not be confirmed; check the clinic connection.',
        );
    } catch {
      setSessionNotice(
        'Local view cleared. Server sign-out could not be confirmed; check the clinic connection.',
      );
    } finally {
      setSigningOut(false);
    }
  }, [api, clearError]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {staff && api ? (
        <Workspace
          key={session}
          api={api}
          staff={staff}
          demo={demo}
          fixture={fixture}
          onLogout={logout}
          onExpired={expire}
        />
      ) : (
        <main id="main-content" className="sign-in">
          <div className="login-layout">
            <section className="login-intro" aria-labelledby="workspace-title">
              <div className="login-identity">
                <img src="./amlig-logo.png" alt="" width="48" height="48" />
                <div>
                  <strong>AMLIG</strong>
                  <span>Iloilo Provincial HMO-Clinic</span>
                </div>
              </div>
              <div>
                <h2 id="workspace-title">Your clinic workspace</h2>
                <p>
                  Patient records, daily clinic flow, and clinical documents in
                  one place.
                </p>
              </div>
              <p className="login-access">
                Your staff role determines which records and actions are
                available.
              </p>
            </section>
            <section className="login-panel">
              <h1>Staff sign-in</h1>
              <p className="login-description">
                Use your assigned clinic account to continue.
              </p>
              {sessionNotice && (
                <p className="notice warning" role="status">
                  {sessionNotice}
                </p>
              )}
              <ErrorNotice error={error} />
              <form onSubmit={(e) => void login(e)}>
                <Field label="Username" name="username" error={error}>
                  <Input
                    disabled={busy || signingOut}
                    id="username"
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </Field>
                <Field label="Password" name="password" error={error}>
                  <div className="pw-field">
                    <Input
                      disabled={busy || signingOut}
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        setCapsLock(e.getModifierState('CapsLock'));
                      }}
                      onKeyUp={(e) => {
                        setCapsLock(e.getModifierState('CapsLock'));
                      }}
                      onBlur={() => setCapsLock(false)}
                      autoComplete="current-password"
                      required
                      aria-invalid={Boolean(error?.fieldErrors?.password)}
                      aria-describedby={
                        error?.fieldErrors?.password
                          ? 'password-error'
                          : undefined
                      }
                    />
                    {capsLock && (
                      <span className="pw-caps" role="status">
                        <svg
                          aria-hidden="true"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <title>Caps Lock is on.</title>
                          <path d="M12 1.2 20.2 7.8H16v8c0 .55-.45 1-1 1H9c-.55 0-1-.45-1-1v-8H3.8L12 1.2Z" />
                          <rect
                            x="8.1"
                            y="19.5"
                            width="7.8"
                            height="2.4"
                            rx="1.2"
                          />
                        </svg>
                        <span className="sr-only">Caps Lock is on.</span>
                      </span>
                    )}
                    <button
                      type="button"
                      className="pw-toggle"
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      <svg
                        aria-hidden="true"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                        {showPassword ? <path d="m3 3 18 18" /> : null}
                      </svg>
                    </button>
                  </div>
                </Field>
                <Button type="submit" disabled={busy || signingOut}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
              {!bridge && !sessionNotice && (
                <p className="hint">
                  {fixture
                    ? 'Browser QA uses fictional records. Live sign-in requires the desktop app.'
                    : 'The desktop connection is unavailable. Restart the clinic app and try again.'}
                </p>
              )}
              {fixture && (
                <section className="fixture-launch">
                  <h2>Frontend demo</h2>
                  <p className="hint">
                    Fictional records. Changes reset on reload.
                  </p>
                  <Field label="Demo staff" name="demo-staff">
                    <select
                      className="clinic-select"
                      id="demo-staff"
                      value={selectedStaff}
                      onChange={(e) => setSelectedStaff(e.target.value)}
                    >
                      {demoStaff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName} · {roleNames[s.role]}
                          {s.isHead ? ' · Clinic head' : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button
                    variant="outline"
                    onClick={openDemo}
                    disabled={busy || signingOut}
                  >
                    Open frontend demo
                  </Button>
                </section>
              )}
            </section>
          </div>
        </main>
      )}
    </>
  );
}

function Workspace({
  api,
  staff,
  demo,
  fixture,
  onLogout,
  onExpired,
}: {
  api: ClinicApi;
  staff: Principal;
  demo: boolean;
  fixture: ReturnType<typeof createDemoClinic> | null;
  onLogout: () => Promise<void>;
  onExpired: () => void;
}): ReactElement {
  const [context, setContext] = useState<{
    screen: Screen;
    patient: Patient | null;
    generation: number;
  }>({ screen: { kind: 'registry' }, patient: null, generation: 0 });
  const { screen, patient, generation } = context;
  const [palette, setPalette] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const paletteOrigin = useRef<HTMLElement | null>(null);
  const patientDestination = useRef<Screen | null>(null);
  function choosePatient(): void {
    patientDestination.current = screen;
    paletteOrigin.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPalette(true);
  }
  const restorePaletteFocus = useCallback((): void => {
    if (paletteOrigin.current?.isConnected) paletteOrigin.current.focus();
  }, []);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const selection = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClinicError | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [wan, setWan] = useState(true);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLElement>(null);
  const markDirty = useCallback((value: boolean): void => {
    dirtyRef.current = value;
    setDirty(value);
    if (value) {
      selection.current++;
      setBusy(false);
    }
  }, []);
  useEffect(
    () => (): void => {
      selection.current++;
    },
    [],
  );
  const refreshHealth = useCallback(async (): Promise<void> => {
    try {
      setAvailable(null);
      const result = await api.health();
      setAvailable(result.ok ? result.data.available : false);
      if (!result.ok && result.error.code === 'UNAUTHENTICATED') onExpired();
    } catch {
      setAvailable(false);
    }
  }, [api, onExpired]);
  useEffect(() => {
    let active = true;
    void api
      .health()
      .then((r) => {
        if (active) setAvailable(r.ok ? r.data.available : false);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return (): void => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    if (!dirty) return;
    function guard(event: BeforeUnloadEvent): void {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', guard);
    return (): void => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  useEffect(() => {
    function toggle(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        patientDestination.current = null;
        if (!document.querySelector('.command-dialog[open]'))
          paletteOrigin.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        setPalette((current) => !current);
      }
    }
    window.addEventListener('keydown', toggle);
    return (): void => window.removeEventListener('keydown', toggle);
  }, []);
  useEffect(() => {
    const label =
      toolNames[screen.kind] ??
      (screen.kind === 'chart'
        ? screen.tab === 'details'
          ? 'Patient details'
          : screen.tab === 'vitals'
            ? 'Vital signs'
            : chartNames[screen.tab]
        : screen.kind === 'register'
          ? 'Register patient'
          : screen.kind === 'editPatient'
            ? 'Edit patient details'
            : screen.kind === 'entry'
              ? screen.correction
                ? 'Correct medical entry'
                : 'Medical entry'
              : screen.kind === 'vitals'
                ? screen.correction
                  ? 'Correct vital signs'
                  : 'Vital signs'
                : screen.kind === 'document'
                  ? screen.documentKind === 'certificate'
                    ? 'Medical certificate'
                    : 'Prescription'
                  : 'Patient records');
    document.title = patient
      ? `${label} · ${patient.fullName} — AMLIG`
      : `${label} — AMLIG`;
  }, [screen, patient]);
  useEffect(() => {
    if (demo) return;
    let active = true;
    async function validateSession(): Promise<void> {
      try {
        const result = await api.me();
        if (!active) return;
        if (
          (!result.ok &&
            ['UNAUTHENTICATED', 'DENIED'].includes(result.error.code)) ||
          (result.ok &&
            (result.data.id !== staff.id ||
              result.data.role !== staff.role ||
              result.data.isHead !== staff.isHead))
        )
          onExpired();
      } catch {
        /* Connection loss does not prove revocation. */
      }
    }
    window.addEventListener('focus', validateSession);
    const timer = window.setInterval(() => void validateSession(), 60000);
    return (): void => {
      active = false;
      window.removeEventListener('focus', validateSession);
      window.clearInterval(timer);
    };
  }, [api, demo, onExpired, staff]);
  function commit(
    next: Screen,
    nextPatient: Patient | null,
    feedback = '',
  ): void {
    selection.current++;
    setBusy(false);
    setError(null);
    markDirty(false);
    setNotice(feedback);
    setNavigationOpen(false);
    setContext((current) => ({
      screen: next,
      patient: nextPatient,
      generation: current.generation + 1,
    }));
    requestAnimationFrame(() =>
      heading.current?.focus({ preventScroll: true }),
    );
    window.scrollTo(0, 0);
  }
  function navigate(next: Screen, nextPatient = patient): void {
    selection.current++;
    setBusy(false);
    if (dirtyRef.current && !window.confirm('Discard unsaved changes?')) return;
    commit(
      next,
      next.kind === 'registry' || next.kind === 'register' ? null : nextPatient,
    );
  }
  async function select(
    record: Pick<Patient, 'id'>,
    destination: Screen = { kind: 'chart', tab: 'details' },
  ): Promise<void> {
    const request = ++selection.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.getPatient({ id: record.id });
      if (request !== selection.current) return;
      if (!result.ok) {
        setError(result.error);
        if (result.error.code === 'UNAUTHENTICATED') onExpired();
        return;
      }
      if (result.data.id !== record.id) {
        setError({
          code: 'UNAVAILABLE',
          message: 'The selected patient could not be confirmed. Search again.',
        });
        return;
      }
      navigate(destination, result.data);
    } catch {
      if (request === selection.current)
        setError({
          code: 'UNAVAILABLE',
          message:
            'Unable to open this patient. Your current input is unchanged. Check the clinic connection and try again.',
        });
    } finally {
      if (request === selection.current) setBusy(false);
    }
  }
  function saved(record: Patient): void {
    commit(
      { kind: 'chart', tab: 'details' },
      record,
      demo ? 'Demo patient saved in memory.' : 'Saved on this clinic server.',
    );
  }
  function done(tab: ChartTab): void {
    commit(
      { kind: 'chart', tab },
      patient,
      demo ? 'Demo changes saved in memory.' : 'Saved on this clinic server.',
    );
  }
  function backToChart(tab: ChartTab): void {
    navigate({ kind: 'chart', tab });
  }
  const currentTab = toolNames[screen.kind]
    ? null
    : screen.kind === 'chart'
      ? screen.tab
      : screen.kind === 'vitals'
        ? 'vitals'
        : screen.kind === 'entry' || screen.kind === 'document'
          ? 'medical'
          : 'details';
  const recordsActive = !toolNames[screen.kind] || screen.kind === 'family';
  return (
    <>
      <div className="workspace">
        <aside className={`sidebar ${navigationOpen ? 'navigation-open' : ''}`}>
          <div className="sidebar-heading">
            <div className="brand">
              <img src="./amlig-logo.png" alt="" width="44" height="44" />
              <div>
                <strong>AMLIG</strong>
                <span>HMO-Clinic · Iloilo</span>
              </div>
            </div>
            <Button
              className="clinic-menu"
              variant="outline"
              aria-label="Clinic menu"
              aria-expanded={navigationOpen}
              aria-controls="clinic-navigation"
              onClick={() => setNavigationOpen((open) => !open)}
            >
              <ClinicIcon name="menu" />
              Menu
            </Button>
          </div>
          <div id="clinic-navigation" className="sidebar-content">
            <nav aria-label="Clinic navigation">
              <span className="nav-label">Clinic workspace</span>
              <Button
                className={`nav-item ${recordsActive ? 'selected' : ''}`}
                aria-current={recordsActive ? 'page' : undefined}
                variant="ghost"
                onClick={() => navigate({ kind: 'registry' })}
              >
                <ClinicIcon name="records" />
                Patient records
              </Button>
              <Button
                className={`nav-item ${screen.kind === 'appointments' ? 'selected' : ''}`}
                variant="ghost"
                aria-current={
                  screen.kind === 'appointments' ? 'page' : undefined
                }
                onClick={() => navigate({ kind: 'appointments' })}
              >
                <ClinicIcon name="flow" />
                Clinic flow
              </Button>
              {['doctor', 'dentist', 'medtech'].includes(staff.role) && (
                <Button
                  className={`nav-item ${screen.kind === 'referrals' ? 'selected' : ''}`}
                  variant="ghost"
                  aria-current={
                    screen.kind === 'referrals' ? 'page' : undefined
                  }
                  onClick={() => navigate({ kind: 'referrals' })}
                >
                  <ClinicIcon name="referrals" />
                  Referrals
                </Button>
              )}
              {['doctor', 'dentist', 'medtech'].includes(staff.role) && (
                <Button
                  className={`nav-item ${screen.kind === 'laboratory' ? 'selected' : ''}`}
                  variant="ghost"
                  aria-current={
                    screen.kind === 'laboratory' ? 'page' : undefined
                  }
                  onClick={() => navigate({ kind: 'laboratory' })}
                >
                  <ClinicIcon name="lab" />
                  Laboratory orders
                </Button>
              )}
              {(staff.isHead ||
                ['clerk', 'attendant'].includes(staff.role)) && (
                <Button
                  className={`nav-item ${screen.kind === 'reports' ? 'selected' : ''}`}
                  variant="ghost"
                  aria-current={screen.kind === 'reports' ? 'page' : undefined}
                  onClick={() => navigate({ kind: 'reports' })}
                >
                  <ClinicIcon name="reports" />
                  Reports
                </Button>
              )}
              {staff.isHead && (
                <Button
                  className={`nav-item ${screen.kind === 'audit' ? 'selected' : ''}`}
                  variant="ghost"
                  aria-current={screen.kind === 'audit' ? 'page' : undefined}
                  onClick={() => navigate({ kind: 'audit' })}
                >
                  <ClinicIcon name="audit" />
                  Audit trail
                </Button>
              )}
            </nav>
            <div className="sidebar-bottom">
              <div className="connection">
                <span
                  className={`status-dot ${available === null ? 'checking' : available ? 'online' : ''}`}
                />
                <strong role="status">
                  {available === null
                    ? 'Checking clinic connection…'
                    : available
                      ? demo
                        ? 'Demo connection available'
                        : 'Last connection check passed'
                      : 'Last connection check failed'}
                </strong>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || available === null}
                  onClick={() => void refreshHealth()}
                >
                  Check connection
                </Button>
              </div>
              <div className="staff-identity">
                <strong>{staff.displayName}</strong>
                <span>
                  {roleNames[staff.role]}
                  {staff.isHead ? ' · Clinic head' : ''}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (
                      !dirtyRef.current ||
                      window.confirm('Discard unsaved changes and sign out?')
                    ) {
                      selection.current++;
                      void onLogout();
                    }
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </aside>
        <div className="main-area">
          <header className="topbar">
            <nav className="breadcrumb" aria-label="Breadcrumb">
              {screen.kind === 'registry' ? (
                <span aria-current="page">Patient records</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => navigate({ kind: 'registry' })}
                  >
                    All patient records
                  </button>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">
                    {toolNames[screen.kind] ??
                      (screen.kind === 'chart'
                        ? screen.tab === 'details'
                          ? 'Patient details'
                          : screen.tab === 'vitals'
                            ? 'Vital signs'
                            : chartNames[screen.tab]
                        : screen.kind === 'register'
                          ? 'Register patient'
                          : screen.kind === 'editPatient'
                            ? 'Edit details'
                            : screen.kind === 'entry'
                              ? 'Medical entry'
                              : screen.kind === 'vitals'
                                ? 'Vital signs'
                                : 'Document')}
                  </span>
                </>
              )}
            </nav>
            <div className="topbar-actions">
              <Button
                className="quick-search"
                variant="outline"
                aria-label="Search patients"
                aria-haspopup="dialog"
                onClick={(event) => {
                  patientDestination.current = null;
                  paletteOrigin.current = event.currentTarget;
                  setPalette(true);
                }}
              >
                <ClinicIcon name="search" />
                <span>Search patients</span>
                <kbd className="kbd" aria-hidden="true">
                  Ctrl K
                </kbd>
              </Button>
              <span className={`badge ${demo ? 'warning' : ''}`}>
                {demo ? 'Frontend demo · Memory only' : 'Clinic LAN'}
              </span>
            </div>
          </header>
          <main id="main-content" ref={heading} tabIndex={-1}>
            {available === false && (
              <p className="notice error" role="alert">
                Clinic server unavailable. Input remains unsaved until a save
                succeeds. Check the clinic connection and try again.
              </p>
            )}
            {error && <ErrorNotice error={error} />}
            {busy && (
              <p role="status" className="notice">
                Opening patient record…
              </p>
            )}
            {notice && (
              <p className="notice success" role="status">
                {notice}
              </p>
            )}
            {dirty && screen.kind === 'register' && (
              <p className="badge warning">Unsaved changes</p>
            )}
            {patient &&
              screen.kind !== 'registry' &&
              screen.kind !== 'register' &&
              screen.kind !== 'reports' &&
              screen.kind !== 'audit' && (
                <div className="patient-banner">
                  <span className="patient-avatar" aria-hidden="true">
                    {patient.fullName
                      .split(' ')
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <div>
                    <h1>{patient.fullName}</h1>
                    <p>
                      {patient.id} · Birth date: {date(patient.dateOfBirth)}
                    </p>
                  </div>
                  {dirty && (
                    <span className="badge warning">Unsaved changes</span>
                  )}
                  {['appointments', 'laboratory', 'referrals'].includes(
                    screen.kind,
                  ) && (
                    <div className="patient-context-actions">
                      <Button
                        variant="outline"
                        disabled={dirty || busy}
                        onClick={choosePatient}
                      >
                        Change patient
                      </Button>
                      {(screen.kind === 'referrals' ||
                        (screen.kind === 'laboratory' &&
                          staff.role === 'medtech')) && (
                        <Button
                          variant="ghost"
                          onClick={() => navigate(screen, null)}
                        >
                          View work queue
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            {patient &&
              screen.kind !== 'registry' &&
              screen.kind !== 'register' &&
              screen.kind !== 'reports' &&
              screen.kind !== 'audit' && (
                <nav
                  className="patient-navigation"
                  aria-label="Patient navigation"
                  onFocusCapture={revealPatientNavigation}
                >
                  <Button
                    variant="ghost"
                    className={`patient-nav-item ${currentTab === 'details' ? 'selected' : ''}`}
                    aria-current={currentTab === 'details' ? 'page' : undefined}
                    onClick={() => backToChart('details')}
                  >
                    Patient details
                  </Button>
                  {canReadVitals(staff) && (
                    <Button
                      variant="ghost"
                      className={`patient-nav-item ${currentTab === 'vitals' ? 'selected' : ''}`}
                      aria-current={
                        currentTab === 'vitals' ? 'page' : undefined
                      }
                      onClick={() => backToChart('vitals')}
                    >
                      Vital signs
                    </Button>
                  )}
                  {visibleDisciplines(staff).map((d) => (
                    <Button
                      key={d}
                      variant="ghost"
                      className={`patient-nav-item ${currentTab === d ? 'selected' : ''}`}
                      aria-current={currentTab === d ? 'page' : undefined}
                      onClick={() => backToChart(d)}
                    >
                      {chartNames[d]}
                    </Button>
                  ))}
                  {(staff.role !== 'medtech' || staff.isHead) && (
                    <Button
                      variant="ghost"
                      className={`patient-nav-item ${screen.kind === 'family' ? 'selected' : ''}`}
                      aria-current={
                        screen.kind === 'family' ? 'page' : undefined
                      }
                      onClick={() => navigate({ kind: 'family' })}
                    >
                      Family and eligibility
                    </Button>
                  )}
                </nav>
              )}
            {screen.kind === 'registry' && (
              <Registry
                api={api}
                staff={staff}
                demo={demo}
                onSelect={(p) => void select(p)}
                onRegister={() => {
                  navigate({ kind: 'register' });
                }}
                onExpired={onExpired}
              />
            )}
            {screen.kind === 'audit' && (
              <AuditViewer api={api} onExpired={onExpired} />
            )}
            {screen.kind === 'appointments' && (
              <Appointments
                api={api}
                staff={staff}
                patient={patient}
                onExpired={onExpired}
                onDirty={markDirty}
                onOpenPatient={(id) => void select({ id })}
                onChoosePatient={choosePatient}
              />
            )}
            {screen.kind === 'laboratory' && (
              <Laboratory
                key={`${staff.id}/${patient?.id ?? 'queue'}`}
                api={api}
                staff={staff}
                patient={patient ?? undefined}
                demo={demo}
                onExpired={onExpired}
                onDirty={markDirty}
                onChoosePatient={choosePatient}
              />
            )}
            {screen.kind === 'reports' && (
              <Reports api={api} onExpired={onExpired} demo={demo} />
            )}
            {screen.kind === 'referrals' && (
              <Referrals
                key={`${staff.id}/${patient?.id ?? 'inbox'}`}
                api={api}
                staff={staff}
                patient={patient ?? undefined}
                demo={demo}
                onExpired={onExpired}
                onDirty={markDirty}
                onChoosePatient={choosePatient}
              />
            )}
            {screen.kind === 'family' && patient && (
              <PatientFamily
                key={`${staff.id}/${patient.id}`}
                api={api}
                staff={staff}
                patientId={patient.id}
                patientName={patient.fullName}
                demo={demo}
                onExpired={onExpired}
                onDirty={markDirty}
                onOpenPatient={(id) => void select({ id })}
                searchPatients={async (search) => {
                  const result = await api.findPatients({ search });
                  return result.ok
                    ? {
                        ok: true,
                        data: result.data.map((record) => ({
                          id: record.id,
                          revision: record.revision,
                          fullName: record.fullName,
                          sex: record.sex || null,
                          dateOfBirth: record.dateOfBirth,
                        })),
                      }
                    : {
                        ok: false,
                        error: {
                          code:
                            result.error.code === 'DENIED'
                              ? 'FORBIDDEN'
                              : result.error.code,
                          message: result.error.message,
                        },
                      };
                }}
              />
            )}
            {(screen.kind === 'register' || screen.kind === 'editPatient') && (
              <PatientForm
                key={generation}
                api={api}
                patient={
                  screen.kind === 'editPatient' && patient ? patient : undefined
                }
                onSaved={saved}
                onOpenExisting={(record) => void select(record)}
                onCancel={() =>
                  navigate(
                    patient
                      ? { kind: 'chart', tab: 'details' }
                      : { kind: 'registry' },
                  )
                }
                onDirty={markDirty}
                onExpired={onExpired}
              />
            )}
            {patient && screen.kind === 'chart' && (
              <Chart
                key={`${patient.id}/${screen.tab}`}
                api={api}
                staff={staff}
                patient={patient}
                tab={screen.tab}
                demo={demo}
                onEditPatient={() => navigate({ kind: 'editPatient' })}
                onEntry={(entry, correction) =>
                  navigate({ kind: 'entry', entry, correction })
                }
                onVitals={(record, correction) =>
                  navigate({ kind: 'vitals', record, correction })
                }
                onDocument={(entry, document, documentKind) =>
                  navigate({ kind: 'document', entry, document, documentKind })
                }
                onExpired={onExpired}
              />
            )}
            {patient &&
              screen.kind === 'chart' &&
              screen.tab === 'details' &&
              canReadClinicalSummary(staff) && (
                <ClinicalSummary
                  key={patient.id}
                  api={api}
                  staff={staff}
                  patientId={patient.id}
                  patientName={patient.fullName}
                  onExpired={onExpired}
                  onDirty={markDirty}
                  demo={demo}
                />
              )}
            {patient && screen.kind === 'entry' && (
              <EntryForm
                key={generation}
                api={api}
                patient={patient}
                entry={screen.entry}
                correction={screen.correction}
                onDone={() => done('medical')}
                onDirty={markDirty}
                onCancel={() => backToChart('medical')}
                onExpired={onExpired}
              />
            )}
            {patient && screen.kind === 'vitals' && (
              <VitalsForm
                key={generation}
                api={api}
                patient={patient}
                record={screen.record}
                correction={screen.correction}
                onDone={() => done('vitals')}
                onDirty={markDirty}
                onCancel={() => backToChart('vitals')}
                onExpired={onExpired}
              />
            )}
            {patient && screen.kind === 'document' && (
              <Documents
                key={generation}
                api={api}
                entry={screen.entry}
                issued={screen.document}
                kind={screen.documentKind}
                demo={demo}
                onDirty={markDirty}
                onBack={() => backToChart('medical')}
                onExpired={onExpired}
              />
            )}
          </main>
          {demo && fixture && (
            <details className="demo-controls">
              <summary>Demo controls</summary>
              <p className="hint">
                Synthetic frontend states only. No LAN, cloud, or printer
                integration is tested here.
              </p>
              <div className="demo-control-items">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={available === true}
                    onChange={(e) => {
                      fixture.setAvailable(e.target.checked);
                      setAvailable(e.target.checked);
                    }}
                  />
                  Clinic server available
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={wan}
                    onChange={(e) => setWan(e.target.checked)}
                  />
                  Internet available
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    fixture.conflictNext();
                    setNotice(
                      'The next revision-checked write will show a demo conflict.',
                    );
                  }}
                >
                  Simulate next revision conflict
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    fixture.failNextPrint();
                    setNotice(
                      'The next print request will show a demo printer failure.',
                    );
                  }}
                >
                  Simulate next print failure
                </Button>
              </div>
              {!wan && (
                <p className="hint">
                  Demo internet outage. Local operations remain available while
                  the simulated clinic server is available. Cloud mirroring is
                  Backend issue #11.
                </p>
              )}
            </details>
          )}
        </div>
      </div>
      <CommandPalette
        key={palette ? 'open' : 'closed'}
        api={api}
        staff={staff}
        open={palette}
        restoreFocus={restorePaletteFocus}
        onDismiss={() => setPalette(false)}
        onSelect={(record) => {
          setPalette(false);
          void select(record, patientDestination.current ?? undefined);
        }}
        onRegister={() => {
          setPalette(false);
          navigate({ kind: 'register' });
        }}
      />
    </>
  );
}

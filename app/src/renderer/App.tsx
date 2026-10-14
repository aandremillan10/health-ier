import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  ClinicApi,
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
import { ErrorNotice, Field } from './clinic/ui';
import { useOperation } from './clinic/use-operation';
import { date } from './clinic/format';
import { createDesktopClient } from './clinic/desktop-client';

type Screen =
  | { kind: 'registry' | 'register' | 'editPatient' }
  | { kind: 'chart'; tab: ChartTab }
  | { kind: 'entry'; entry?: Entry; correction?: boolean }
  | { kind: 'vitals'; record?: Vitals; correction?: boolean }
  | {
      kind: 'document';
      entry?: Entry;
      document?: ClinicDocument;
      documentKind?: 'prescription' | 'certificate';
    };

export function App(): ReactElement {
  const [fixture] = useState(createDemoClinic);
  const [bridge] = useState(() =>
    window.desktop?.clinic
      ? createDesktopClient(window.desktop.clinic)
      : (window.clinicApi ?? null),
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
  const panelRef = useRef<HTMLElement>(null);
  const { busy, error, run, clearError } = useOperation();
  const expire = useCallback((): void => {
    setStaff(null);
    setPassword('');
    setUsername('');
    clearError();
    setSession((s) => s + 1);
    setSessionNotice('Your session changed or expired. Sign in again.');
  }, [clearError]);
  function wobble(): void {
    const element = panelRef.current;
    if (!element) return;
    element.classList.remove('shake');
    void element.offsetWidth;
    element.classList.add('shake');
  }
  useEffect(() => {
    if (demo) return;
    return bridge?.onSessionReset?.((reason) => {
      expire();
      if (reason !== 'expired') setSessionNotice('');
    });
  }, [bridge, demo, expire]);
  async function login(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (signingOut) return;
    if (!bridge) {
      setSessionNotice(
        'Backend sign-in is not connected. Use the labeled frontend demo to review screens.',
      );
      setPassword('');
      return;
    }
    const result = await run(() => bridge.login({ username, password }));
    setPassword('');
    if (result) {
      setApi(bridge);
      setDemo(false);
      setStaff(result);
      setSession((s) => s + 1);
      setSessionNotice('');
      panelRef.current?.classList.remove('shake');
    } else {
      wobble();
    }
  }
  function openDemo(): void {
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
          <section className="login-panel" ref={panelRef}>
            <div className="login-identity">
              <img src="./amlig-logo.png" alt="" width="48" height="48" />
              <div>
                <strong>AMLIG</strong>
                <span>Iloilo Provincial HMO-Clinic</span>
              </div>
            </div>
            <h1>Staff sign-in</h1>
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
            {!bridge && (
              <p className="hint">Backend sign-in is not connected.</p>
            )}
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
          </section>
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
  fixture: ReturnType<typeof createDemoClinic>;
  onLogout: () => Promise<void>;
  onExpired: () => void;
}): ReactElement {
  const [screen, setScreen] = useState<Screen>({ kind: 'registry' });
  const [palette, setPalette] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [dirty, setDirty] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [wan, setWan] = useState(true);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLElement>(null);
  const { busy, error, run } = useOperation(onExpired);
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
        setPalette((current) => !current);
      }
    }
    window.addEventListener('keydown', toggle);
    return (): void => window.removeEventListener('keydown', toggle);
  }, []);
  useEffect(() => {
    const label =
      screen.kind === 'chart'
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
                  : 'Patient records';
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
  function navigate(next: Screen): void {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setDirty(false);
    setNotice('');
    setScreen(next);
    requestAnimationFrame(() => heading.current?.focus());
    window.scrollTo(0, 0);
  }
  async function select(record: Patient): Promise<void> {
    const result = await run(() => api.getPatient({ id: record.id }));
    if (result) {
      setPatient(result);
      navigate({ kind: 'chart', tab: 'details' });
    }
  }
  function saved(record: Patient): void {
    setPatient(record);
    setDirty(false);
    setScreen({ kind: 'chart', tab: 'details' });
    requestAnimationFrame(() => {
      heading.current?.focus();
      window.scrollTo(0, 0);
    });
    setNotice(
      demo ? 'Demo patient saved in memory.' : 'Saved on this clinic server.',
    );
  }
  function done(tab: ChartTab): void {
    setDirty(false);
    setScreen({ kind: 'chart', tab });
    requestAnimationFrame(() => {
      heading.current?.focus();
      window.scrollTo(0, 0);
    });
    setNotice(
      demo ? 'Demo changes saved in memory.' : 'Saved on this clinic server.',
    );
  }
  function backToChart(tab: ChartTab): void {
    navigate({ kind: 'chart', tab });
  }
  const currentTab =
    screen.kind === 'chart'
      ? screen.tab
      : screen.kind === 'vitals'
        ? 'vitals'
        : screen.kind === 'entry' || screen.kind === 'document'
          ? 'medical'
          : 'details';
  return (
    <>
      <div className="workspace">
        <aside className="sidebar">
          <div className="brand">
            <img src="./amlig-logo.png" alt="" width="44" height="44" />
            <div>
              <strong>AMLIG</strong>
              <span>HMO-Clinic · Iloilo</span>
            </div>
          </div>
          <nav aria-label="Clinic navigation">
            <Button
              className={`nav-item ${screen.kind === 'registry' ? 'selected' : ''}`}
              aria-current={screen.kind === 'registry' ? 'page' : undefined}
              variant="ghost"
              onClick={() => navigate({ kind: 'registry' })}
            >
              Patient records
            </Button>
            {patient &&
              screen.kind !== 'registry' &&
              screen.kind !== 'register' && (
                <div className="patient-navigation">
                  <span className="nav-label">Selected patient</span>
                  <Button
                    variant="ghost"
                    className={`nav-item ${currentTab === 'details' ? 'selected' : ''}`}
                    aria-current={currentTab === 'details' ? 'page' : undefined}
                    onClick={() => backToChart('details')}
                  >
                    Patient details
                  </Button>
                  {canReadVitals(staff) && (
                    <Button
                      variant="ghost"
                      className={`nav-item ${currentTab === 'vitals' ? 'selected' : ''}`}
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
                      className={`nav-item ${currentTab === d ? 'selected' : ''}`}
                      aria-current={currentTab === d ? 'page' : undefined}
                      onClick={() => backToChart(d)}
                    >
                      {chartNames[d]}
                    </Button>
                  ))}
                </div>
              )}
          </nav>
          <div className="sidebar-bottom">
            <div className="connection">
              <span className={`status-dot ${available ? 'online' : ''}`} />
              <strong>
                {available === null
                  ? 'Checking clinic server…'
                  : available
                    ? demo
                      ? 'Demo server available'
                      : 'Clinic server available'
                    : 'Clinic server unavailable'}
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
                    !dirty ||
                    window.confirm('Discard unsaved changes and sign out?')
                  )
                    void onLogout();
                }}
              >
                Sign out
              </Button>
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
                    {screen.kind === 'chart'
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
                              : 'Document'}
                  </span>
                </>
              )}
            </nav>
            <span className="badge">
              {demo ? 'Frontend demo · Memory only' : 'Clinic LAN'}
            </span>
          </header>
          <main id="main-content" ref={heading} tabIndex={-1}>
            {available === false && (
              <p className="notice error" role="alert">
                Clinic server unavailable. Input remains unsaved until a save
                succeeds.
              </p>
            )}
            {error && <ErrorNotice error={error} />}
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
              screen.kind !== 'register' && (
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
                </div>
              )}
            {screen.kind === 'registry' && (
              <Registry
                api={api}
                staff={staff}
                demo={demo}
                onSelect={(p) => void select(p)}
                onRegister={() => {
                  setPatient(null);
                  navigate({ kind: 'register' });
                }}
                onExpired={onExpired}
              />
            )}
            {(screen.kind === 'register' || screen.kind === 'editPatient') && (
              <PatientForm
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
                onDirty={setDirty}
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
            {patient && screen.kind === 'entry' && (
              <EntryForm
                api={api}
                patient={patient}
                entry={screen.entry}
                correction={screen.correction}
                onDone={() => done('medical')}
                onDirty={setDirty}
                onCancel={() => backToChart('medical')}
                onExpired={onExpired}
              />
            )}
            {patient && screen.kind === 'vitals' && (
              <VitalsForm
                api={api}
                patient={patient}
                record={screen.record}
                correction={screen.correction}
                onDone={() => done('vitals')}
                onDirty={setDirty}
                onCancel={() => backToChart('vitals')}
                onExpired={onExpired}
              />
            )}
            {patient && screen.kind === 'document' && (
              <Documents
                api={api}
                entry={screen.entry}
                issued={screen.document}
                kind={screen.documentKind}
                demo={demo}
                onDirty={setDirty}
                onBack={() => backToChart('medical')}
                onExpired={onExpired}
              />
            )}
          </main>
          {demo && (
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
        onDismiss={() => setPalette(false)}
        onSelect={(record) => {
          setPalette(false);
          void select(record);
        }}
        onRegister={() => {
          setPalette(false);
          setPatient(null);
          navigate({ kind: 'register' });
        }}
      />
    </>
  );
}

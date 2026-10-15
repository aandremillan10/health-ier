import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, FocusEvent, FormEvent, ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
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
import { Referrals } from './clinic/Referrals';
import './clinic/operations.css';
import { ContextHelp, PracticeGuide } from './clinic/Guidance';
import { createPractice } from './clinic/practice';
import type { PracticeSession, PracticeTopic } from './clinic/practice';
import { HistoricalDocuments } from './clinic/HistoricalDocuments';

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
        | 'referrals'
        | 'historical';
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

function isClinicTool(screen: Screen): boolean {
  return (
    screen.kind === 'audit' ||
    screen.kind === 'appointments' ||
    screen.kind === 'laboratory' ||
    screen.kind === 'reports' ||
    screen.kind === 'referrals'
  );
}

function screenLabel(screen: Screen): string {
  switch (screen.kind) {
    case 'audit':
      return 'Audit trail';
    case 'appointments':
      return 'Clinic flow';
    case 'chart':
      return screen.tab === 'details'
        ? 'Patient details'
        : screen.tab === 'vitals'
          ? 'Vital signs'
          : chartNames[screen.tab];
    case 'document':
      return screen.documentKind === 'certificate'
        ? 'Medical certificate'
        : 'Prescription';
    case 'editPatient':
      return 'Edit patient details';
    case 'entry':
      return screen.correction ? 'Correct medical entry' : 'Medical entry';
    case 'historical':
      return 'Historical documents';
    case 'laboratory':
      return 'Laboratory orders';
    case 'register':
      return 'Register patient';
    case 'registry':
      return 'Patient records';
    case 'referrals':
      return 'Referrals';
    case 'reports':
      return 'Reports';
    case 'vitals':
      return screen.correction ? 'Correct vital signs' : 'Vital signs';
  }
  const unreachable: never = screen;
  return unreachable;
}

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
        <PracticeBoundary
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

type WorkspaceProps = {
  api: ClinicApi;
  staff: Principal;
  demo: boolean;
  fixture: ReturnType<typeof createDemoClinic> | null;
  onLogout: () => Promise<void>;
  onExpired: () => void;
};

function PracticeBoundary(props: WorkspaceProps): ReactElement {
  const [container] = useState(() => document.createElement('div'));
  const mount = useRef<HTMLDivElement>(null);
  const practiceRoot = useRef<HTMLDivElement>(null);
  const [practice, setPractice] = useState<PracticeSession | null>(null);
  const [practiceGeneration, setPracticeGeneration] = useState(0);
  const currentPractice = useRef<PracticeSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const origin = useRef<{
    element: HTMLElement | null;
    title: string;
    scroll: number;
  } | null>(null);
  const [simulatedSignedOut, setSimulatedSignedOut] = useState(false);
  useLayoutEffect(() => {
    // Detach the live DOM, retaining React state without duplicate form IDs or focus targets.
    if (practice) container.remove();
    else mount.current?.append(container);
    return (): void => container.remove();
  }, [container, practice]);
  useEffect(
    () => (): void => {
      request.current++;
      currentPractice.current?.dispose();
      container.remove();
    },
    [container],
  );
  const exit = useCallback((): void => {
    request.current++;
    currentPractice.current?.dispose();
    currentPractice.current = null;
    setPractice(null);
    setPending(false);
  }, []);
  useLayoutEffect(() => {
    if (!practice && origin.current) {
      const previous = origin.current;
      origin.current = null;
      document.title = previous.title;
      window.scrollTo({ top: previous.scroll, behavior: 'instant' });
      if (previous.element?.isConnected)
        previous.element.focus({ preventScroll: true });
    }
  }, [practice]);
  async function start(topic: PracticeTopic): Promise<void> {
    const attempt = ++request.current;
    if (!practice)
      origin.current = {
        element:
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null,
        title: document.title,
        scroll: window.scrollY,
      };
    setPending(true);
    setError('');
    try {
      const next = await createPractice(
        { role: props.staff.role, isHead: props.staff.isHead },
        topic,
      );
      if (request.current !== attempt) {
        next.dispose();
        return;
      }
      currentPractice.current?.dispose();
      currentPractice.current = next;
      setPracticeGeneration((value) => value + 1);
      setPractice(next);
      setSimulatedSignedOut(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch {
      if (request.current === attempt)
        setError(
          'Practice could not start. Your clinic work is unchanged. Try the guide again.',
        );
    } finally {
      if (request.current === attempt) setPending(false);
    }
  }
  return (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div ref={mount} />
      {createPortal(
        <Workspace
          {...props}
          suspended={Boolean(practice)}
          onPractice={(topic) => void start(topic)}
          practicePending={pending}
        />,
        container,
      )}
      {practice && (
        <div
          className="practice-layout"
          data-testid="practice-workspace"
          ref={practiceRoot}
        >
          <div className="practice-screen">
            <header className="practice-banner">
              <h1>Practice · fictional records</h1>
              <p>
                All actions are simulated in memory. No clinic records,
                printers, files, or clipboard are changed. Exit to return to
                your work.
              </p>
            </header>
            {practice.topic === 'session' && (
              <section
                className="panel practice-session"
                aria-label="Simulated session"
              >
                <p role="status">
                  {simulatedSignedOut
                    ? 'Practice session signed out. Your real session remains active.'
                    : 'Practice session signed in. Your real account is unchanged.'}
                </p>
                <Button
                  onClick={() => setSimulatedSignedOut((value) => !value)}
                >
                  {simulatedSignedOut
                    ? 'Simulate sign-in'
                    : 'Simulate sign-out'}
                </Button>
              </section>
            )}
            <Workspace
              key={practiceGeneration}
              api={practice.api}
              staff={practice.staff}
              demo={true}
              fixture={null}
              onLogout={async () => {
                setSimulatedSignedOut(true);
              }}
              onExpired={exit}
              practice={practice}
            />
          </div>
          <PracticeGuide
            key={practiceGeneration}
            session={practice}
            root={practiceRoot}
            onExit={exit}
            onRestart={() => void start(practice.topic)}
          />
        </div>
      )}
    </>
  );
}

function ClinicSidebar({
  staff,
  demo,
  practice,
  busy,
  available,
  screen,
  recordsActive,
  onNavigate,
  onCheckConnection,
  onSignOut,
}: {
  staff: Principal;
  demo: boolean;
  practice: boolean;
  busy: boolean;
  available: boolean | null;
  screen: Screen;
  recordsActive: boolean;
  onNavigate: (next: Screen) => boolean;
  onCheckConnection: () => void;
  onSignOut: () => void;
}): ReactElement {
  const { setOpenMobile } = useSidebar();
  const canSeeCareQueues = ['doctor', 'dentist', 'medtech'].includes(
    staff.role,
  );
  const canSeeReviewTools =
    staff.isHead || ['clerk', 'attendant'].includes(staff.role);
  function visit(next: Screen): void {
    if (onNavigate(next)) setOpenMobile(false);
  }
  const connectionText =
    available === null
      ? 'Checking clinic connection…'
      : available
        ? demo
          ? 'Demo connection available'
          : 'Last connection check passed'
        : 'Last connection check failed';

  return (
    <Sidebar collapsible="icon" className="clinic-sidebar">
      <SidebarHeader className="clinic-sidebar-header">
        <div className="brand">
          <img src="./amlig-logo.png" alt="" width="40" height="40" />
          <div className="clinic-brand-copy group-data-[collapsible=icon]:hidden">
            <strong>AMLIG</strong>
            <span>HMO-Clinic · Iloilo</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent id="clinic-navigation" className="clinic-sidebar-content">
        <nav aria-label="Clinic navigation">
          <SidebarGroup className="nav-group">
            <SidebarGroupLabel className="nav-label">
              Patients
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="nav-item"
                    isActive={recordsActive}
                    aria-current={recordsActive ? 'page' : undefined}
                    tooltip="Patient records"
                    onClick={() => visit({ kind: 'registry' })}
                  >
                    <ClinicIcon name="records" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Patient records
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="nav-group">
            <SidebarGroupLabel className="nav-label">
              Clinic work
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="nav-item"
                    isActive={screen.kind === 'appointments'}
                    aria-current={
                      screen.kind === 'appointments' ? 'page' : undefined
                    }
                    tooltip="Clinic flow"
                    onClick={() => visit({ kind: 'appointments' })}
                  >
                    <ClinicIcon name="flow" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Clinic flow
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {canSeeCareQueues && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className="nav-item"
                        isActive={screen.kind === 'referrals'}
                        aria-current={
                          screen.kind === 'referrals' ? 'page' : undefined
                        }
                        tooltip="Referrals"
                        onClick={() => visit({ kind: 'referrals' })}
                      >
                        <ClinicIcon name="referrals" />
                        <span className="group-data-[collapsible=icon]:hidden">
                          Referrals
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className="nav-item"
                        isActive={screen.kind === 'laboratory'}
                        aria-current={
                          screen.kind === 'laboratory' ? 'page' : undefined
                        }
                        tooltip="Laboratory orders"
                        onClick={() => visit({ kind: 'laboratory' })}
                      >
                        <ClinicIcon name="lab" />
                        <span className="group-data-[collapsible=icon]:hidden">
                          Laboratory orders
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {canSeeReviewTools && (
            <SidebarGroup className="nav-group">
              <SidebarGroupLabel className="nav-label">
                Review
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="nav-item"
                      isActive={screen.kind === 'reports'}
                      aria-current={
                        screen.kind === 'reports' ? 'page' : undefined
                      }
                      tooltip="Reports"
                      onClick={() => visit({ kind: 'reports' })}
                    >
                      <ClinicIcon name="reports" />
                      <span className="group-data-[collapsible=icon]:hidden">
                        Reports
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {staff.isHead && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className="nav-item"
                        isActive={screen.kind === 'audit'}
                        aria-current={
                          screen.kind === 'audit' ? 'page' : undefined
                        }
                        tooltip="Audit trail"
                        onClick={() => visit({ kind: 'audit' })}
                      >
                        <ClinicIcon name="audit" />
                        <span className="group-data-[collapsible=icon]:hidden">
                          Audit trail
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </nav>
      </SidebarContent>
      <SidebarFooter className="clinic-sidebar-footer">
        <div className="connection">
          <span
            className={`status-dot ${available === null ? 'checking' : available ? 'online' : ''}`}
            aria-hidden="true"
          />
          <strong
            role="status"
            className="group-data-[collapsible=icon]:sr-only"
          >
            {connectionText}
          </strong>
          <Button
            className="sidebar-utility"
            variant="ghost"
            size="sm"
            aria-label="Check connection"
            title="Check connection"
            disabled={busy || available === null}
            onClick={onCheckConnection}
          >
            <RefreshCw aria-hidden="true" />
            <span className="group-data-[collapsible=icon]:sr-only">
              Check connection
            </span>
          </Button>
        </div>
        <div className="staff-identity">
          <strong className="group-data-[collapsible=icon]:sr-only">
            {staff.displayName}
          </strong>
          <span className="group-data-[collapsible=icon]:sr-only">
            {roleNames[staff.role]}
            {staff.isHead ? ' · Clinic head' : ''}
          </span>
          {!practice && (
            <Button
              className="sidebar-utility"
              variant="outline"
              size="sm"
              aria-label="Sign out"
              title="Sign out"
              onClick={onSignOut}
            >
              <LogOut aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:sr-only">
                Sign out
              </span>
            </Button>
          )}
          {practice && (
            <p className="hint group-data-[collapsible=icon]:sr-only">
              Your real session stays active. Exit practice to return to clinic
              work.
            </p>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Workspace({
  api,
  staff,
  demo,
  fixture,
  onLogout,
  onExpired,
  practice,
  suspended = false,
  onPractice,
  practicePending = false,
}: WorkspaceProps & {
  practice?: PracticeSession;
  suspended?: boolean;
  onPractice?: (topic: PracticeTopic) => void;
  practicePending?: boolean;
}): ReactElement {
  const [context, setContext] = useState<{
    screen: Screen;
    patient: Patient | null;
    generation: number;
  }>({
    screen: practice?.screen ?? { kind: 'registry' },
    patient: practice?.patient ?? null,
    generation: 0,
  });
  const { screen, patient, generation } = context;
  const [palette, setPalette] = useState(false);
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
    if (suspended) return;
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
  }, [suspended]);
  useEffect(() => {
    if (suspended) return;
    const label = screenLabel(screen);
    document.title = patient
      ? `${label} · ${patient.fullName} — AMLIG`
      : `${label} — AMLIG`;
  }, [screen, patient, suspended]);
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
  function navigate(next: Screen, nextPatient = patient): boolean {
    selection.current++;
    setBusy(false);
    if (dirtyRef.current && !window.confirm('Discard unsaved changes?'))
      return false;
    commit(
      next,
      next.kind === 'registry' || next.kind === 'register' ? null : nextPatient,
    );
    return true;
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
  const currentTab =
    isClinicTool(screen) || screen.kind === 'historical'
      ? null
      : screen.kind === 'chart'
        ? screen.tab
        : screen.kind === 'vitals'
          ? 'vitals'
          : screen.kind === 'entry' || screen.kind === 'document'
            ? 'medical'
            : 'details';
  const recordsActive = !isClinicTool(screen);
  const helpTopic: PracticeTopic =
    screen.kind === 'chart'
      ? screen.tab === 'details'
        ? 'registry'
        : screen.tab
      : screen.kind === 'register' || screen.kind === 'editPatient'
        ? 'registry'
        : screen.kind === 'entry'
          ? 'medical'
          : screen.kind === 'document'
            ? 'documents'
            : screen.kind;
  return (
    <>
      <SidebarProvider
        className="workspace"
        style={
          {
            '--sidebar-width': practice ? '13rem' : '15.5rem',
          } as CSSProperties
        }
      >
        <ClinicSidebar
          staff={staff}
          demo={demo}
          practice={Boolean(practice)}
          busy={busy}
          available={available}
          screen={screen}
          recordsActive={recordsActive}
          onNavigate={navigate}
          onCheckConnection={() => void refreshHealth()}
          onSignOut={() => {
            if (
              !dirtyRef.current ||
              window.confirm('Discard unsaved changes and sign out?')
            ) {
              selection.current++;
              void onLogout();
            }
          }}
        />
        <div className="main-area">
          <header className="topbar">
            <SidebarTrigger
              className="clinic-sidebar-trigger"
              aria-label="Clinic menu"
              aria-controls="clinic-navigation"
            >
              <ClinicIcon name="menu" />
              <span className="clinic-sidebar-trigger-label">Menu</span>
            </SidebarTrigger>
            <nav className="breadcrumb" aria-label="Breadcrumb">
              {isClinicTool(screen) ? (
                <>
                  <span>Clinic workspace</span>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">{screenLabel(screen)}</span>
                </>
              ) : screen.kind === 'registry' ? (
                <span aria-current="page">Patient records</span>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label="All patient records"
                    onClick={() => navigate({ kind: 'registry' })}
                  >
                    Patient records
                  </button>
                  {patient && (
                    <>
                      <span aria-hidden="true">/</span>
                      <button
                        type="button"
                        onClick={() => backToChart('details')}
                      >
                        {patient.fullName}
                      </button>
                    </>
                  )}
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">{screenLabel(screen)}</span>
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
                {practice
                  ? 'Practice · Memory only'
                  : demo
                    ? 'Frontend demo · Memory only'
                    : 'Clinic LAN'}
              </span>
            </div>
          </header>
          <main id="main-content" ref={heading} tabIndex={-1}>
            {!practice && onPractice && (
              <ContextHelp
                topic={helpTopic}
                staff={staff}
                pending={practicePending}
                onPractice={(topic) => {
                  setPalette(false);
                  selection.current++;
                  setBusy(false);
                  onPractice(topic);
                }}
              />
            )}
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
                  <span className="patient-nav-heading">Record sections</span>
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
                  {visibleDisciplines(staff).length > 0 && (
                    <Button
                      variant="ghost"
                      className={`patient-nav-item ${screen.kind === 'historical' ? 'selected' : ''}`}
                      aria-current={
                        screen.kind === 'historical' ? 'page' : undefined
                      }
                      onClick={() => navigate({ kind: 'historical' })}
                    >
                      Historical documents
                    </Button>
                  )}
                </nav>
              )}
            {screen.kind === 'registry' && (
              <Registry
                api={api}
                staff={staff}
                demo={demo && !practice}
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
            {screen.kind === 'historical' && patient && (
              <HistoricalDocuments
                key={`${staff.id}/${patient.id}`}
                api={api}
                staff={staff}
                patient={patient}
                practice={Boolean(practice) || demo}
                onExpired={onExpired}
                onDirty={markDirty}
              />
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
              <Reports
                api={api}
                onExpired={onExpired}
                demo={demo}
                practice={Boolean(practice)}
              />
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
                practice={Boolean(practice)}
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
      </SidebarProvider>
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

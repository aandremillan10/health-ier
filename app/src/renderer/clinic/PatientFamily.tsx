import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PatientIdentity, Result, Staff } from '../../shared/clinic-api';
import type {
  DependentFields,
  DependentLink,
  Eligibility,
  EligibilityFields,
  Membership,
  MembershipApi,
  MembershipFields,
  MembershipHistory,
  PatientFamily as Family,
} from '../../shared/membership';
import { Field, Loading } from './ui';
import { date, timestamp, today } from './format';
import './patient-family.css';

type Failure = Extract<Result<unknown>, { ok: false }>['error'];
type FindPatients = (search: string) => Promise<Result<PatientIdentity[]>>;
type Editor =
  | { mode: 'createMembership' }
  | { mode: 'updateMembership' | 'correctMembership'; membership: Membership }
  | { mode: 'linkDependent'; membership: Membership }
  | { mode: 'linkToMember' }
  | {
      mode: 'updateDependent' | 'correctDependent' | 'unlinkDependent';
      link: DependentLink;
    };
interface Props {
  api: MembershipApi;
  staff: Staff;
  patientId: string;
  patientName: string;
  searchPatients: FindPatients;
  onExpired: () => void;
  onDirty?: (dirty: boolean) => void;
  onOpenPatient?: (id: string) => void;
  demo?: boolean;
}
const eligibilityLabels: Record<Eligibility, string> = {
  eligible: 'Eligible',
  inactive: 'Inactive',
  not_started: 'Not started',
  expired: 'Expired',
  member_ineligible: 'Member is not eligible',
};
const unavailable: Failure = {
  code: 'UNAVAILABLE',
  message:
    'The family record could not be loaded. Check the clinic connection and try again.',
};
function mayRead(staff: Staff): boolean {
  return staff.role !== 'medtech' || staff.isHead;
}
function expired(error: Failure): boolean {
  return error.code === 'UNAUTHENTICATED' || error.code === 'SESSION_CHANGED';
}
function FailureNotice({
  error,
  retry,
}: {
  error: Failure | null;
  retry?: () => void;
}): ReactElement | null {
  return error ? (
    <div className="notice error" role="alert">
      <p>{error.message}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Reload family record
        </Button>
      )}
    </div>
  ) : null;
}
function EligibilityState({ value }: { value: Eligibility }): ReactElement {
  return (
    <span className={`badge ${value === 'eligible' ? 'success' : 'warning'}`}>
      {eligibilityLabels[value]}
    </span>
  );
}
function EffectiveDates({ value }: { value: EligibilityFields }): ReactElement {
  return (
    <p className="hint">
      {value.state === 'active' ? 'Active record' : 'Inactive record'} ·{' '}
      {date(value.effectiveStart)} to{' '}
      {value.effectiveEnd ? date(value.effectiveEnd) : 'no end date'}
    </p>
  );
}
export function PatientFamily(props: Props): ReactElement {
  return (
    <PatientFamilyPanel
      key={`${props.patientId}-${props.staff.id}`}
      {...props}
    />
  );
}
function PatientFamilyPanel({
  api,
  staff,
  patientId,
  patientName,
  searchPatients,
  onExpired,
  onDirty,
  onOpenPatient,
  demo = false,
}: Props): ReactElement | null {
  const [family, setFamily] = useState<Family | null>(null);
  const [asOf, setAsOf] = useState(today());
  const [loadError, setLoadError] = useState<Failure | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!mayRead(staff)) return;
    let active = true;
    void api
      .readPatientFamily({ patientId, asOf })
      .then((result) => {
        if (!active) return;
        if (result.ok) setFamily(result.data);
        else {
          setLoadError(result.error);
          if (expired(result.error)) onExpired();
        }
      })
      .catch(() => {
        if (active) setLoadError(unavailable);
      });
    return (): void => {
      active = false;
    };
  }, [api, patientId, asOf, refresh, staff, onExpired]);
  if (!mayRead(staff)) return null;
  function reload(): void {
    setFamily(null);
    setLoadError(null);
    setRefresh((value) => value + 1);
  }
  function open(next: Editor): void {
    setEditor(next);
    setNotice('');
    onDirty?.(true);
  }
  function close(): void {
    setEditor(null);
    onDirty?.(false);
  }
  function saved(): void {
    close();
    setNotice(
      demo
        ? 'Family record saved in this synthetic demo.'
        : 'Family record saved on the clinic server.',
    );
    reload();
  }
  return (
    <section className="panel patient-family" aria-labelledby="family-heading">
      <div className="section-heading">
        <h2 id="family-heading">HMO membership / family</h2>
        <Button variant="outline" disabled={Boolean(editor)} onClick={reload}>
          Refresh family record
        </Button>
      </div>
      <p className="hint">
        {patientName} · Eligibility uses explicit membership and link dates.
        Registry category and employee reference do not set eligibility.
      </p>
      <form
        className="family-as-of"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(new FormData(event.currentTarget).get('asOf'));
          if (value) {
            setAsOf(value);
            reload();
          }
        }}
      >
        <Field label="Eligibility on date (Asia/Manila)" name="family-as-of">
          <Input
            id="family-as-of"
            name="asOf"
            type="date"
            required
            defaultValue={asOf}
            disabled={Boolean(editor)}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={Boolean(editor)}>
          Check eligibility
        </Button>
      </form>
      <p role="status" className={notice ? 'notice success' : undefined}>
        {notice}
      </p>
      <FailureNotice error={loadError} retry={reload} />
      {!family && !loadError && <Loading>Loading HMO family record…</Loading>}
      {editor && (
        <FamilyEditor
          key={JSON.stringify(editor)}
          editor={editor}
          api={api}
          patientId={patientId}
          patientName={patientName}
          searchPatients={searchPatients}
          onExpired={onExpired}
          onOpenPatient={onOpenPatient}
          onCancel={close}
          onSaved={saved}
        />
      )}
      {family && (
        <>
          <section
            className="family-section"
            aria-labelledby="member-record-heading"
          >
            <div className="section-heading">
              <h3 id="member-record-heading">Member record</h3>
              {family.canManage && !family.membership && (
                <Button
                  variant="outline"
                  disabled={Boolean(editor)}
                  onClick={() => open({ mode: 'createMembership' })}
                >
                  Create membership
                </Button>
              )}
            </div>
            {!family.membership && (
              <p className="hint">
                No explicit membership exists for {patientName}. A registry
                employee reference does not create a membership.
              </p>
            )}
            {family.membership && (
              <>
                <div className="section-heading">
                  <strong>
                    {family.membership.memberNumber
                      ? `Member reference: ${family.membership.memberNumber}`
                      : 'Explicit member record'}
                  </strong>
                  <EligibilityState value={family.membership.eligibility} />
                </div>
                <EffectiveDates value={family.membership} />
                <p className="hint">
                  Eligibility checked on {date(family.asOf)} · Revision{' '}
                  {family.membership.revision}
                </p>
                {family.canManage && (
                  <div className="entry-actions">
                    <Button
                      variant="outline"
                      disabled={Boolean(editor)}
                      onClick={() =>
                        open({
                          mode: 'updateMembership',
                          membership: family.membership!,
                        })
                      }
                    >
                      Update eligibility
                    </Button>
                    <Button
                      variant="outline"
                      disabled={Boolean(editor)}
                      onClick={() =>
                        open({
                          mode: 'correctMembership',
                          membership: family.membership!,
                        })
                      }
                    >
                      Correct membership
                    </Button>
                    <Button
                      variant="outline"
                      disabled={Boolean(editor)}
                      onClick={() =>
                        open({
                          mode: 'linkDependent',
                          membership: family.membership!,
                        })
                      }
                    >
                      Link dependent
                    </Button>
                  </div>
                )}
                {family.canReadHistory && (
                  <FamilyHistory
                    api={api}
                    kind="membership"
                    id={family.membership.id}
                    revision={family.membership.revision}
                    onExpired={onExpired}
                  />
                )}
                <h4 className="family-dependents-title">
                  Dependents of {patientName}
                </h4>
                {!family.membership.dependents.length && (
                  <p className="hint">
                    No dependent links recorded. The clerk can choose an
                    existing patient and set the relationship and dates.
                  </p>
                )}
                <ul className="family-records">
                  {family.membership.dependents.map((link) => (
                    <FamilyLink
                      key={link.id}
                      link={link}
                      show="dependent"
                      canManage={family.canManage}
                      canReadHistory={family.canReadHistory}
                      editing={Boolean(editor)}
                      api={api}
                      onEdit={open}
                      onExpired={onExpired}
                      onOpenPatient={onOpenPatient}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
          <section
            className="family-section"
            aria-labelledby="dependent-record-heading"
          >
            <div className="section-heading">
              <h3 id="dependent-record-heading">Linked as a dependent</h3>
              {family.canManage && (
                <Button
                  variant="outline"
                  disabled={Boolean(editor)}
                  onClick={() => open({ mode: 'linkToMember' })}
                >
                  Link this patient to a member
                </Button>
              )}
            </div>
            {!family.memberOf.length && (
              <p className="hint">
                No member relationships recorded for this patient.
              </p>
            )}
            <ul className="family-records">
              {family.memberOf.map((link) => (
                <FamilyLink
                  key={link.id}
                  link={link}
                  show="member"
                  canManage={family.canManage}
                  canReadHistory={family.canReadHistory}
                  editing={Boolean(editor)}
                  api={api}
                  onEdit={open}
                  onExpired={onExpired}
                  onOpenPatient={onOpenPatient}
                />
              ))}
            </ul>
          </section>
          {!family.canManage && (
            <p className="hint">
              Read-only family information. The clerk maintains member
              references, relationships, and eligibility.
            </p>
          )}
          <p className="hint">
            Dates include the start and end day. Inactive and expired links
            remain visible with their history.
          </p>
        </>
      )}
    </section>
  );
}
function FamilyLink({
  link,
  show,
  canManage,
  canReadHistory,
  editing,
  api,
  onEdit,
  onExpired,
  onOpenPatient,
}: {
  link: DependentLink;
  show: 'member' | 'dependent';
  canManage: boolean;
  canReadHistory: boolean;
  editing: boolean;
  api: MembershipApi;
  onEdit: (editor: Editor) => void;
  onExpired: () => void;
  onOpenPatient?: (id: string) => void;
}): ReactElement {
  const person = show === 'member' ? link.member : link.dependent;
  return (
    <li className="family-record">
      <div className="section-heading">
        <h4>{person.fullName}</h4>
        <EligibilityState value={link.eligibility} />
      </div>
      <p>
        {show === 'member'
          ? `${link.dependent.fullName} is this member’s ${link.relationship}.`
          : `${link.relationship[0].toUpperCase()}${link.relationship.slice(1)} dependent`}
      </p>
      <EffectiveDates value={link} />
      {link.eligibility === 'member_ineligible' && (
        <p className="notice warning">
          The member’s eligibility is{' '}
          {eligibilityLabels[link.membershipEligibility].toLowerCase()}. The
          dependent is not eligible on the selected date.
        </p>
      )}
      {link.memberNumber && (
        <p className="hint">Member reference: {link.memberNumber}</p>
      )}
      <p className="hint">
        Birth date:{' '}
        {person.dateOfBirth ? date(person.dateOfBirth) : 'Not recorded'} ·
        Patient number: {person.id} · Revision {link.revision}
      </p>
      <div className="entry-actions">
        {onOpenPatient && (
          <Button
            variant="outline"
            disabled={editing}
            onClick={() => onOpenPatient(person.id)}
          >
            Open {show} record
          </Button>
        )}
        {canManage && (
          <>
            <Button
              variant="outline"
              disabled={editing}
              onClick={() => onEdit({ mode: 'updateDependent', link })}
            >
              Update dependent link
            </Button>
            <Button
              variant="outline"
              disabled={editing}
              onClick={() => onEdit({ mode: 'correctDependent', link })}
            >
              Correct dependent link
            </Button>
            {link.state === 'active' && (
              <Button
                variant="outline"
                disabled={editing}
                onClick={() => onEdit({ mode: 'unlinkDependent', link })}
              >
                Unlink dependent
              </Button>
            )}
          </>
        )}
      </div>
      {canReadHistory && (
        <FamilyHistory
          api={api}
          kind="dependent"
          id={link.id}
          revision={link.revision}
          onExpired={onExpired}
        />
      )}
    </li>
  );
}
function FamilyEditor({
  editor,
  api,
  patientId,
  patientName,
  searchPatients,
  onExpired,
  onOpenPatient,
  onCancel,
  onSaved,
}: {
  editor: Editor;
  api: MembershipApi;
  patientId: string;
  patientName: string;
  searchPatients: FindPatients;
  onExpired: () => void;
  onOpenPatient?: (id: string) => void;
  onCancel: () => void;
  onSaved: () => void;
}): ReactElement {
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<PatientIdentity | null>(
    'link' in editor ? editor.link.dependent : null,
  );
  const [selectedMember, setSelectedMember] = useState<Membership | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberMissing, setMemberMissing] = useState(false);
  const active = useRef(true);
  const pending = useRef(false);
  const selection = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    active.current = true;
    return (): void => {
      active.current = false;
    };
  }, []);
  const isMembership =
    editor.mode === 'createMembership' ||
    editor.mode === 'updateMembership' ||
    editor.mode === 'correctMembership';
  const isUnlink = editor.mode === 'unlinkDependent';
  const current: EligibilityFields | undefined =
    'membership' in editor && editor.mode !== 'linkDependent'
      ? editor.membership
      : 'link' in editor
        ? editor.link
        : undefined;
  const title: Record<Editor['mode'], string> = {
    createMembership: 'Create membership',
    updateMembership: 'Update membership eligibility',
    correctMembership: 'Correct membership',
    linkDependent: 'Link a dependent',
    linkToMember: 'Link this patient to a member',
    updateDependent: 'Update dependent link',
    correctDependent: 'Correct dependent link',
    unlinkDependent: 'Unlink dependent',
  };
  const fieldError = error
    ? {
        code: 'VALIDATION' as const,
        message: error.message,
        fieldErrors: error.fieldErrors,
      }
    : null;
  async function choose(person: PatientIdentity): Promise<void> {
    setSelected(person);
    if (editor.mode !== 'linkToMember') return;
    const version = ++selection.current;
    setSelectedMember(null);
    setMemberMissing(false);
    setMemberLoading(true);
    setError(null);
    try {
      const result = await api.readPatientFamily({ patientId: person.id });
      if (!active.current || version !== selection.current) return;
      if (result.ok) {
        setSelectedMember(result.data.membership);
        setMemberMissing(!result.data.membership);
      } else {
        setError(result.error);
        if (expired(result.error)) onExpired();
      }
    } catch {
      if (active.current && version === selection.current)
        setError(unavailable);
    } finally {
      if (active.current && version === selection.current)
        setMemberLoading(false);
    }
  }
  async function save(data: FormData): Promise<void> {
    if (pending.current) return;
    const reason = String(data.get('reason') ?? '').trim();
    if (
      !isMembership &&
      !isUnlink &&
      (!selected ||
        memberLoading ||
        (editor.mode === 'linkToMember' && !selectedMember))
    ) {
      setError({
        code: 'VALIDATION',
        message:
          editor.mode === 'linkToMember'
            ? 'Search and choose a patient with an explicit member record.'
            : 'Search and choose the dependent patient before saving.',
      });
      return;
    }
    const dates: EligibilityFields = {
      state: data.get('state') === 'inactive' ? 'inactive' : 'active',
      effectiveStart: String(data.get('effectiveStart') ?? ''),
      effectiveEnd: String(data.get('effectiveEnd') ?? '') || null,
    };
    const memberFields: MembershipFields = {
      ...dates,
      memberNumber: String(data.get('memberNumber') ?? '').trim(),
    };
    const dependent: DependentFields = {
      ...dates,
      dependentPatientId:
        editor.mode === 'linkToMember' ? patientId : (selected?.id ?? ''),
      relationship: String(
        data.get('relationship'),
      ) as DependentFields['relationship'],
    };
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      let response: Result<unknown>;
      switch (editor.mode) {
        case 'createMembership':
          response = await api.createMembership({ patientId, ...memberFields });
          break;
        case 'updateMembership':
        case 'correctMembership':
          response = await api[editor.mode]({
            id: editor.membership.id,
            expectedRevision: editor.membership.revision,
            reason,
            ...memberFields,
          });
          break;
        case 'linkDependent':
          response = await api.linkDependent({
            membershipId: editor.membership.id,
            ...dependent,
          });
          break;
        case 'linkToMember':
          response = await api.linkDependent({
            membershipId: selectedMember!.id,
            ...dependent,
          });
          break;
        case 'updateDependent':
        case 'correctDependent':
          response = await api[editor.mode]({
            id: editor.link.id,
            expectedRevision: editor.link.revision,
            reason,
            ...dependent,
          });
          break;
        case 'unlinkDependent':
          response = await api.unlinkDependent({
            id: editor.link.id,
            expectedRevision: editor.link.revision,
            reason,
          });
          break;
      }
      if (!active.current) return;
      if (response.ok) onSaved();
      else {
        setError(response.error);
        if (expired(response.error)) onExpired();
        requestAnimationFrame(() =>
          form.current
            ?.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus(),
        );
      }
    } catch {
      if (active.current)
        setError({
          ...unavailable,
          message:
            'The save was not confirmed. Keep your input, check the clinic connection, and try again.',
        });
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <form
      ref={form}
      className="family-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save(new FormData(event.currentTarget));
      }}
    >
      <h3>{title[editor.mode]}</h3>
      <p className="hint">
        {patientName} · Existing records and the reason for each change stay in
        history.
      </p>
      <FailureNotice error={error} />
      {error?.code === 'CONFLICT' && (
        <p className="notice warning">
          Your input remains below. Copy any needed text, cancel this edit, then
          reload the family record.
        </p>
      )}
      <fieldset disabled={busy} className="family-fieldset">
        {!isMembership && !isUnlink && (
          <>
            <PatientPicker
              find={searchPatients}
              selected={selected}
              onSelect={(person) => void choose(person)}
              label={
                editor.mode === 'linkToMember'
                  ? 'Find the member patient'
                  : 'Find the dependent patient'
              }
              onExpired={onExpired}
            />
            {memberLoading && (
              <p role="status">Checking the selected member record…</p>
            )}
            {selectedMember && (
              <p className="notice">
                Selected member reference: {selectedMember.memberNumber} ·{' '}
                {eligibilityLabels[selectedMember.eligibility]}
              </p>
            )}
            {memberMissing && selected && (
              <div className="notice warning">
                <p>
                  {selected.fullName} has no explicit membership. Choose another
                  patient, or open this patient’s record to create membership
                  first.
                </p>
                {onOpenPatient && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenPatient(selected.id)}
                  >
                    Open selected patient
                  </Button>
                )}
              </div>
            )}
            <Field
              label="Relationship to member"
              name="family-relationship"
              error={fieldError}
              errorName="relationship"
            >
              <select
                id="family-relationship"
                name="relationship"
                defaultValue={
                  'link' in editor ? editor.link.relationship : 'child'
                }
              >
                <option value="spouse">Spouse</option>
                <option value="child">Child</option>
                <option value="parent">Parent</option>
              </select>
            </Field>
          </>
        )}
        {isMembership && (
          <Field
            label="Explicit member reference"
            name="family-member-number"
            error={fieldError}
            errorName="memberNumber"
            hint="Enter the membership reference. This does not use the optional registry employee reference."
          >
            <Input
              id="family-member-number"
              name="memberNumber"
              required
              autoFocus
              maxLength={200}
              defaultValue={
                'membership' in editor
                  ? (editor.membership.memberNumber ?? '')
                  : ''
              }
            />
          </Field>
        )}
        {!isUnlink && (
          <div className="form-grid">
            <Field
              label="Record state"
              name="family-state"
              error={fieldError}
              errorName="state"
            >
              <select
                id="family-state"
                name="state"
                defaultValue={current?.state ?? 'active'}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field
              label="Effective start date"
              name="family-start"
              error={fieldError}
              errorName="effectiveStart"
            >
              <Input
                id="family-start"
                name="effectiveStart"
                type="date"
                required
                defaultValue={current?.effectiveStart ?? today()}
              />
            </Field>
            <Field
              label="Effective end date (optional, inclusive)"
              name="family-end"
              error={fieldError}
              errorName="effectiveEnd"
            >
              <Input
                id="family-end"
                name="effectiveEnd"
                type="date"
                defaultValue={current?.effectiveEnd ?? ''}
              />
            </Field>
          </div>
        )}
        {!['createMembership', 'linkDependent', 'linkToMember'].includes(
          editor.mode,
        ) && (
          <Field
            label={isUnlink ? 'Reason for unlinking' : 'Reason for change'}
            name="family-reason"
            error={fieldError}
            errorName="reason"
          >
            <Textarea
              id="family-reason"
              name="reason"
              required
              maxLength={4000}
              autoFocus={isUnlink}
            />
          </Field>
        )}
        {isUnlink && 'link' in editor && (
          <p className="notice warning">
            Confirm unlinking {editor.link.dependent.fullName} from{' '}
            {editor.link.member.fullName}. This sets the link to inactive and
            preserves its dates and history.
          </p>
        )}
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel edit
          </Button>
          <Button type="submit">
            {busy
              ? 'Saving family record…'
              : isUnlink
                ? 'Confirm unlinking'
                : 'Save family record'}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
function PatientPicker({
  find,
  selected,
  onSelect,
  label,
  onExpired,
}: {
  find: FindPatients;
  selected: PatientIdentity | null;
  onSelect: (patient: PatientIdentity) => void;
  label: string;
  onExpired: () => void;
}): ReactElement {
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<PatientIdentity[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const active = useRef(true);
  const version = useRef(0);
  useEffect(() => {
    active.current = true;
    return (): void => {
      active.current = false;
    };
  }, []);
  async function lookup(): Promise<void> {
    const sequence = ++version.current;
    setBusy(true);
    setError(null);
    try {
      const result = await find(search.trim());
      if (!active.current || sequence !== version.current) return;
      if (result.ok) setPatients(result.data);
      else {
        setError(result.error);
        if (expired(result.error)) onExpired();
      }
    } catch {
      if (active.current && sequence === version.current) setError(unavailable);
    } finally {
      if (active.current && sequence === version.current) setBusy(false);
    }
  }
  return (
    <div className="family-picker">
      <Field
        label={label}
        name="family-patient-search"
        hint="Search by name or patient number. If names match, use the birth date and patient number to choose the correct record."
      >
        <div className="search-controls">
          <Input
            id="family-patient-search"
            type="search"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void lookup();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void lookup()}
            disabled={busy}
          >
            Search patients
          </Button>
        </div>
      </Field>
      <FailureNotice error={error} />
      <p role="status">
        {busy
          ? 'Searching patient records…'
          : patients
            ? `${patients.length} patient records found.`
            : ''}
      </p>
      {patients?.length === 0 && (
        <p className="hint">
          No matching patients. Check the spelling or patient number. Create a
          missing patient in the registry before linking.
        </p>
      )}
      <ul className="family-search-results">
        {patients?.map((person) => (
          <li key={person.id}>
            <div>
              <strong>{person.fullName}</strong>
              <p className="hint">
                Birth date:{' '}
                {person.dateOfBirth ? date(person.dateOfBirth) : 'Not recorded'}{' '}
                · Patient number: {person.id}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              aria-pressed={selected?.id === person.id}
              onClick={() => onSelect(person)}
            >
              {selected?.id === person.id
                ? 'Selected patient'
                : 'Choose patient'}
            </Button>
          </li>
        ))}
      </ul>
      {selected && (
        <p className="notice">
          Selected: {selected.fullName} ·{' '}
          {selected.dateOfBirth
            ? date(selected.dateOfBirth)
            : 'Birth date not recorded'}{' '}
          · {selected.id}
        </p>
      )}
    </div>
  );
}
function FamilyHistory({
  api,
  kind,
  id,
  revision,
  onExpired,
}: {
  api: MembershipApi;
  kind: 'membership' | 'dependent';
  id: string;
  revision: number;
  onExpired: () => void;
}): ReactElement {
  return (
    <FamilyHistoryPanel
      key={`${id}-${revision}`}
      api={api}
      kind={kind}
      id={id}
      onExpired={onExpired}
    />
  );
}
function FamilyHistoryPanel({
  api,
  kind,
  id,
  onExpired,
}: {
  api: MembershipApi;
  kind: 'membership' | 'dependent';
  id: string;
  onExpired: () => void;
}): ReactElement {
  const [events, setEvents] = useState<MembershipHistory[] | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return (): void => {
      active.current = false;
    };
  }, []);
  async function load(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        kind === 'membership'
          ? await api.readMembershipHistory({ id })
          : await api.readDependentHistory({ id });
      if (!active.current) return;
      if (result.ok) setEvents(result.data);
      else {
        setError(result.error);
        if (expired(result.error)) onExpired();
      }
    } catch {
      if (active.current) setError(unavailable);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <details
      className="family-history"
      onToggle={(event) => {
        if (event.currentTarget.open && !events && !busy && !error) void load();
      }}
    >
      <summary>
        View {kind === 'membership' ? 'membership' : 'dependent link'} history
      </summary>
      {busy && <p role="status">Loading family history…</p>}
      {error && (
        <div className="notice error" role="alert">
          <p>{error.message}</p>
          <Button variant="outline" onClick={() => void load()}>
            Retry family history
          </Button>
        </div>
      )}
      <ol>
        {events?.map((event) => (
          <li key={event.id}>
            <strong>
              Revision {event.revision} · {event.action}
            </strong>
            <p className="hint">
              {event.authorName} · {timestamp(event.createdAt)}
            </p>
            {event.reason && <p>Reason: {event.reason}</p>}
            <EffectiveDates value={event.snapshot} />
            {'memberNumber' in event.snapshot ? (
              <p>Member reference: {event.snapshot.memberNumber}</p>
            ) : (
              <p>
                {event.snapshot.relationship} · Patient number:{' '}
                {event.snapshot.dependentPatientId}
              </p>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { enqueue } from './database/outbox';
import { recordAudit } from './audit/audit.service';
import { fail } from './errors';
import type {
  Correction,
  Document,
  Entry,
  Patient,
  Prisma,
  Vitals,
} from './generated/prisma/client';
import type {
  Discipline,
  DocumentSnapshot,
  Principal,
} from './mirror-contract';
import {
  dateOnly,
  discipline,
  fields,
  invalid,
  medicalFields,
  medicalValue,
  object,
  patientFields,
  patientValue,
  revision,
  text,
  uuid,
  vitalFields,
  vitalValue,
} from './validation';

export function canRead(staff: Principal, area: Discipline): boolean {
  return (
    staff.isHead ||
    (area === 'medical' && staff.role === 'doctor') ||
    (area === 'dental' && staff.role === 'dentist') ||
    (area === 'laboratory' && staff.role === 'medtech')
  );
}
function deny(): never {
  return fail(
    403,
    'FORBIDDEN',
    'This operation is not permitted for your account.',
  );
}
function readArea(staff: Principal, area: Discipline): void {
  if (!canRead(staff, area)) deny();
}
function authorArea(staff: Principal, area: Discipline): void {
  if (
    (area === 'medical' && staff.role !== 'doctor') ||
    (area === 'dental' && staff.role !== 'dentist') ||
    (area === 'laboratory' && staff.role !== 'medtech')
  )
    deny();
}
function expected(record: { revision: number }, value: number): void {
  if (record.revision !== value)
    fail(
      409,
      'STALE_REVISION',
      'This record changed. Reload it before trying again.',
      { currentRevision: record.revision },
    );
}
function lifecycle(record: { status: string }, status: string): void {
  if (record.status !== status)
    fail(
      409,
      'LIFECYCLE_CONFLICT',
      status === 'draft'
        ? 'Finalized content is preserved. Add a correction instead.'
        : 'Finalize the record before this operation.',
    );
}
export type RegistryDto =
  | Patient
  | Pick<Patient, 'id' | 'revision' | 'fullName' | 'sex' | 'dateOfBirth'>;
type Attributed<T> = T & { authorName: string };
function registry(staff: Principal, patient: Patient): RegistryDto {
  return staff.role === 'medtech'
    ? {
        id: patient.id,
        revision: patient.revision,
        fullName: patient.fullName,
        sex: patient.sex,
        dateOfBirth: patient.dateOfBirth,
      }
    : patient;
}

@Injectable()
export class ClinicService {
  constructor(private readonly db: DatabaseService) {}
  private async attributed<T extends { authorId: string }>(
    tx: Prisma.TransactionClient,
    record: T,
  ): Promise<Attributed<T>> {
    const author = await tx.staff.findUniqueOrThrow({
      where: { id: record.authorId },
      select: { displayName: true },
    });
    return { ...record, authorName: author.displayName };
  }
  private async patient(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<Patient> {
    const patient = await tx.patient.findUnique({ where: { id: uuid(id) } });
    if (!patient) fail(404, 'NOT_FOUND', 'Record not found.');
    return patient;
  }
  async patients(staff: Principal, search: unknown): Promise<RegistryDto[]> {
    const term =
      search === undefined ? '' : (text(search, 'search', false, 200) ?? '');
    const patients = await this.db.patient.findMany({
      where:
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          term,
        )
          ? {
              OR: [
                { id: term.toLowerCase() },
                { fullName: { contains: term, mode: 'insensitive' } },
              ],
            }
          : { fullName: { contains: term, mode: 'insensitive' } },
      take: 100,
      orderBy: { fullName: 'asc' },
    });
    return patients.map((patient) => registry(staff, patient));
  }
  async readPatient(staff: Principal, id: string): Promise<RegistryDto> {
    return registry(staff, await this.patient(this.db, id));
  }
  async listDocuments(
    staff: Principal,
    patientId: string,
  ): Promise<Document[]> {
    readArea(staff, 'medical');
    await this.patient(this.db, patientId);
    return this.db.document.findMany({
      where: { patientId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }
  async createPatient(staff: Principal, input: unknown): Promise<RegistryDto> {
    if (staff.role !== 'clerk' && staff.role !== 'attendant') deny();
    const body = object(input, patientFields);
    const data = fields(
      body,
      patientFields,
      patientValue,
    ) as Prisma.PatientUncheckedCreateInput;
    if (!data.fullName) invalid('fullName');
    return this.db.$transaction(async (tx) => {
      const patient = await tx.patient.create({ data });
      await enqueue(tx, 'patient', patient);
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'patient',
        resourceId: patient.id,
        patientId: patient.id,
      });
      return registry(staff, patient);
    });
  }
  async updatePatient(
    staff: Principal,
    id: string,
    input: unknown,
  ): Promise<RegistryDto> {
    if (staff.role !== 'clerk' && staff.role !== 'attendant') deny();
    const body = object(input, [...patientFields, 'expectedRevision']);
    const wanted = revision(body.expectedRevision);
    const data = fields(
      body,
      patientFields,
      patientValue,
    ) as Prisma.PatientUncheckedUpdateInput;
    if (!Object.keys(data).length) invalid('body');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Patient" WHERE id = ${uuid(id)}::uuid FOR UPDATE`;
      const previous = await this.patient(tx, id);
      expected(previous, wanted);
      const patient = await tx.patient.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
      });
      await enqueue(tx, 'patient', patient);
      await recordAudit(tx, staff, {
        action: 'change',
        resourceType: 'patient',
        resourceId: patient.id,
        patientId: patient.id,
      });
      return registry(staff, patient);
    });
  }
  async listVitals(
    staff: Principal,
    patientId: string,
  ): Promise<
    (Attributed<Vitals> & { corrections: Attributed<Correction>[] })[]
  > {
    if (!['attendant', 'doctor', 'dentist'].includes(staff.role)) deny();
    await this.patient(this.db, patientId);
    const vitals = await this.db.vitals.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
    });
    return Promise.all(
      vitals.map(async (record) => ({
        ...(await this.attributed(this.db, record)),
        corrections: await Promise.all(
          (
            await this.db.correction.findMany({
              where: { originalType: 'vitals', originalEntryId: record.id },
              orderBy: { createdAt: 'asc' },
            })
          ).map((correction) => this.attributed(this.db, correction)),
        ),
      })),
    );
  }
  async createVitals(
    staff: Principal,
    patientId: string,
    input: unknown,
  ): Promise<Attributed<Vitals>> {
    if (staff.role !== 'attendant') deny();
    const body = object(input, vitalFields);
    const data = fields(body, vitalFields, vitalValue) as Omit<
      Prisma.VitalsUncheckedCreateInput,
      'patientId' | 'authorId'
    >;
    return this.db.$transaction(async (tx) => {
      await this.patient(tx, patientId);
      const record = await tx.vitals.create({
        data: { ...data, patientId, authorId: staff.id },
      });
      await enqueue(tx, 'vitals', record);
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'vitals',
        resourceId: record.id,
        patientId: record.patientId,
      });
      return this.attributed(tx, record);
    });
  }
  async listEntries(
    staff: Principal,
    patientId: string,
    areaInput: string,
  ): Promise<Attributed<Entry>[]> {
    const area = discipline(areaInput);
    readArea(staff, area);
    await this.patient(this.db, patientId);
    return Promise.all(
      (
        await this.db.entry.findMany({
          where: { patientId, discipline: area },
          orderBy: { createdAt: 'desc' },
        })
      ).map((record) => this.attributed(this.db, record)),
    );
  }
  private async selectedVitals(
    tx: Prisma.TransactionClient,
    patientId: string,
    value: string | null | undefined,
  ): Promise<void> {
    if (!value) return;
    const record = await tx.vitals.findUnique({ where: { id: value } });
    if (
      !record ||
      record.patientId !== patientId ||
      record.status !== 'finalized'
    )
      invalid('vitalsId');
  }
  async createEntry(
    staff: Principal,
    patientId: string,
    areaInput: string,
    input: unknown,
  ): Promise<Attributed<Entry>> {
    const area = discipline(areaInput);
    authorArea(staff, area);
    const keys = area === 'medical' ? medicalFields : ['text'];
    const body = object(input, keys);
    const data = fields(body, keys, medicalValue) as Omit<
      Prisma.EntryUncheckedCreateInput,
      'patientId' | 'authorId' | 'discipline'
    >;
    if (area === 'medical' && !data.consultationDate)
      invalid('consultationDate');
    if (area !== 'medical' && !data.text) invalid('text');
    return this.db.$transaction(async (tx) => {
      await this.patient(tx, patientId);
      await this.selectedVitals(tx, patientId, data.vitalsId);
      const record = await tx.entry.create({
        data: { ...data, patientId, authorId: staff.id, discipline: area },
      });
      await enqueue(tx, 'entry', record);
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'entry',
        resourceId: record.id,
        patientId: record.patientId,
      });
      return this.attributed(tx, record);
    });
  }
  private async owned(
    tx: Prisma.TransactionClient,
    staff: Principal,
    type: 'entry' | 'vitals',
    id: string,
    allowHeadVitalsCorrection = false,
  ): Promise<Entry | Vitals> {
    if (type === 'entry') {
      await tx.$queryRaw`SELECT id FROM "Entry" WHERE id = ${uuid(id)}::uuid FOR UPDATE`;
      const record = await tx.entry.findUnique({ where: { id } });
      if (!record || !canRead(staff, record.discipline as Discipline))
        fail(404, 'NOT_FOUND', 'Record not found.');
      authorArea(staff, record.discipline as Discipline);
      if (record.authorId !== staff.id) deny();
      return record;
    }
    if (staff.role !== 'attendant' && !allowHeadVitalsCorrection) deny();
    await tx.$queryRaw`SELECT id FROM "Vitals" WHERE id = ${uuid(id)}::uuid FOR UPDATE`;
    const record = await tx.vitals.findUnique({ where: { id } });
    if (!record) fail(404, 'NOT_FOUND', 'Record not found.');
    if (!allowHeadVitalsCorrection && record.authorId !== staff.id) deny();
    return record;
  }
  async change(
    staff: Principal,
    type: 'entry' | 'vitals',
    id: string,
    input: unknown,
    finalize = false,
  ): Promise<Attributed<Entry | Vitals>> {
    return this.db.$transaction(async (tx) => {
      const previous = await this.owned(tx, staff, type, id);
      const keys = finalize
        ? []
        : type === 'vitals'
          ? vitalFields
          : 'discipline' in previous && previous.discipline === 'medical'
            ? medicalFields
            : ['text'];
      const body = object(input, [...keys, 'expectedRevision']);
      expected(previous, revision(body.expectedRevision));
      lifecycle(previous, 'draft');
      const changes = fields(
        body,
        keys,
        type === 'vitals' ? vitalValue : medicalValue,
      );
      if (!finalize && !Object.keys(changes).length) invalid('body');
      if (type === 'entry') {
        const data = changes as Prisma.EntryUncheckedUpdateInput;
        if (typeof changes.vitalsId === 'string')
          await this.selectedVitals(tx, previous.patientId, changes.vitalsId);
        const record = await tx.entry.update({
          where: { id },
          data: {
            ...data,
            revision: { increment: 1 },
            ...(finalize ? { status: 'finalized' } : {}),
          },
        });
        await enqueue(tx, 'entry', record);
        await recordAudit(tx, staff, {
          action: finalize ? 'finalize' : 'change',
          resourceType: 'entry',
          resourceId: record.id,
          patientId: record.patientId,
        });
        return this.attributed(tx, record);
      }
      const record = await tx.vitals.update({
        where: { id },
        data: {
          ...(changes as Prisma.VitalsUncheckedUpdateInput),
          revision: { increment: 1 },
          ...(finalize ? { status: 'finalized' } : {}),
        },
      });
      await enqueue(tx, 'vitals', record);
      await recordAudit(tx, staff, {
        action: finalize ? 'finalize' : 'change',
        resourceType: 'vitals',
        resourceId: record.id,
        patientId: record.patientId,
      });
      return this.attributed(tx, record);
    });
  }
  async correct(
    staff: Principal,
    type: 'entry' | 'vitals',
    id: string,
    input: unknown,
  ): Promise<{
    correction: Attributed<Correction>;
    original: Attributed<Entry | Vitals>;
  }> {
    const body = object(input, [
      'expectedRevision',
      'reason',
      'correctedContent',
    ]);
    const wanted = revision(body.expectedRevision);
    const reason = text(body.reason, 'reason', true)!;
    return this.db.$transaction(async (tx) => {
      const previous = await this.owned(
        tx,
        staff,
        type,
        id,
        type === 'vitals' && staff.role === 'doctor' && staff.isHead,
      );
      expected(previous, wanted);
      lifecycle(previous, 'finalized');
      const keys =
        type === 'vitals'
          ? vitalFields
          : 'discipline' in previous && previous.discipline === 'medical'
            ? medicalFields
            : ['text'];
      const content = object(body.correctedContent, keys);
      const parsed = fields(
        content,
        keys,
        type === 'vitals' ? vitalValue : medicalValue,
      );
      if (!Object.keys(parsed).length) invalid('correctedContent');
      if (typeof parsed.vitalsId === 'string')
        await this.selectedVitals(tx, previous.patientId, parsed.vitalsId);
      const correctedContent = Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [
          key,
          value instanceof Date ? value.toISOString() : value,
        ]),
      ) as Prisma.InputJsonObject;
      const correction = await tx.correction.create({
        data: {
          originalType: type,
          originalEntryId: id,
          authorId: staff.id,
          reason,
          correctedContent,
          sourceRevision: wanted,
        },
      });
      const original =
        type === 'entry'
          ? await tx.entry.update({
              where: { id },
              data: { revision: { increment: 1 } },
            })
          : await tx.vitals.update({
              where: { id },
              data: { revision: { increment: 1 } },
            });
      await enqueue(tx, type, original);
      await enqueue(tx, 'correction', correction);
      await recordAudit(tx, staff, {
        action: 'correction',
        resourceType: type,
        resourceId: id,
        patientId: original.patientId,
      });
      return {
        correction: await this.attributed(tx, correction),
        original: await this.attributed(tx, original),
      };
    });
  }
  async corrections(
    staff: Principal,
    id: string,
  ): Promise<Attributed<Correction>[]> {
    const record = await this.db.entry.findUnique({ where: { id: uuid(id) } });
    if (!record || !canRead(staff, record.discipline as Discipline))
      fail(404, 'NOT_FOUND', 'Record not found.');
    return Promise.all(
      (
        await this.db.correction.findMany({
          where: { originalType: 'entry', originalEntryId: id },
          orderBy: { createdAt: 'asc' },
        })
      ).map((record) => this.attributed(this.db, record)),
    );
  }
  async document(
    staff: Principal,
    input: unknown,
    issue: boolean,
  ): Promise<Omit<Document, 'id' | 'revision' | 'createdAt'> | Document> {
    if (staff.role !== 'doctor') deny();
    const body = object(input, [
      'kind',
      'consultationId',
      'expectedRevision',
      'issueDate',
      'body',
      'purpose',
      'remarks',
      'restriction',
      'followUp',
    ]);
    if (body.kind !== 'prescription' && body.kind !== 'medical_certificate')
      invalid('kind');
    const kind = body.kind;
    const id = uuid(body.consultationId, 'consultationId');
    const wanted = revision(body.expectedRevision);
    const documentBody = text(body.body, 'body', true, 12000)!;
    const issueDate =
      body.issueDate === undefined
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date())
        : dateOnly(body.issueDate, 'issueDate');
    const wording = Object.fromEntries(
      ['purpose', 'remarks', 'restriction', 'followUp'].map((key) => [
        key,
        body[key] === undefined ? null : text(body[key], key),
      ]),
    ) as Pick<
      DocumentSnapshot,
      'purpose' | 'remarks' | 'restriction' | 'followUp'
    >;
    if (kind === 'medical_certificate' && !wording.purpose) invalid('purpose');
    return this.db.$transaction(async (tx) => {
      const consultation = await this.owned(tx, staff, 'entry', id);
      if (
        !('discipline' in consultation) ||
        consultation.discipline !== 'medical' ||
        !consultation.consultationDate
      )
        deny();
      expected(consultation, wanted);
      lifecycle(consultation, 'finalized');
      const patient = await this.patient(tx, consultation.patientId);
      const issuer = await tx.staff.findUniqueOrThrow({
        where: { id: staff.id },
      });
      const snapshot: DocumentSnapshot = {
        patient: {
          id: patient.id,
          fullName: patient.fullName,
          sex: patient.sex,
          address: patient.address,
          age: consultation.ageAtConsultation,
          cs: consultation.cs,
        },
        issuer: {
          id: issuer.id,
          displayName: issuer.displayName,
          licenseText: issuer.licenseText,
          ptrText: issuer.ptrText,
        },
        consultation: {
          id: consultation.id,
          revision: consultation.revision,
          consultationDate: consultation.consultationDate,
          reason: consultation.reason,
          findings: consultation.findings,
          clinicalImpression: consultation.clinicalImpression,
          plan: consultation.plan,
        },
        body: documentBody,
        ...wording,
      };
      const data = {
        kind,
        patientId: patient.id,
        consultationId: id,
        issuerId: issuer.id,
        issueDate,
        snapshot: snapshot as unknown as Prisma.InputJsonObject,
      };
      if (!issue)
        return { ...data, snapshot: snapshot as unknown as Prisma.JsonObject };
      const document = await tx.document.create({ data });
      await enqueue(tx, 'document', document);
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'document',
        resourceId: document.id,
        patientId: document.patientId,
      });
      return document;
    });
  }
  async readDocument(staff: Principal, id: string): Promise<Document> {
    const document = await this.db.document.findUnique({
      where: { id: uuid(id) },
    });
    if (!document || !canRead(staff, 'medical'))
      fail(404, 'NOT_FOUND', 'Record not found.');
    return document;
  }
}

import type { IssuedDocument, Patient, Staff } from '../shared/clinic-api';
export const ids = {
  staff: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patient: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  entry: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  document: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};
export const principal: Staff = {
  id: ids.staff,
  displayName: 'Synthetic Doctor',
  role: 'doctor',
  isHead: false,
};
export const instant = '2026-10-14T04:00:00.000Z';
export const patient: Patient = {
  id: ids.patient,
  revision: 1,
  fullName: 'Synthetic Patient',
  sex: null,
  address: null,
  patientCategory: null,
  employeeIdentifier: null,
  dateOfBirth: null,
  createdAt: instant,
  updatedAt: instant,
};
export const document: IssuedDocument = {
  id: ids.document,
  kind: 'prescription',
  patientId: ids.patient,
  consultationId: ids.entry,
  issuerId: ids.staff,
  issueDate: '2026-10-14',
  revision: 1,
  createdAt: instant,
  snapshot: {
    patient: {
      id: ids.patient,
      fullName: 'Synthetic Patient',
      sex: null,
      address: null,
      age: null,
      cs: null,
    },
    issuer: {
      id: ids.staff,
      displayName: 'Synthetic Doctor',
      licenseText: null,
      ptrText: null,
    },
    consultation: {
      id: ids.entry,
      revision: 2,
      consultationDate: '2026-10-14',
      reason: null,
      findings: null,
      clinicalImpression: null,
      plan: null,
    },
    body: 'Synthetic instructions',
    purpose: null,
    remarks: null,
    restriction: null,
    followUp: null,
  },
};

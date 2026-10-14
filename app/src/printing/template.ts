import header from '../../../docs/headers/header.jpg?inline';
import { escapeHtml } from '../privileged/printing';
import type { IssuedDocument } from '../shared/clinic-api';

const followUp =
  'NOTE: If symptoms persist or worsens, follow up immediately with your doctor or proceed to the nearest healthcare facility';

function field(value: string | number | null, className = ''): string {
  return `<span class="field ${className}">${escapeHtml(String(value ?? ''))}</span>`;
}

function ruled(value: string | null): string {
  const lines = (value ?? '').split(/\r\n|\r|\n/);
  return [...lines, ...Array<string>(Math.max(0, 6 - lines.length)).fill('')]
    .map((line) => `<div class="ruled-line">${escapeHtml(line)}</div>`)
    .join('');
}

function signature(document: IssuedDocument): string {
  const issuer = document.snapshot.issuer;
  return `<div class="signature">
    <div class="signature-space" aria-label="Space for handwritten signature"></div>
    <div class="physician">${escapeHtml(issuer.displayName)}, M.D.</div>
    <div class="credential">Lic. No. ${field(issuer.licenseText)}</div>
    <div class="credential">PTR No. ${field(issuer.ptrText)}</div>
  </div>`;
}

function prescription(document: IssuedDocument): string {
  const { patient, body, followUp: additionalFollowUp } = document.snapshot;
  return `<div class="date">${field(document.issueDate)}<div>Date</div></div>
    <div class="patient-line">Name of Patient: ${field(patient.fullName)}</div>
    <div class="demographics"><div>Age: ${field(patient.age)}</div><div>Sex: ${field(patient.sex)}</div><div>CS ${field(patient.cs)}</div></div>
    <div class="patient-line">Address: ${field(patient.address)}</div>
    <div class="rx" aria-label="Prescription">℞</div>
    <div class="medications clinical-text">${escapeHtml(body)}</div>
    ${additionalFollowUp ? `<div class="additional clinical-text">${escapeHtml(additionalFollowUp)}</div>` : ''}
    <div class="prescription-footer">${signature(document)}<p class="follow-up">${followUp}</p></div>`;
}

function certificate(document: IssuedDocument): string {
  const { patient, consultation, body, remarks, purpose, restriction } =
    document.snapshot;
  return `<h1>MEDICAL CERTIFICATE</h1>
    <div class="date certificate-date">${field(document.issueDate)}<div>Date</div></div>
    <h2 class="salutation">TO WHOM IT MAY CONCERN:</h2>
    <p class="introduction">This is to certify that ${field(patient.fullName, 'name')}, ${field(patient.age, 'age')} years old, ${field(patient.sex, 'sex')},
    of ${field(patient.address, 'address')} consulted the undersigned on ${field(consultation.consultationDate, 'consultation-date')} because of: ${field(consultation.reason, 'reason')}</p>
    <h2>Findings and Clinical Impression:</h2>
    <div class="ruled">${ruled(body)}</div>
    <h2>Remarks:</h2>
    <div class="ruled">${ruled(remarks)}</div>
    <p class="certification">This certification is issued upon the request of the above-named person for ${field(purpose, 'purpose')} and not to be used for medico-legal purposes.</p>
    ${restriction ? `<p class="additional clinical-text">${escapeHtml(restriction)}</p>` : ''}
    <div class="certificate-signature">${signature(document)}</div>`;
}

export function renderDocument(document: IssuedDocument): string | undefined {
  if (
    document.kind !== 'prescription' &&
    document.kind !== 'medical_certificate'
  )
    return undefined;
  const title =
    document.kind === 'prescription' ? 'Prescription' : 'Medical certificate';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html { color: #000; background: #fff; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
  body { margin: 0; overflow-wrap: anywhere; }
  main { max-width: 186mm; margin: 0 auto; }
  .header { display: block; width: 100%; height: auto; margin: 0 0 4mm; }
  h1 { margin: 3mm 0 5mm; text-align: center; text-decoration: underline; text-underline-offset: 1mm; font-size: 14pt; }
  h2 { font-size: 11pt; margin: 6mm 0 1mm; break-after: avoid; }
  p { margin: 0; orphans: 3; widows: 3; }
  .field { min-width: 14mm; border-bottom: 0.25mm solid #000; white-space: pre-wrap; }
  .field:empty { display: inline-block; min-height: 1em; }
  .date { width: 40mm; text-align: center; margin: 3mm 0 8mm; break-inside: avoid; }
  .date .field { display: block; min-height: 7mm; }
  .certificate-date { margin-left: auto; margin-bottom: 2mm; }
  .patient-line { display: flex; gap: 1.5mm; margin-bottom: 2mm; }
  .patient-line .field { flex: 1; min-width: 0; }
  .demographics { display: flex; flex-wrap: wrap; gap: 5mm; margin-bottom: 2mm; }
  .demographics > div { min-width: 32mm; max-width: 100%; }
  .demographics .field { display: inline-block; min-width: 18mm; }
  .rx { font-family: 'Times New Roman', serif; font-size: 34pt; line-height: 1.1; margin: 3mm 0; }
  .clinical-text { white-space: pre-wrap; }
  .medications { min-height: 104mm; padding: 0 4mm; }
  .additional { margin: 4mm 0; }
  .prescription-footer { display: flex; align-items: flex-end; gap: 10mm; break-inside: avoid; margin-top: 5mm; }
  .signature { width: 90mm; max-width: 100%; break-inside: avoid; }
  .signature-space { min-height: 12mm; }
  .physician { border-top: 0.25mm solid #000; text-align: center; padding-top: 1mm; }
  .credential { display: flex; gap: 2mm; margin-top: 1mm; }
  .credential .field { flex: 1; min-width: 0; }
  .follow-up { flex: 1; font-size: 9pt; font-style: italic; }
  .salutation { margin-top: 2mm; margin-bottom: 4mm; }
  .introduction { line-height: 2; text-indent: 8mm; }
  .name { min-width: 65mm; }
  .age { min-width: 10mm; }
  .sex { min-width: 15mm; }
  .address { min-width: 95mm; }
  .consultation-date { min-width: 28mm; }
  .reason { min-width: 40mm; }
  .ruled-line { min-height: 6mm; line-height: 6mm; border-bottom: 0.2mm solid #000; white-space: pre-wrap; orphans: 2; widows: 2; }
  .certification { margin-top: 7mm; line-height: 2; text-indent: 8mm; }
  .purpose { min-width: 65mm; }
  .certificate-signature { margin: 2mm 0 0 auto; width: 80mm; }
  .document-reference { margin-top: 5mm; font-size: 8pt; break-inside: avoid; }
</style></head><body><main>
<img class="header" src="${header}" width="4128" height="1024" alt="Republic of the Philippines, Province of Iloilo, Hospital Management Office, Medical-Dental and Laboratory Services. 2nd Floor, Left Wing, Iloilo Provincial Capitol Building, Iloilo City Philippines 5000. Tel. No. 328-7914 / 336-3869 / 0960-832-4238. clinic@iloilo.gov.ph">
${document.kind === 'prescription' ? prescription(document) : certificate(document)}
<div class="document-reference">Document ${escapeHtml(document.id)} / Revision ${escapeHtml(String(document.revision))}</div>
</main></body></html>`;
}

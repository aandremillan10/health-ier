import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { document as fixture } from '../privileged/test-fixtures';
import { escapeHtml } from '../privileged/printing';
import { renderDocument } from './template';

const jpeg = readFileSync(
  new URL('../../../docs/headers/header.jpg', import.meta.url),
);

describe('fixed paper documents', () => {
  it.each(['prescription', 'medical_certificate'] as const)(
    'renders %s from the immutable snapshot with the exact local header',
    (kind) => {
      const document = structuredClone(fixture);
      document.kind = kind;
      const before = structuredClone(document);
      const html = renderDocument(document)!;
      expect(html).toContain(
        `src="data:image/jpeg;base64,${jpeg.toString('base64')}"`,
      );
      expect(html).toContain('Synthetic Patient');
      expect(html).toContain('Synthetic Doctor');
      expect(html).toContain(document.id);
      expect(html).toContain('Revision 1');
      expect(html).toContain('Space for handwritten signature');
      expect(html).not.toMatch(
        /<(script|iframe|link|object|embed)\b|(?:src|href)="(?:https?:|file:)/i,
      );
      expect(html).not.toContain('>null<');
      expect(html).not.toContain('>undefined<');
      expect(document).toEqual(before);
    },
  );

  it.each(['prescription', 'medical_certificate'] as const)(
    'escapes every snapshot string used in %s, including long multiline clinical text',
    (kind) => {
      const document = structuredClone(fixture);
      document.kind = kind;
      const malicious =
        '<script src="https://invalid.test">&\'\nLong ' + 'word'.repeat(10000);
      document.id = malicious;
      document.issueDate = malicious;
      document.snapshot.patient = {
        ...document.snapshot.patient,
        fullName: malicious,
        address: malicious,
        sex: malicious,
        cs: malicious,
      };
      document.snapshot.issuer = {
        ...document.snapshot.issuer,
        displayName: malicious,
        licenseText: malicious,
        ptrText: malicious,
      };
      document.snapshot.consultation = {
        ...document.snapshot.consultation,
        reason: malicious,
        consultationDate: malicious,
      };
      document.snapshot.body = malicious;
      document.snapshot.purpose = malicious;
      document.snapshot.remarks = malicious;
      document.snapshot.restriction = malicious;
      document.snapshot.followUp = malicious;
      const html = renderDocument(document)!;
      expect(html).not.toContain('<script');
      expect(html).toContain(escapeHtml(malicious));
      expect(html).toContain('word'.repeat(10000));
      expect(html).not.toMatch(
        /overflow:\s*hidden|text-overflow:\s*ellipsis|max-height:/,
      );
    },
  );

  it('preserves certificate wording, purpose, consultation date/reason and blank unknowns', () => {
    const document = structuredClone(fixture);
    document.kind = 'medical_certificate';
    document.snapshot.purpose = 'Synthetic employment purpose';
    document.snapshot.restriction = 'Additional synthetic restriction';
    document.snapshot.consultation.reason = 'Synthetic reason';
    const html = renderDocument(document)!;
    expect(html).toContain('TO WHOM IT MAY CONCERN:');
    expect(html).toContain('Findings and Clinical Impression:');
    expect(html).toContain('Remarks:');
    expect(html).toContain('Synthetic employment purpose');
    expect(html).toContain('Synthetic reason');
    expect(html).toContain('and not to be used for medico-legal purposes.');
    expect(html).toContain('Additional synthetic restriction');
    expect(html).toContain('<span class="field age"></span>');
    expect(html).toContain('<span class="field sex"></span>');
    expect(html.match(/class="ruled-line"/g)).toHaveLength(12);
  });

  it('preserves original prescription follow-up alongside additional instructions and zero age', () => {
    const document = structuredClone(fixture);
    document.snapshot.patient.age = 0;
    document.snapshot.followUp = 'Additional synthetic instructions';
    const html = renderDocument(document)!;
    expect(html).toContain('Age: <span class="field ">0</span>');
    expect(html).toContain('CS <span class="field "></span>');
    expect(html).toContain(
      'NOTE: If symptoms persist or worsens, follow up immediately with your doctor or proceed to the nearest healthcare facility',
    );
    expect(html).toContain('Additional synthetic instructions');
  });
});

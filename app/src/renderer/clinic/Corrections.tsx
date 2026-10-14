import type { ReactElement } from 'react';
import type { Entry, Vitals } from './contract';
import { timestamp } from './format';

import { measures } from './contract';

export function Corrections({
  original,
}: {
  original: Entry | Vitals;
}): ReactElement | null {
  const corrections = original.corrections;
  if (!corrections.length) return null;
  const previous: Record<string, unknown> = { ...original };
  const labels: Record<string, string> = {
    consultationDate: 'Consultation date',
    ageAtConsultation: 'Age at consultation',
    cs: 'CS',
    vitalsId: 'Selected vital signs',
    reason: 'Reason / symptoms',
    findings: 'Findings',
    clinicalImpression: 'Clinical impression',
    plan: 'Plan / instructions',
    recordedAt: 'Recorded at',
    ...measures,
  };
  const changes = corrections.map((c) => {
    const fields = Object.entries(c.correctedContent).filter(
      ([key, value]) => value !== previous[key],
    );
    Object.assign(previous, c.correctedContent);
    return { correction: c, fields };
  });
  return (
    <section className="corrections">
      <h4>Correction history</h4>
      {changes.map(({ correction: c, fields }) => (
        <div key={c.id}>
          <p>
            <strong>{c.reason}</strong>
          </p>
          <p className="hint">
            {c.authorName} · {timestamp(c.createdAt)} · Source revision{' '}
            {c.sourceRevision}
          </p>
          <dl className="clinical-content">
            {fields.map(([key, value]) => (
              <div key={key}>
                <dt>{labels[key] ?? key}</dt>
                <dd>
                  {value === null || value === ''
                    ? 'Not recorded'
                    : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

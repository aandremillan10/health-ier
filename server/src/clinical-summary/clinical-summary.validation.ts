import { dateOnly, invalid, object, text } from '../validation';
import type { SummaryContent, SummaryFields } from './clinical-summary.types';

function nullableDate(value: unknown, key: string): string | null {
  return value === null ? null : dateOnly(value, key);
}
function ordered(start: string | null, end: string | null, key: string): void {
  if (start && end && end < start) invalid(key);
}
export function summaryContent(input: unknown): SummaryContent {
  const base = object(input, [
    'kind',
    'substance',
    'reaction',
    'severity',
    'onsetDate',
    'name',
    'dose',
    'route',
    'frequency',
    'startDate',
    'endDate',
    'code',
    'resolvedDate',
    'administeredOn',
    'lotNumber',
    'nextDueOn',
  ]);
  switch (base.kind) {
    case 'allergy': {
      const value = object(input, [
        'kind',
        'substance',
        'reaction',
        'severity',
        'onsetDate',
      ]);
      const severity = value.severity;
      if (
        severity !== 'unknown' &&
        severity !== 'mild' &&
        severity !== 'moderate' &&
        severity !== 'severe'
      )
        invalid('severity');
      return {
        kind: 'allergy',
        substance: text(value.substance, 'substance', true, 200)!,
        reaction: text(value.reaction, 'reaction', false, 2000),
        severity,
        onsetDate: nullableDate(value.onsetDate, 'onsetDate'),
      };
    }
    case 'medication': {
      const value = object(input, [
        'kind',
        'name',
        'dose',
        'route',
        'frequency',
        'startDate',
        'endDate',
      ]);
      const startDate = nullableDate(value.startDate, 'startDate');
      const endDate = nullableDate(value.endDate, 'endDate');
      ordered(startDate, endDate, 'endDate');
      return {
        kind: 'medication',
        name: text(value.name, 'name', true, 200)!,
        dose: text(value.dose, 'dose', false, 200),
        route: text(value.route, 'route', false, 200),
        frequency: text(value.frequency, 'frequency', false, 500),
        startDate,
        endDate,
      };
    }
    case 'condition': {
      const value = object(input, [
        'kind',
        'name',
        'code',
        'onsetDate',
        'resolvedDate',
      ]);
      const onsetDate = nullableDate(value.onsetDate, 'onsetDate');
      const resolvedDate = nullableDate(value.resolvedDate, 'resolvedDate');
      ordered(onsetDate, resolvedDate, 'resolvedDate');
      return {
        kind: 'condition',
        name: text(value.name, 'name', true, 200)!,
        code: text(value.code, 'code', false, 100),
        onsetDate,
        resolvedDate,
      };
    }
    case 'immunization': {
      const value = object(input, [
        'kind',
        'name',
        'administeredOn',
        'lotNumber',
        'nextDueOn',
      ]);
      const administeredOn = dateOnly(value.administeredOn, 'administeredOn');
      const nextDueOn = nullableDate(value.nextDueOn, 'nextDueOn');
      ordered(administeredOn, nextDueOn, 'nextDueOn');
      return {
        kind: 'immunization',
        name: text(value.name, 'name', true, 200)!,
        administeredOn,
        lotNumber: text(value.lotNumber, 'lotNumber', false, 200),
        nextDueOn,
      };
    }
    default:
      return invalid('kind');
  }
}
export function summaryFields(value: Record<string, unknown>): SummaryFields {
  return {
    content: summaryContent(value.content),
    source: text(value.source, 'source', true, 1000)!,
    notes: text(value.notes, 'notes', false, 4000),
  };
}

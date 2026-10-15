import { invalid, object, text } from '../validation';
import type { SummaryContent, SummaryFields } from './clinical-summary.types';

export function summaryContent(input: unknown): SummaryContent {
  const base = object(input, ['kind', 'substance', 'name', 'dose']);
  switch (base.kind) {
    case 'allergy': {
      const value = object(input, ['kind', 'substance']);
      return {
        kind: 'allergy',
        substance: text(value.substance, 'substance', true, 200)!,
      };
    }
    case 'medication': {
      const value = object(input, ['kind', 'name', 'dose']);
      return {
        kind: 'medication',
        name: text(value.name, 'name', true, 200)!,
        dose: text(value.dose, 'dose', false, 200),
      };
    }
    case 'condition': {
      const value = object(input, ['kind', 'name']);
      return {
        kind: 'condition',
        name: text(value.name, 'name', true, 200)!,
      };
    }
    default:
      return invalid('kind');
  }
}
export function projectSummaryContent(input: unknown): SummaryContent {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return invalid('content');
  const content = input as Record<string, unknown>;
  switch (content.kind) {
    case 'allergy':
      return summaryContent({
        kind: 'allergy',
        substance: content.substance,
      });
    case 'medication':
      return summaryContent({
        kind: 'medication',
        name: content.name,
        dose: content.dose,
      });
    case 'condition':
      return summaryContent({ kind: 'condition', name: content.name });
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

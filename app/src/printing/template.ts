import type { IssuedDocument } from '../shared/clinic-api';

// The authorized Astra presentation worker installs the fixed trusted template here.
export function renderDocument(_document: IssuedDocument): string | undefined {
  void _document;
  return undefined;
}

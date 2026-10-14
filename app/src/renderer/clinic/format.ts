export function date(value: string | null): string {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value));
}
export function timestamp(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function ageOnDate(
  birthDate: string | null,
  referenceDate: string,
): number | null {
  if (!birthDate || !referenceDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  if (
    !Number.isFinite(birth.getTime()) ||
    !Number.isFinite(reference.getTime()) ||
    birth.toISOString().slice(0, 10) !== birthDate ||
    reference.toISOString().slice(0, 10) !== referenceDate ||
    birthDate > referenceDate
  )
    return null;
  const years = reference.getUTCFullYear() - birth.getUTCFullYear();
  return years - (referenceDate.slice(5) < birthDate.slice(5) ? 1 : 0);
}

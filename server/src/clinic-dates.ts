import { dateOnly, invalid } from './validation';

export function manilaDay(instant: Date): string {
  return new Date(instant.getTime() + 28800000).toISOString().slice(0, 10);
}

export function clinicRange(
  from: unknown,
  to: unknown,
): { from: string; to: string; gte: Date; lt: Date } {
  const start = dateOnly(from, 'from');
  const end = dateOnly(to, 'to');
  const gte = new Date(`${start}T00:00:00+08:00`);
  const lt = new Date(new Date(`${end}T00:00:00+08:00`).getTime() + 86400000);
  if (gte >= lt || lt.getTime() - gte.getTime() > 366 * 86400000) invalid('to');
  return { from: start, to: end, gte, lt };
}

export type Guard<T> = (value: unknown) => T;
export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid object');
  if (
    ![Object.prototype, null].includes(
      Object.getPrototypeOf(value) as object | null,
    )
  )
    throw new Error('Invalid object prototype');
  return value as Record<string, unknown>;
}
export function object<T>(shape: { [K in keyof T]-?: Guard<T[K]> }): Guard<T> {
  return (value: unknown): T => {
    const source = record(value);
    if (Object.keys(source).some((key) => !Object.hasOwn(shape, key)))
      throw new Error('Unexpected field');
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(shape) as (keyof T & string)[]) {
      const parsed = shape[key](
        Object.hasOwn(source, key) ? source[key] : undefined,
      );
      if (parsed !== undefined) result[key] = parsed;
    }
    return result as T;
  };
}
export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): T | undefined =>
    value === undefined ? undefined : guard(value);
}
export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): T | null => (value === null ? null : guard(value));
}
export function text(max = 10000, min = 0): Guard<string> {
  return (value): string => {
    if (
      typeof value !== 'string' ||
      value.length > max ||
      value.length < min ||
      value.includes('\0')
    )
      throw new Error('Invalid text');
    return value;
  };
}
export function number(
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  integer = false,
): Guard<number> {
  return (value): number => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      throw new Error('Invalid number');
    return value;
  };
}
export function choice<const T extends string>(values: readonly T[]): Guard<T> {
  return (value): T => {
    if (typeof value !== 'string' || !values.includes(value as T))
      throw new Error('Invalid choice');
    return value as T;
  };
}
export const boolean: Guard<boolean> = (value): boolean => {
  if (typeof value !== 'boolean') throw new Error('Invalid boolean');
  return value;
};
export const uuid: Guard<string> = (value): string => {
  const parsed = text(36, 36)(value);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      parsed,
    )
  )
    throw new Error('Invalid ID');
  return parsed;
};
export const date: Guard<string> = (value): string => {
  const parsed = text(10, 10)(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(parsed) ||
    Number.isNaN(Date.parse(parsed)) ||
    new Date(parsed).toISOString().slice(0, 10) !== parsed
  )
    throw new Error('Invalid date');
  return parsed;
};
export const timestamp: Guard<string> = (value): string => {
  const parsed = text(40, 20)(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(parsed) ||
    Number.isNaN(Date.parse(parsed))
  )
    throw new Error('Invalid timestamp');
  return parsed;
};
export const revision = number(1, Number.MAX_SAFE_INTEGER, true);
export const nothing: Guard<undefined> = (value): undefined => {
  if (value !== undefined) throw new Error('Unexpected input');
  return undefined;
};
export function array<T>(guard: Guard<T>): Guard<T[]> {
  return (value): T[] => {
    if (!Array.isArray(value) || value.length > 10000)
      throw new Error('Invalid list');
    return value.map(guard);
  };
}
export function partial<T>(shape: { [K in keyof T]-?: Guard<T[K]> }): Guard<
  Partial<T>
> {
  const guards = Object.fromEntries(
    Object.entries(shape).map(([key, guard]) => [
      key,
      optional(guard as Guard<unknown>),
    ]),
  );
  const parse = object<Partial<T>>(
    guards as { [K in keyof T]-?: Guard<T[K] | undefined> },
  );
  return (value): Partial<T> => {
    const parsed = parse(value);
    if (Object.keys(parsed).length === 0) throw new Error('Empty change');
    return parsed;
  };
}

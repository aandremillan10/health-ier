export type ServerMode = 'EDGE' | 'CLOUD';
export function serverMode(): ServerMode {
  const value = process.env.SERVER_MODE ?? 'EDGE';
  if (value !== 'EDGE' && value !== 'CLOUD')
    throw new Error('SERVER_MODE must be EDGE or CLOUD');
  return value;
}
export function clinicId(): string {
  const value = process.env.CLINIC_ID ?? 'synthetic-clinic';
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new Error('Invalid CLINIC_ID');
  return value;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClinicError, Result } from './contract';

export function useOperation(onExpired?: () => void): {
  busy: boolean;
  error: ClinicError | null;
  conflict: boolean;
  run: <T>(operation: () => Promise<Result<T>>) => Promise<T | null>;
  clearError: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClinicError | null>(null);
  const [conflict, setConflict] = useState(false);
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return (): void => {
      active.current = false;
    };
  }, []);
  const run = useCallback(
    async <T>(operation: () => Promise<Result<T>>): Promise<T | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await operation();
        if (!active.current) return null;
        if (result.ok) return result.data;
        setError(result.error);
        if (result.error.code === 'CONFLICT') setConflict(true);
        if (result.error.code === 'UNAUTHENTICATED') onExpired?.();
      } catch {
        if (active.current)
          setError({
            code: 'UNAVAILABLE',
            message:
              'Unable to complete the request. Keep your input and check the clinic connection before you retry.',
          });
      } finally {
        inFlight.current = false;
        if (active.current) setBusy(false);
      }
      return null;
    },
    [onExpired],
  );
  const clearError = useCallback((): void => {
    setError(null);
    setConflict(false);
  }, []);
  return {
    busy,
    error,
    conflict,
    run,
    clearError,
  };
}

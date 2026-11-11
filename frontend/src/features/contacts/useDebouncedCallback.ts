import { useCallback, useEffect, useRef } from 'react';

/**
 * Zakasnjen klic: `schedule(value)` po `ms` od zadnjega klica pokliče `callback(value)` (zadnja vrednost zmaga,
 * preostali klici se zavržejo), `cancel()` čakajoči klic opusti; ob odstranitvi komponente se čakajoči klic opusti. Časovnik teče od dogodka (tipke),
 * ne od izrisa, zato zakasnitev ni daljša od določene (iskalno polje: 300 ms, FR-008-01).
 */
export function useDebouncedCallback<T>(callback: (value: T) => void, ms: number) {
  const latest = useRef(callback);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const schedule = useCallback(
    (value: T) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(value), ms);
    },
    [ms],
  );
  const cancel = useCallback(() => clearTimeout(timer.current), []);
  return { schedule, cancel };
}

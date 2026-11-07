import { useCallback, useSyncExternalStore } from 'react';

/** Ali ustreza poizvedba medijev; posodobi se ob spremembi (research R-10 – stranski pas od 1024 px). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Širina za stranski pas (design.md 7.1, 7.2). */
export const WIDE = '(min-width: 1024px)';

/** Širina, od katere so podrobnosti kontakta v panelu ob seznamu (design.md 7.2). */
export const PANEL = '(min-width: 1280px)';

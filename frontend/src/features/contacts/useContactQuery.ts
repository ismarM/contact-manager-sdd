import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { type ContactQuery, parseQuery, serializeQuery, withChange } from './contactQuery';
import { useDebouncedCallback } from './useDebouncedCallback';

export const SEARCH_DELAY_MS = 300;

export interface UpdateOptions {
  /** Zamenja trenutni vnos zgodovine namesto novega. */
  replace?: boolean;
}

/**
 * Poizvedba seznama v naslovu strani (FR-008-08, FR-008-09): naslov je edini vir resnice; `update` uveljavi spremembo
 * (stran se ponastavi na 1, razen ob spremembi strani) in ne ustvari vnosa zgodovine, če je naslov kanonično enak
 * trenutnemu. `replace` zamenja vnos (iskanje med tipkanjem, stran onkraj zadnje), sicer se doda nov.
 */
export function useContactQuery() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseQuery(params), [params]);
  const update = useCallback(
    (change: Partial<ContactQuery>, options?: UpdateOptions) => {
      const next = serializeQuery(withChange(query, change));
      if (next === serializeQuery(query)) return;
      setParams(next, { replace: options?.replace ?? false });
    },
    [query, setParams],
  );
  return { query, update };
}

/**
 * Vrednost iskalnega polja (R-09, M3): polje ima lastno vrednost, v naslov se zapiše 300 ms po zadnji tipki (z
 * zamenjavo vnosa). Naslov polje prepiše samo, če se je `q` spremenil od zunaj (*Nazaj*, Počisti filtre); odmev
 * lastnega zapisa polja ne prepiše, zato tipkanje med osvežitvijo ne izgubi znakov.
 */
export function useSearchText(urlQ: string, commit: (q: string) => void) {
  const [text, setText] = useState(urlQ);
  // Zadnji `q` v naslovu, ki ga je polje že upoštevalo, in zadnji, ki ga je zapisalo samo.
  const [seen, setSeen] = useState(urlQ);
  const [written, setWritten] = useState(urlQ);
  if (urlQ !== seen) {
    setSeen(urlQ);
    if (urlQ !== written) {
      setWritten(urlQ);
      setText(urlQ);
    }
  }

  const { schedule, cancel } = useDebouncedCallback((value: string) => {
    const q = value.trim();
    setWritten(q);
    commit(q);
  }, SEARCH_DELAY_MS);

  const change = (value: string) => {
    setText(value);
    schedule(value);
  };

  /**
   * Druga sprememba poizvedbe (razvrstitev, filter, stran) ne počaka na zakasnitev: vpisano iskanje je v naslovu že
   * z njo, čakajoči zapis se opusti. Če sprememba sama določa iskalni niz (*Počisti filtre*), se polje nastavi nanj.
   * Vrne iskalni niz, ki velja za novo poizvedbo.
   */
  const flush = (q?: string) => {
    cancel();
    const next = q ?? text.trim();
    if (q !== undefined) setText(q);
    if (next !== urlQ || q !== undefined) setWritten(next);
    return next;
  };
  return [text, change, flush] as const;
}

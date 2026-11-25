import { useEffect, useRef } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

/**
 * Ob prehodu na drugo pot (PUSH, REPLACE) stran začne na vrhu. Brez tega nova stran podeduje odmik prejšnje: kontakt,
 * odprt s pomaknjenega seznama, se je na telefonu odprl na dnu podrobnosti. Sprememba samo poizvedbe (iskanje,
 * filtri, stran, primerjava) odmika ne spremeni; *Nazaj* (POP) prepusti brskalniku.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const lastPathname = useRef(pathname);

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    if (navigationType !== NavigationType.Pop) window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
}

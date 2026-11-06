import { useEffect, useState } from 'react';

/** `true` šele, ko je `active` vsaj `ms` milisekund – nalagalnik ne utripa ob hitrih odgovorih (design.md 8.15). */
export function useDelayed(active: boolean, ms = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setShown(true), ms);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [active, ms]);
  return active && shown;
}

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { useInvitationsApi } from './api';
import { InvitationsContext, type InvitationsContextValue } from './invitationsContext';

/**
 * Število čakajočih povabil za zgornjo vrstico (research R-08): naloži se ob izrisu ogrodja, ob vsaki spremembi poti in
 * ob `refresh()` (po sprejemu, zavrnitvi ali odgovoru 404). Ob napaki ostane prejšnje število. Samo v pomnilniku.
 */
export function InvitationsProvider({ children }: { children: ReactNode }) {
  const api = useInvitationsApi();
  const { pathname } = useLocation();
  const [tick, setTick] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    api.count().then(
      (result) => {
        if (active) setCount(result.count);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api, pathname, tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  const value = useMemo<InvitationsContextValue>(() => ({ count, refresh }), [count, refresh]);

  return <InvitationsContext.Provider value={value}>{children}</InvitationsContext.Provider>;
}

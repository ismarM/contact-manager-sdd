import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from './authContext';

/**
 * Zaščita poti (FR-001-06): dokler stanje prijave ni znano ali se profil sinhronizira, se ne izriše nič (zaščitena
 * vsebina se ne pokaže niti za trenutek). Neprijavljen gre na prijavo z zahtevano potjo kot `next`; po odjavi ali
 * izgubi seje na pot, ki jo določi AuthProvider (FR-001-09, FR-001-10).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, exitTo } = useAuth();
  const location = useLocation();

  if (status === 'signedIn') return children;
  if (status === 'signedOut') {
    const next = new URLSearchParams({ next: location.pathname + location.search });
    return <Navigate to={exitTo ?? `/login?${next.toString()}`} replace />;
  }
  return null;
}

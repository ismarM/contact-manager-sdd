import type { ReactNode } from 'react';

import type { AuthGateway } from './AuthGateway';

// Stanje seje, sinhronizacija profila, odjava in potek seje (research R-06) – implementacija v T033, T037, T044.
export function AuthProvider({ children }: { gateway: AuthGateway; children: ReactNode }) {
  return children;
}

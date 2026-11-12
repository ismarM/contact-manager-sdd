import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { useAuth } from '../auth/authContext';
import type { DeletionBlockers, DeletionOutcome, MyData } from './types';

export interface MyDataApi {
  exportData(): Promise<MyData>;
  deletionBlockers(): Promise<DeletionBlockers>;
  deleteAccount(email: string): Promise<DeletionOutcome>;
}

/** Odjemalec API funkcionalnosti 012 prek `authFetch`: izvoz, blokade izbrisa in izbris računa (204 ali 202). */
export function createMyDataApi(authFetch: AuthFetch): MyDataApi {
  return {
    exportData: () => authFetch<MyData>('/me/export'),
    deletionBlockers: () => authFetch<DeletionBlockers>('/me/deletion-blockers'),
    deleteAccount: async (email) => {
      const result = await authFetch<{ code?: string } | undefined>('/me/deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      return result?.code === 'IDENTITY_DELETION_PENDING' ? 'pending' : 'deleted';
    },
  };
}

export function useMyDataApi(): MyDataApi {
  const { authFetch } = useAuth();
  return useMemo(() => createMyDataApi(authFetch), [authFetch]);
}

import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { useAuth } from '../auth/authContext';
import type { DeletionBlockers, DeletionOutcome, MyData } from './types';

export interface MyDataApi {
  exportData(): Promise<MyData>;
  deletionBlockers(): Promise<DeletionBlockers>;
  deleteAccount(email: string): Promise<DeletionOutcome>;
}

/** Odjemalec API funkcionalnosti 012 prek `authFetch`. Ogrodje – vedenje pride z implementacijo. */
export function createMyDataApi(authFetch: AuthFetch): MyDataApi {
  void authFetch;
  const notImplemented = () => Promise.reject(new Error('not implemented: MyDataApi (012)'));
  return {
    exportData: notImplemented,
    deletionBlockers: notImplemented,
    deleteAccount: notImplemented,
  };
}

export function useMyDataApi(): MyDataApi {
  const { authFetch } = useAuth();
  return useMemo(() => createMyDataApi(authFetch), [authFetch]);
}

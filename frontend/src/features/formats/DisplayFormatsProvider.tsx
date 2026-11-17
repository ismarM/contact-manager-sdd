import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { readStoredFormats, storeFormats } from '../account/preferences';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/authContext';
import type { Profile } from '../auth/authContext';
import { DisplayFormatsContext, type DisplayFormatsValue } from './displayFormatsContext';
import type { DisplayFormats } from './types';

const fromProfile = (profile: Profile): DisplayFormats => ({
  phoneFormat: profile.phoneFormat ?? null,
  dateFormat: profile.dateFormat ?? null,
  addressFormat: profile.addressFormat ?? null,
});

/**
 * Prikazne sheme prijavljenega uporabnika (016, FR-016-16, FR-016-17): izbira iz profila (ima prednost), kopija na
 * napravi, takojšnja uveljavitev ob izbiri in shranjevanje v profil. Strežnik ostane kanoničen (FR-016-18).
 */
export function DisplayFormatsProvider({ children }: { children: ReactNode }) {
  const { profile, authFetch } = useAuth();
  // Izbira, narejena po zadnjem profilu; ob novem profilu (prijava, shranjena izbira jezika) ga nadomesti profil.
  const [local, setLocal] = useState<{ base: Profile | null; formats: DisplayFormats }>({
    base: null,
    formats: readStoredFormats(),
  });
  const [status, setStatus] = useState<{
    base: Profile | null;
    value: DisplayFormatsValue['saveStatus'];
  }>({ base: null, value: 'idle' });

  const formats = useMemo<DisplayFormats>(() => {
    if (local.base === profile && profile) return local.formats;
    return profile ? fromProfile(profile) : local.formats;
  }, [local, profile]);

  // Kopija na napravi velja tudi po odjavi in ob naslednji prijavi (COALESCE; profil ima prednost).
  useEffect(() => {
    if (profile) storeFormats(formats);
  }, [formats, profile]);

  const change = useCallback(
    (patch: Partial<DisplayFormats>) => {
      const next = { ...formats, ...patch };
      setLocal({ base: profile, formats: next });
      setStatus({ base: profile, value: 'idle' });
      if (!profile) return;
      void authFetch<Profile>('/me/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: profile.language, theme: profile.theme, ...patch }),
      }).then(
        () => setStatus({ base: profile, value: 'saved' }),
        (error: unknown) => {
          // 401 je izguba seje (že obravnavana); vse drugo: izbira ostane na napravi.
          if (!(error instanceof ApiError && error.status === 401)) {
            setStatus({ base: profile, value: 'failed' });
          }
        },
      );
    },
    [authFetch, formats, profile],
  );

  const value = useMemo<DisplayFormatsValue>(
    () => ({
      formats,
      change,
      saveStatus: status.base === profile ? status.value : 'idle',
    }),
    [formats, change, status, profile],
  );

  return <DisplayFormatsContext.Provider value={value}>{children}</DisplayFormatsContext.Provider>;
}

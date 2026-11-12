import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type AuthFetch, createAuthFetch } from '../../shared/api/authFetch';
import { ApiError } from '../../shared/api/client';
import {
  applyTheme,
  type Language,
  readStoredLanguage,
  readStoredTheme,
  storeLanguage,
  type Theme,
} from '../account/preferences';
import { type AuthGateway, type AuthUser, SignInError, type SignInErrorCode } from './AuthGateway';
import { AuthContext, type AuthContextValue, type AuthStatus, type Profile } from './authContext';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Stanje seje (research R-06): ob vsakem prijavljenem uporabniku sinhronizira profil (`PUT /api/me`) z izbiro naprave
 * in uveljavi izbiro iz profila (FR-001-19). Loči lokalno odjavo (na prijavo brez sporočila) od izgube seje – odjava v
 * drugem zavihku, nepodaljšljiv žeton ali 401 – ki vodi na prijavo s sporočilom in ciljno potjo (FR-001-10). Kam
 * preusmeri, določi `exitTo`, ki ga uporabi RequireAuth; stran za prijavo ga ob prikazu porabi.
 */
export function AuthProvider({ gateway, children }: { gateway: AuthGateway; children: ReactNode }) {
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<AuthStatus>('unknown');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signInError, setSignInError] = useState<SignInErrorCode | null>(null);
  const [theme, setTheme] = useState<Theme | null>(() => readStoredTheme());
  const [saveFailed, setSaveFailed] = useState(false);
  const [exitTo, setExitTo] = useState<string | null>(null);

  const statusRef = useRef<AuthStatus>('unknown');
  /** Pričakovan prehod v »odjavljen«, ki ga je sprožila ta aplikacija (ne drug zavihek). */
  const expectingSignOut = useRef(false);
  /** Vsaka nova seja poveča številko; odgovori starejših sinhronizacij se prezrejo. */
  const generation = useRef(0);

  const updateStatus = useCallback((next: AuthStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearSession = useCallback(() => {
    generation.current += 1;
    setProfile(null);
    setSaveFailed(false);
    updateStatus('signedOut');
  }, [updateStatus]);

  const sessionLost = useCallback(
    (signOutInGateway: boolean) => {
      if (statusRef.current === 'signedOut') return;
      if (window.location.pathname === '/login') {
        // Seja se je izgubila med prijavo (npr. 401 ob sinhronizaciji): neuspela prijava, ne potek seje.
        setSignInError('failed');
      } else {
        const next = window.location.pathname + window.location.search;
        setExitTo(`/login?${new URLSearchParams({ reason: 'session-expired', next }).toString()}`);
      }
      clearSession();
      if (signOutInGateway) {
        expectingSignOut.current = true;
        void gateway.signOut();
      }
    },
    [clearSession, gateway],
  );

  // Odjemalec se ustvari ob klicu (v dogodku), ne med izrisom.
  const authFetch: AuthFetch = useCallback(
    <T,>(path: string, init?: RequestInit) =>
      createAuthFetch(gateway, () => sessionLost(true))<T>(path, init),
    [gateway, sessionLost],
  );

  const applyProfilePreferences = useCallback(
    (next: Profile) => {
      if (next.language) {
        storeLanguage(next.language);
        void i18n.changeLanguage(next.language);
      }
      applyTheme(next.theme);
      setTheme(next.theme);
    },
    [i18n],
  );

  const synchronize = useCallback(async () => {
    const current = ++generation.current;
    updateStatus('syncing');
    try {
      const synced = await authFetch<Profile>('/me', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ language: readStoredLanguage(), theme: readStoredTheme() }),
      });
      if (current !== generation.current) return;
      applyProfilePreferences(synced);
      setProfile(synced);
      setSignInError(null);
      updateStatus('signedIn');
    } catch {
      if (current !== generation.current) return;
      // Profila ni bilo mogoče ustvariti ali posodobiti: uporabnik ostane neprijavljen (FR-001-04).
      setSignInError('failed');
      clearSession();
      expectingSignOut.current = true;
      await gateway.signOut();
    }
  }, [applyProfilePreferences, authFetch, clearSession, gateway, updateStatus]);

  const onAuthChange = useCallback(
    (user: AuthUser | null) => {
      if (user) {
        void synchronize();
        return;
      }
      if (expectingSignOut.current) {
        expectingSignOut.current = false;
        if (statusRef.current !== 'signedOut') clearSession();
        return;
      }
      if (statusRef.current === 'signedIn' || statusRef.current === 'syncing') {
        sessionLost(false);
        return;
      }
      updateStatus('signedOut');
    },
    [clearSession, sessionLost, synchronize, updateStatus],
  );

  // Ena naročnina na gateway; poslušalec vedno pokliče zadnjo različico obravnave.
  const onAuthChangeRef = useRef(onAuthChange);
  useEffect(() => {
    onAuthChangeRef.current = onAuthChange;
  }, [onAuthChange]);
  useEffect(() => gateway.onChange((user) => onAuthChangeRef.current(user)), [gateway]);

  const signIn = useCallback(async () => {
    setSignInError(null);
    try {
      await gateway.signInWithGoogle();
    } catch (error) {
      setSignInError(error instanceof SignInError ? error.code : 'failed');
    }
  }, [gateway]);

  const signOut = useCallback(async () => {
    expectingSignOut.current = true;
    setExitTo('/login');
    clearSession();
    await gateway.signOut();
  }, [clearSession, gateway]);

  // Ogrodje 012: samo lokalna odjava; sporočilo in izbris seje pridejo z implementacijo.
  const accountDeleted = useCallback(
    async (pending: boolean) => {
      void pending;
      await gateway.signOut();
    },
    [gateway],
  );

  const savePreferences = useCallback(
    async (preferences: { language: Language | null; theme: Theme | null }) => {
      if (statusRef.current !== 'signedIn') return;
      try {
        const saved = await authFetch<Profile>('/me/preferences', {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify(preferences),
        });
        setProfile(saved);
        setSaveFailed(false);
      } catch (error) {
        // 401 je izguba seje (že obravnavana); vse drugo: izbira ostane na napravi, brez ponovnega poskusa.
        if (!(error instanceof ApiError && error.status === 401)) setSaveFailed(true);
      }
    },
    [authFetch],
  );

  const changeLanguage = useCallback(
    (language: Language) => {
      storeLanguage(language);
      void i18n.changeLanguage(language);
      void savePreferences({ language, theme });
    },
    [i18n, savePreferences, theme],
  );

  const changeTheme = useCallback(
    (next: Theme | null) => {
      applyTheme(next);
      setTheme(next);
      void savePreferences({ language: i18n.language === 'en' ? 'en' : 'sl', theme: next });
    },
    [i18n, savePreferences],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      signInError,
      exitTo,
      consumeExit: () => setExitTo(null),
      signIn,
      signOut,
      accountDeleted,
      authFetch,
      theme,
      changeLanguage,
      changeTheme,
      saveFailed,
      dismissSaveFailed: () => setSaveFailed(false),
    }),
    [
      status,
      profile,
      signInError,
      exitTo,
      signIn,
      signOut,
      accountDeleted,
      authFetch,
      theme,
      changeLanguage,
      changeTheme,
      saveFailed,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

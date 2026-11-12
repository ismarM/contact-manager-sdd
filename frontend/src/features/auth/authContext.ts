import { createContext, useContext } from 'react';

import type { AuthFetch, AuthFetchBlob } from '../../shared/api/authFetch';
import type { Language, Theme } from '../account/preferences';
import type { SignInErrorCode } from './AuthGateway';

/** Profil prijavljenega uporabnika (contracts/openapi.yaml – Profile). */
export interface Profile {
  name: string | null;
  email: string;
  language: Language | null;
  theme: Theme | null;
}

export type AuthStatus = 'unknown' | 'signedOut' | 'syncing' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  /** Samo v pomnilniku; ob odjavi ali izgubi seje se izbriše (FR-001-09). */
  profile: Profile | null;
  signInError: SignInErrorCode | null;
  /** Kam po odjavi ali izgubi seje (npr. `/login?reason=session-expired&next=…`); `null` = običajna preusmeritev. */
  exitTo: string | null;
  /** Stran za prijavo ob prikazu porabi `exitTo`, da kasnejša preusmeritev (npr. Nazaj) dobi svoj `next`. */
  consumeExit: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Račun je izbrisan (012): lokalna seja se počisti, uporabnik gre na prijavo s potrdilom; `pending` = 202 (FR-012-17). */
  accountDeleted: (pending: boolean) => Promise<void>;
  authFetch: AuthFetch;
  /** Kot `authFetch`, za odgovore z datoteko (010). */
  authFetchBlob: AuthFetchBlob;
  theme: Theme | null;
  changeLanguage: (language: Language) => void;
  changeTheme: (theme: Theme | null) => void;
  /** Izbire ni bilo mogoče shraniti v račun (FR-001-19 c). */
  saveFailed: boolean;
  dismissSaveFailed: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

import { createContext, useContext } from 'react';

import type { AuthFetch, AuthFetchBlob } from '../../shared/api/authFetch';
import type { Language, Theme } from '../account/preferences';
import type { AddressFormat, DateFormat, PhoneFormat } from '../formats/types';
import type { AuthUser, SignInErrorCode } from './AuthGateway';

/** Profil prijavljenega uporabnika (contracts/openapi.yaml – Profile). */
export interface Profile {
  name: string | null;
  email: string;
  language: Language | null;
  theme: Theme | null;
  /** Revizija profilne slike (`null` = brez slike); strežnik jo vrne pri vsakem profilu (018). */
  photoRevision: number | null;
  /** 016: prikazne sheme (`null` ali odsoten = privzeto). */
  phoneFormat?: PhoneFormat | null;
  dateFormat?: DateFormat | null;
  addressFormat?: AddressFormat | null;
}

/** `unverified`: prijavljen pri ponudniku, e-naslov še ni potrjen – API ni dostopen, profil se ne sinhronizira (FR-017-02). */
export type AuthStatus = 'unknown' | 'signedOut' | 'unverified' | 'syncing' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  /** Uporabnik pri ponudniku prijave (e-naslov, potrditev, povezani ponudniki) ali `null`. */
  user: AuthUser | null;
  /** Samo v pomnilniku; ob odjavi ali izgubi seje se izbriše (FR-001-09). */
  profile: Profile | null;
  signInError: SignInErrorCode | null;
  /** Kam po odjavi ali izgubi seje (npr. `/login?reason=session-expired&next=…`); `null` = običajna preusmeritev. */
  exitTo: string | null;
  /** Stran za prijavo ob prikazu porabi `exitTo`, da kasnejša preusmeritev (npr. Nazaj) dobi svoj `next`. */
  consumeExit: () => void;
  signIn: () => Promise<void>;
  /** Prijava z e-naslovom in geslom (FR-017-05); neuspeh nastavi `signInError`. */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** Registracija (FR-017-01); ob neuspehu vrže `SignInError`. */
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  /** Ponovno pošlje potrditveno sporočilo (FR-017-03); ob neuspehu vrže `SignInError`. */
  resendVerification: () => Promise<void>;
  /** *Potrdil sem* (FR-017-13): osveži uporabnika in žeton; vrne, ali je e-naslov potrjen. */
  confirmVerification: () => Promise<boolean>;
  /** Ponastavitev gesla (FR-017-07); vrže samo `offline` ali `too-many-requests`. */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Ponovna avtentikacija (FR-017-12): z geslom, če je podano, sicer z Googlom; vrne svež ID žeton. */
  reauthenticate: (password?: string) => Promise<string>;
  /** Doda geslo Google računu (FR-017-09); po ponovni avtentikaciji; vrže `SignInError`. */
  linkPassword: (password: string) => Promise<void>;
  /** Po dodajanju gesla je Firebase ponastavil potrditev e-naslova: zaslon potrditve to pojasni. */
  linkedNeedsVerification: boolean;
  /** Spremeni geslo (FR-017-24); po ponovni avtentikaciji; vrže `SignInError`. */
  changePassword: (newPassword: string) => Promise<void>;
  /** Doda Google računu z geslom (FR-017-09); vrže `SignInError`. */
  linkGoogle: () => Promise<void>;
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
  /** Po nalaganju ali odstranitvi lastne slike (018): avatar povsod sledi novi reviziji. */
  setPhotoRevision: (photoRevision: number | null) => void;
  /** 018: prijavljeni račun Google ima sliko, ki jo je mogoče prevzeti (`POST /api/me/photo/google`). */
  hasGooglePhoto: boolean;
  dismissSaveFailed: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

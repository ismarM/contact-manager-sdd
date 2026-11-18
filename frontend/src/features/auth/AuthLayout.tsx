import { IconAlertTriangle } from '@tabler/icons-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthHeroIllustration } from '../../shared/ui/illustrations';
import { LanguageButtons } from '../../shared/ui/LanguageButtons';
import { errorAlert } from '../../shared/ui/styles';
import { useAuth } from './authContext';

/** Ena kocka vzorca pozdravne ploskve v px; premik za eno kocko traja `PATTERN_MS`. */
const PATTERN_PX = 28;
const PATTERN_MS = 90_000;

/**
 * Zelo počasen premik vzorca pozdravne ploskve (FR-020-03): edina ponavljajoča se animacija v aplikaciji. Ob
 * zmanjšanem gibanju je ni, ob skritem zavihku se ustavi.
 */
function useDriftingPattern<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof element.animate !== 'function') return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduced?.matches) return undefined;
    const animation = element.animate(
      [{ backgroundPosition: '0 0' }, { backgroundPosition: `${PATTERN_PX}px ${PATTERN_PX}px` }],
      { duration: PATTERN_MS, iterations: Infinity },
    );
    const sync = () => (document.hidden || reduced?.matches ? animation.pause() : animation.play());
    sync();
    document.addEventListener('visibilitychange', sync);
    reduced?.addEventListener?.('change', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      reduced?.removeEventListener?.('change', sync);
      animation.cancel();
    };
  }, []);
  return ref;
}

export interface AuthHero {
  title: string;
  text: string;
  /** Kratke prednosti (novi račun). */
  benefits?: string[];
}

/**
 * Postavitev zaslonov prijave, registracije, potrditve in ponastavitve (design.md 9.1; FR-020-14, -16): z `hero` na
 * namizju dva stolpca (pozdravna ploskev z naslovom, stavkom, ilustracijo in počasnim vzorcem | obrazec), na telefonu
 * pas na vrhu z besedno znamko in izbiro jezika; brez `hero` sredinska kartica. Obrazec ima naslov ravni 1 (`heading`).
 * Odzivna od 320 px (FR-017-22).
 */
export function AuthLayout({
  heading,
  hero,
  footer,
  children,
}: {
  heading: string;
  hero?: AuthHero;
  /** Povezava pod obrazcem (npr. dokumentacija API na prijavi, 019). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { changeLanguage } = useAuth();
  const pattern = useDriftingPattern<HTMLDivElement>();

  const form = (
    <div className="flex w-full max-w-[420px] flex-col gap-6">
      <h1 className="text-2xl font-semibold md:text-3xl">{heading}</h1>
      <div className="flex flex-col gap-5">{children}</div>
      {footer && <div className="flex justify-center">{footer}</div>}
    </div>
  );

  if (!hero) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-8">
        <p className="flex items-center gap-2 text-xl font-semibold">
          <span aria-hidden="true" className="inline-block h-6 w-1 rounded-xs bg-primary" />
          {t('app.name')}
        </p>
        <div className="w-full max-w-[440px] rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm md:p-8">
          {form}
        </div>
        <LanguageButtons onChange={changeLanguage} />
      </main>
    );
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <aside
        aria-label={t('app.name')}
        className="relative hidden flex-col justify-between gap-8 overflow-hidden border-r border-border bg-sunken p-12 lg:flex"
      >
        <div
          ref={pattern}
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(var(--color-border)_1.5px,transparent_1.5px)] bg-[length:28px_28px] opacity-80"
        />
        <p className="relative flex items-center gap-2 text-xl font-semibold">
          <span aria-hidden="true" className="inline-block h-6 w-1 rounded-xs bg-primary" />
          {t('app.name')}
        </p>
        <div className="relative flex max-w-lg flex-col gap-4">
          <AuthHeroIllustration size={320} />
          <p className="text-3xl leading-tight font-semibold">{hero.title}</p>
          <p className="text-lg text-muted-foreground">{hero.text}</p>
          {hero.benefits && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {hero.benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block size-2 rounded-full bg-primary"
                  />
                  {benefit}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span />
      </aside>
      <main className="flex min-h-dvh flex-col bg-background">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-5">
          <p className="flex items-center gap-2 text-lg font-semibold lg:invisible">
            <span aria-hidden="true" className="inline-block h-5 w-1 rounded-xs bg-primary" />
            {t('app.name')}
          </p>
          <LanguageButtons onChange={changeLanguage} />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pt-4 pb-10 md:px-8 lg:items-center">
          {form}
        </div>
      </main>
    </div>
  );
}

/** Sporočilo napake na obrazcu (`role="alert"`, ikona in besedilo, design.md 8.13). */
export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className={errorAlert}>
      <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
      <span>{children}</span>
    </div>
  );
}

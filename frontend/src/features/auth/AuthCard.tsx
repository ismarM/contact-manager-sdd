import { IconAlertTriangle } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LanguageButtons } from '../../shared/ui/LanguageButtons';
import { errorAlert } from '../../shared/ui/styles';
import { useAuth } from './authContext';

/**
 * Kartica strani prijave, registracije, potrditve in ponastavitve (design.md 9.1): bela kartica na sredini (največ
 * 400 px), pod njo preklop jezika. Odzivna od 320 px (FR-017-22).
 */
export function AuthCard({ heading, children }: { heading?: string; children: ReactNode }) {
  const { t } = useTranslation();
  const { changeLanguage } = useAuth();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="w-full max-w-[400px] rounded-lg border border-border bg-card p-6 text-card-foreground">
        {heading ? (
          <>
            <p className="flex items-center gap-3 text-xl font-bold">
              <span aria-hidden="true" className="inline-block h-6 w-1 rounded-sm bg-primary" />
              {t('app.name')}
            </p>
            <h1 className="mt-4 text-2xl font-bold">{heading}</h1>
          </>
        ) : (
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <span aria-hidden="true" className="inline-block h-9 w-1 rounded-sm bg-primary" />
            {t('app.name')}
          </h1>
        )}
        {children}
      </div>
      <LanguageButtons onChange={changeLanguage} />
    </main>
  );
}

/** Sporočilo napake v kartici (`role="alert"`, ikona in besedilo, design.md 8.2). */
export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className={`mt-6 ${errorAlert}`}>
      <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
      <span>{children}</span>
    </div>
  );
}

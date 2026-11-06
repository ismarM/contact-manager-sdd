import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster as Sonner, toast } from 'sonner';

import { useMediaQuery } from '../lib/useMediaQuery';
import { focusRing } from './styles';

// shadcn/ui Sonner (D-15, D-28), prilagojen po design.md 8.13 in 13.4 (točka 7): gumb za zapiranje, 5 s, spodaj desno
// (pod md spodaj na sredini), brez richColors in privzetih slogov – barve iz žetonov. Regija ima ime »Obvestila«
// (customAriaLabel, brez angleške bližnjice) in je aria-live="polite" (research R-11).

export function Toaster() {
  const { t } = useTranslation();
  const medium = useMediaQuery('(min-width: 768px)');

  // Sonner hrani obvestila v globalni shrambi in jih novemu Toasterju predvaja znova; ko ogrodje izgine (odjava),
  // njegova obvestila ne smejo ostati za naslednjo sejo.
  useEffect(() => () => void toast.dismiss(), []);

  return (
    <Sonner
      customAriaLabel={t('toast.region')}
      position={medium ? 'bottom-right' : 'bottom-center'}
      duration={5000}
      closeButton
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: t('toast.close'),
        classNames: {
          toast:
            'flex w-[calc(100vw-2rem)] max-w-[360px] items-center gap-3 rounded-lg border border-border bg-card p-4 pr-12 text-card-foreground shadow-float',
          title: 'text-base',
          closeButton: `absolute top-2 right-2 flex size-8 items-center justify-center rounded-md text-foreground hover:bg-muted ${focusRing}`,
        },
      }}
    />
  );
}

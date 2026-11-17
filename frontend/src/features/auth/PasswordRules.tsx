import { IconCircleCheck, IconCircleDashed } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { cn } from '../../shared/lib/cn';
import { passwordRuleStates } from './passwordValidation';

/**
 * Pravila gesla sproti (FR-020-15; pravila 017 iz `passwordValidation.ts`): vsako pravilo ima ikono in besedilo z
 * vizualno skritim stanjem (»izpolnjeno« / »ni izpolnjeno«), ne samo barvo. Seznam je opis polja gesla (`id`).
 */
export function PasswordRules({ id, password }: { id: string; password: string }) {
  const { t } = useTranslation();
  return (
    <ul
      id={id}
      aria-label={t('auth.form.rules.heading')}
      className="m-0 flex list-none flex-col gap-1 p-0"
    >
      {passwordRuleStates(password).map(({ id: rule, met }) => (
        <li
          key={rule}
          className={cn(
            'flex items-center gap-2 text-sm',
            met ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {met ? (
            <IconCircleCheck aria-hidden="true" size={16} stroke={1.75} className="shrink-0" />
          ) : (
            <IconCircleDashed aria-hidden="true" size={16} stroke={1.75} className="shrink-0" />
          )}
          <span>
            {t(`auth.form.rules.${rule}`)}
            <span className="sr-only">
              {' '}
              – {t(met ? 'auth.form.rules.met' : 'auth.form.rules.unmet')}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Besedilo za obvestilo bralniku zaslona ob zapustitvi polja gesla (`aria-live`). */
export function passwordRulesAnnouncement(t: TFunction, password: string): string {
  const states = passwordRuleStates(password);
  const parts = states.map(
    ({ id, met }) =>
      `${t(`auth.form.rules.${id}`)}: ${t(met ? 'auth.form.rules.met' : 'auth.form.rules.unmet')}`,
  );
  return `${t('auth.form.rules.heading')}. ${parts.join('. ')}.`;
}

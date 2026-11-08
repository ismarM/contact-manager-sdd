import { useTranslation } from 'react-i18next';

import { secondaryButton } from '../../shared/ui/styles';

/** Točka *Začetno stanje* na koncu nefiltrirane sledi (FR-005-20); gumb samo ADMIN, OWNER v nearhivirani skupini. */
export function InitialStateItem({ onRestore }: { onRestore?: () => void }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <p className="flex flex-col">
        <span className="font-bold">{t('audit.initial.heading')}</span>
        <span className="text-muted-foreground">{t('audit.initial.description')}</span>
      </p>
      {onRestore && (
        <button type="button" className={secondaryButton} onClick={onRestore}>
          {t('audit.list.rollbackButton')}
        </button>
      )}
    </li>
  );
}

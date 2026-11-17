import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import type { TypeConflictDetails } from './types';

/**
 * Konflikt pri spremembi tipa (FR-016-05; design.md 8.13): kontakti, katerih vrednost novi tip ne sprejme – povezave na
 * kontakte (največ 100), »in še N« za preostale, *Poskusi znova*. Nič ni spremenjeno.
 */
export function TypeConflictList({
  details,
  typeName,
  onRetry,
  onNavigate,
  groupId,
}: {
  details: TypeConflictDetails;
  /** Ime novega tipa v trenutnem jeziku. */
  typeName: string;
  onRetry: () => void;
  /** Klik na povezavo kontakta (npr. zapri pogovorno okno). */
  onNavigate?: () => void;
  groupId: string;
}) {
  const { t } = useTranslation();
  const more = details.total - details.contacts.length;
  return (
    <div role="alert" className={`${errorAlert} flex-col items-start`}>
      <p className="flex gap-2 font-bold">
        <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
        <span>{t('attributes.conflict.title', { type: typeName })}</span>
      </p>
      <p>{t('attributes.conflict.intro', { total: details.total, type: typeName })}</p>
      <ul className="flex max-h-64 w-full flex-col gap-2 overflow-y-auto">
        {details.contacts.map((contact) => (
          <li key={contact.contactId} className="flex flex-col">
            <Link
              to={`/groups/${encodeURIComponent(groupId)}/contacts/${encodeURIComponent(contact.contactId)}`}
              aria-label={t('attributes.conflict.open', { name: contact.displayName })}
              onClick={onNavigate}
              className={`font-bold underline ${focusRing}`}
            >
              {contact.displayName}
            </Link>
            <span className="break-words whitespace-pre-wrap">
              {t('attributes.conflict.value', { value: contact.value })}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && <p>{t('attributes.conflict.more', { count: more })}</p>}
      <button type="button" className={secondaryButton} onClick={onRetry}>
        {t('attributes.conflict.retry')}
      </button>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { focusRing, secondaryButton } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { AuditDetails } from './AuditDetails';
import { useAuditTime } from './formatTime';
import type { AuditEntry } from './types';

/** Stavek dejanja brez povezave na čas (FR-005-07): vrsta, število kontaktov in množina iz i18n. */
function useSentence() {
  const { t } = useTranslation();
  return (entry: AuditEntry): string => {
    if (entry.action === 'ROLLBACK') {
      return entry.targetInitial
        ? t('audit.sentence.ROLLBACK_initial')
        : t('audit.sentence.ROLLBACK_target');
    }
    if (entry.action === 'MERGE') {
      return t('audit.sentence.MERGE_count', { count: entry.contactCount });
    }
    if (entry.contactCount === 1 && entry.contactName) {
      return t(`audit.sentence.${entry.action}_named`, { name: entry.contactName });
    }
    return t(`audit.sentence.${entry.action}_count`, { count: entry.contactCount });
  };
}

/**
 * Vnos sledi (design.md 9.6; FR-005-07): čas, izvajalec, stavek dejanja (pri rollbacku s povezavo na ciljni vnos),
 * *Podrobnosti* in – samo za ADMIN, OWNER v nearhivirani skupini, ki ga starš poda – gumb za rollback.
 */
export function AuditEntryItem({
  entry,
  onRestore,
}: {
  entry: AuditEntry;
  onRestore?: () => void;
}) {
  const { t } = useTranslation();
  const { group } = useGroup();
  const time = useAuditTime();
  const sentence = useSentence()(entry);
  const actor = entry.actor ? (entry.actor.name ?? entry.actor.email) : t('audit.list.deletedUser');

  return (
    <li className="flex flex-col gap-1 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 break-words">
        <time dateTime={entry.createdAt} className="font-mono text-sm text-muted-foreground">
          {time(entry.createdAt)}
        </time>
        <span>
          <span className="font-bold">{actor}</span> {sentence}
          {entry.target && (
            <>
              {' '}
              <Link
                to={`/groups/${group.id}/audit/${entry.target.entryId}`}
                className={`text-primary underline underline-offset-4 ${focusRing}`}
              >
                {time(entry.target.createdAt)}
              </Link>
            </>
          )}
        </span>
      </p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AuditDetails entryId={entry.id} />
        {onRestore && (
          <button type="button" className={secondaryButton} onClick={onRestore}>
            {t('audit.list.rollbackButton')}
          </button>
        )}
      </div>
    </li>
  );
}

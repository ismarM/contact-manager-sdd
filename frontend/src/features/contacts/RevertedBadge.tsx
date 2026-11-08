import { IconArrowBackUp } from '@tabler/icons-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { focusRing } from '../../shared/ui/styles';
import { useAuditTime } from '../audit/formatTime';
import { useGroup } from '../groups/groupContext';
import type { RevertInfo } from './types';

const link = `text-primary underline underline-offset-4 ${focusRing}`;

/**
 * Oznaka *Povrnjeno* v pogledu kontakta (design.md 8.5; FR-005-19): zaprta `details`/`summary`; podrobnosti (ciljna
 * točka, vnos povrnitve, izvajalec) so vidne šele ob razkritju.
 */
export function RevertedBadge({ info }: { info: RevertInfo }) {
  const { t } = useTranslation();
  const { group } = useGroup();
  const time = useAuditTime();
  const summary = useId();
  const audit = `/groups/${group.id}/audit`;
  const who = info.rolledBackBy
    ? (info.rolledBackBy.name ?? info.rolledBackBy.email)
    : t('audit.list.deletedUser');

  return (
    <details aria-labelledby={summary} className="rounded-md border border-border p-3">
      <summary id={summary} className="flex cursor-pointer items-center gap-1 font-bold">
        <IconArrowBackUp aria-hidden="true" size={20} stroke={1.75} />
        {t('contacts.reverted.badge')}
      </summary>
      <div className="mt-2 flex flex-col gap-1">
        {info.targetInitial || !info.targetEntryId || !info.targetAt ? (
          <p>{t('contacts.reverted.toInitial')}</p>
        ) : (
          <p>
            {t('contacts.reverted.toState')}{' '}
            <Link to={`${audit}/${info.targetEntryId}`} className={link}>
              {time(info.targetAt)}
            </Link>
          </p>
        )}
        <p>
          {t('contacts.reverted.by', { name: who })}, {time(info.rolledBackAt)}
        </p>
        <Link to={`${audit}/${info.rollbackEntryId}`} className={`self-start ${link}`}>
          {t('contacts.reverted.openEntry')}
        </Link>
      </div>
    </details>
  );
}

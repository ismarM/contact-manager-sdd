import { IconArchive, IconCheck } from '@tabler/icons-react';
import { type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { RoleBadge } from '../../shared/ui/Badge';
import { Callout } from '../../shared/ui/Callout';
import { Monogram } from '../../shared/ui/Monogram';
import { card, primaryButton } from '../../shared/ui/styles';
import { DeclineInvitationDialog } from './DeclineInvitationDialog';
import { formatDate } from './formatDate';
import type { ReceivedInvitation } from './types';

/**
 * Prejeto povabilo na strani *Povabila* (design.md 8.5, 9.8; FR-006-05, FR-006-07): monogram skupine, naslov,
 * povabitelj (izbrisan uporabnik ležeče), vloga, datum, oznaka *Arhivirano* z razlago in gumba *Sprejmi* in *Zavrni*.
 */
export function InvitationItem({
  invitation,
  headingRef,
  accepting,
  onAccept,
  onDeclined,
  onError,
}: {
  invitation: ReceivedInvitation;
  headingRef: Ref<HTMLHeadingElement>;
  accepting: boolean;
  onAccept: () => void;
  onDeclined: () => void;
  onError: (error: unknown) => void;
}) {
  const { t, i18n } = useTranslation();
  const { group, invitedBy } = invitation;

  return (
    <li className={`${card} flex min-w-0 flex-col gap-4 p-5`}>
      <div className="flex min-w-0 flex-wrap items-center gap-5">
        <Monogram title={group.title} color={group.color} size={48} />
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="min-w-0 text-lg font-semibold break-words outline-none"
            >
              {group.title}
            </h2>
            {group.archived && (
              <span className="inline-flex items-center gap-1 rounded-xs bg-warning-soft px-2 py-0.5 text-sm text-warning">
                <IconArchive aria-hidden="true" size={16} stroke={1.75} />
                {t('invitations.item.archived')}
              </span>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {t('invitations.item.invitedBy')}:{' '}
              <span className="text-foreground">
                {invitedBy ? (
                  (invitedBy.name ?? invitedBy.email)
                ) : (
                  <em className="text-muted-foreground">{t('invitations.item.deletedUser')}</em>
                )}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true">{t('invitations.item.role')}</span>
              <RoleBadge value={invitation.role} />
            </span>
            <time dateTime={invitation.createdAt} className="tabular-nums">
              {formatDate(invitation.createdAt, i18n.language)}
            </time>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DeclineInvitationDialog
            invitation={invitation}
            onDeclined={onDeclined}
            onError={onError}
          />
          <button
            type="button"
            className={primaryButton}
            aria-label={t('invitations.item.acceptName', { title: group.title })}
            aria-disabled={accepting}
            onClick={onAccept}
          >
            <IconCheck aria-hidden="true" size={20} stroke={1.75} />
            {t('invitations.item.accept')}
          </button>
        </div>
      </div>
      {group.archived && (
        <Callout tone="warning" announce={false}>
          {t('invitations.item.archivedNote')}
        </Callout>
      )}
    </li>
  );
}

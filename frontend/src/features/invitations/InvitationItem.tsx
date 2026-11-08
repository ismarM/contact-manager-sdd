import { IconArchive } from '@tabler/icons-react';
import { type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { primaryButton } from '../../shared/ui/styles';
import { COLOR_SWATCH } from '../groups/colors';
import { DeclineInvitationDialog } from './DeclineInvitationDialog';
import { formatDate } from './formatDate';
import type { ReceivedInvitation } from './types';

/**
 * Prejeto povabilo na strani *Povabila* (design.md 8.5, 9.8; FR-006-05, FR-006-07): jeziček v barvi skupine, naslov,
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
    <li className="flex min-w-0 items-start gap-3 p-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-block h-6 w-1 shrink-0 rounded-sm ${COLOR_SWATCH[group.color]}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 ref={headingRef} tabIndex={-1} className="truncate text-lg font-bold outline-none">
          {group.title}
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>
            {t('invitations.item.invitedBy')}:{' '}
            {invitedBy ? (
              (invitedBy.name ?? invitedBy.email)
            ) : (
              <em className="text-muted-foreground">{t('invitations.item.deletedUser')}</em>
            )}
          </span>
          <span>
            <span className="sr-only">{t('invitations.item.role')}: </span>
            {t(`roles.${invitation.role}`)}
          </span>
          <time dateTime={invitation.createdAt} className="text-muted-foreground">
            {formatDate(invitation.createdAt, i18n.language)}
          </time>
        </p>
        {group.archived && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-warning">
              <IconArchive aria-hidden="true" size={16} stroke={1.75} />
              {t('invitations.item.archived')}
            </span>
            <span className="text-muted-foreground">{t('invitations.item.archivedNote')}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={primaryButton}
            aria-label={t('invitations.item.acceptName', { title: group.title })}
            aria-disabled={accepting}
            onClick={onAccept}
          >
            {t('invitations.item.accept')}
          </button>
          <DeclineInvitationDialog
            invitation={invitation}
            onDeclined={onDeclined}
            onError={onError}
          />
        </div>
      </div>
    </li>
  );
}

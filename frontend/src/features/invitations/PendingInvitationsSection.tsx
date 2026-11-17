import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Callout } from '../../shared/ui/Callout';
import { card, secondaryButton } from '../../shared/ui/styles';
import { roleChip } from '../members/roleChip';
import { useGroup } from '../groups/groupContext';
import { PAGE_SIZES, SectionPagination } from '../groups/SectionPagination';
import { useDelayed } from '../groups/useDelayed';
import { useInvitationsApi } from './api';
import { classify } from './errors';
import { formatDate } from './formatDate';
import type { OutgoingInvitations } from './types';
import { WithdrawInvitationDialog } from './WithdrawInvitationDialog';

interface Loaded {
  key: string;
  result: OutgoingInvitations | null;
}

/**
 * Razdelek *Čakajoča povabila* v *Nastavitvah* (design.md 8.6, 9.7; FR-006-13, FR-006-14): preglednica poslanih povabil,
 * novejše prvo, s paginacijo; gumb *Umakni povabilo* samo ob `canWithdraw`. `reloadToken` ponovno naloži seznam
 * (po pošiljanju). Pod 640 px so vrstice zložene (vsaka celica ima oznako stolpca).
 */
export function PendingInvitationsSection({ reloadToken }: { reloadToken: number }) {
  const { t, i18n } = useTranslation();
  const api = useInvitationsApi();
  const { group } = useGroup();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const key = `${page}:${size}:${tick}:${reloadToken}`;

  useEffect(() => {
    let active = true;
    api.listOutgoing(group.id, { page, size }).then(
      (result) => {
        if (active) setLoaded({ key, result });
      },
      () => {
        if (active) setLoaded({ key, result: null });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, page, size, key]);

  // Po pošiljanju ali umiku se naloži znova; ob umiku fokus prevzame naslov razdelka, ko je seznam osvežen.
  const focusHeading = useRef(false);
  useEffect(() => {
    if (focusHeading.current) {
      focusHeading.current = false;
      heading.current?.focus();
    }
  }, [loaded]);

  const loading = loaded?.key !== key;
  const showLoader = useDelayed(loading);
  const result = loaded?.result;
  const empty = !loading && result?.total === 0;

  const failed = (error: unknown) => {
    const kind = classify(error);
    if (kind === 'unavailable') {
      setFailure(t('invitations.pending.alerts.unavailable'));
      setTick((value) => value + 1);
    } else if (kind === 'forbidden') {
      setFailure(t('invitations.pending.alerts.forbidden'));
    } else if (kind === 'offline') {
      setFailure(t('invitations.pending.alerts.offline'));
    } else {
      setFailure(t('invitations.pending.alerts.failed'));
    }
  };

  const withdrawn = () => {
    setFailure(null);
    toast(t('invitations.toast.withdrawn'));
    focusHeading.current = true;
    setTick((value) => value + 1);
  };

  // Prvi odgovor še ni tu (in nalagalnik še ni viden): razdelka ne izrisujemo, da ne utripa (design.md 8.15).
  if (loaded === null && !showLoader) return null;

  const cell =
    'px-4 py-2 max-sm:flex max-sm:gap-2 max-sm:px-6 max-sm:py-1 max-sm:before:font-medium max-sm:before:content-[attr(data-label)]';

  return (
    <section aria-labelledby={headingId} className={`${card} flex flex-col`}>
      <div className="flex items-baseline gap-2 px-6 py-5">
        <h2
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          {t('invitations.pending.heading')}
        </h2>
        {result && result.total > 0 && (
          <span aria-hidden="true" className="text-xl text-muted-foreground tabular-nums">
            ({result.total})
          </span>
        )}
      </div>
      {failure && (
        <Callout tone="error" className="mx-6 mb-5">
          {failure}
        </Callout>
      )}
      {showLoader && (
        <p role="status" className="px-6 pb-5">
          {t('invitations.pending.loading')}
        </p>
      )}
      {!loading && result === null && (
        <Callout
          tone="error"
          className="mx-6 mb-5"
          action={
            <button type="button" className={secondaryButton} onClick={() => setTick((v) => v + 1)}>
              {t('invitations.pending.retry')}
            </button>
          }
        >
          {t('invitations.pending.loadFailed')}
        </Callout>
      )}
      {empty && <p className="px-6 pb-5 text-muted-foreground">{t('invitations.pending.empty')}</p>}
      {result && result.items.length > 0 && (
        <table
          aria-label={t('invitations.pending.heading')}
          aria-busy={loading}
          className="w-full border-collapse text-left"
        >
          <thead className="bg-muted text-sm max-sm:sr-only">
            <tr>
              <th scope="col" className="px-4 py-3 pl-6 font-medium">
                {t('invitations.pending.invitee')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('invitations.pending.role')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('invitations.pending.invitedBy')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('invitations.pending.date')}
              </th>
              <th scope="col" className="px-4 py-3 pr-6 text-right font-medium">
                {t('invitations.pending.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((invitation) => (
              <tr key={invitation.id} className="border-t border-border max-sm:block max-sm:py-2">
                <td data-label={t('invitations.pending.invitee')} className={`${cell} break-all`}>
                  {invitation.inviteeEmail}
                </td>
                <td data-label={t('invitations.pending.role')} className={cell}>
                  <span className={roleChip}>{t(`roles.${invitation.role}`)}</span>
                </td>
                <td
                  data-label={t('invitations.pending.invitedBy')}
                  className={`${cell} text-muted-foreground`}
                >
                  {invitation.invitedBy ? (
                    (invitation.invitedBy.name ?? invitation.invitedBy.email)
                  ) : (
                    <em className="text-muted-foreground">
                      {t('invitations.pending.deletedUser')}
                    </em>
                  )}
                </td>
                <td
                  data-label={t('invitations.pending.date')}
                  className={`${cell} text-muted-foreground tabular-nums`}
                >
                  <time dateTime={invitation.createdAt}>
                    {formatDate(invitation.createdAt, i18n.language)}
                  </time>
                </td>
                <td
                  data-label={t('invitations.pending.actions')}
                  className={`${cell} sm:pr-6 sm:text-right`}
                >
                  {invitation.canWithdraw && (
                    <WithdrawInvitationDialog
                      groupId={group.id}
                      invitation={invitation}
                      onDone={withdrawn}
                      onError={failed}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result && result.total > PAGE_SIZES[0] && (
        <SectionPagination
          label={t('invitations.pending.pagination')}
          page={result.page}
          size={result.size}
          total={result.total}
          disabled={loading}
          onPage={setPage}
          onSize={(next) => {
            setPage(0);
            setSize(next);
          }}
        />
      )}
    </section>
  );
}

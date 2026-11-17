import { LoadingState } from '../../shared/ui/Skeleton';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { ApiError } from '../../shared/api/client';
import { Callout } from '../../shared/ui/Callout';
import { Monogram } from '../../shared/ui/Monogram';
import { card, secondaryButton, textLink } from '../../shared/ui/styles';
import { useGroups } from '../groups/groupsContext';
import { useAuth } from '../auth/authContext';
import { useMyDataApi } from './api';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import type { BlockingGroup, DeletionOutcome } from './types';

type Blockers =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; groups: BlockingGroup[]; changed: boolean };

/**
 * Razdelek *Izbris računa* (design.md 9.9, točka 4; FR-012-05, FR-012-06): razlaga posledic; namesto gumba *Izbriši račun*
 * seznam nearhiviranih skupin v lasti s povezavami in navodilom (SC-007). 409 med odprtim dialogom osveži seznam iz telesa,
 * prikaže opozorilo in fokus prestavi na naslov razdelka. Po izbrisu odjavi uporabnika (204 ali 202).
 */
export function DeleteAccountSection() {
  const { t } = useTranslation();
  const api = useMyDataApi();
  const { accountDeleted } = useAuth();
  const { groups } = useGroups();
  const [blockers, setBlockers] = useState<Blockers>({ state: 'loading' });
  const heading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  // Zahtevek se ob odhodu s strani prekine (ne uhaja v naslednjo stran ali test); prekinjen odgovor se ne upošteva.
  const request = useRef<AbortController | null>(null);

  const fetchBlockers = useCallback(() => {
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    api
      .deletionBlockers(abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setBlockers({ state: 'ready', groups: result.groups, changed: false });
        }
      })
      .catch((error: unknown) => {
        // 401 je izguba seje (obravnava authFetch).
        if (abort.signal.aborted || (error instanceof ApiError && error.status === 401)) return;
        setBlockers({ state: 'failed' });
      });
  }, [api]);

  const retry = () => {
    setBlockers({ state: 'loading' });
    fetchBlockers();
  };

  useEffect(() => {
    fetchBlockers();
    return () => request.current?.abort();
  }, [fetchBlockers]);

  useEffect(() => {
    if (focusHeading.current && blockers.state === 'ready') {
      focusHeading.current = false;
      heading.current?.focus();
    }
  }, [blockers]);

  const onBlocked = (groups: BlockingGroup[]) => {
    focusHeading.current = true;
    setBlockers({ state: 'ready', groups, changed: true });
  };
  const onDeleted = (outcome: DeletionOutcome) => void accountDeleted(outcome === 'pending');

  return (
    <section aria-labelledby="account-delete" className={`${card} flex flex-col gap-4 p-4 md:p-6`}>
      <h2
        id="account-delete"
        ref={heading}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
      >
        {t('account.delete.heading')}
      </h2>
      <p className="max-w-prose text-muted-foreground">{t('account.delete.consequences')}</p>
      {blockers.state === 'loading' && (
        <LoadingState label={t('account.delete.loading')} className="text-muted-foreground" />
      )}
      {blockers.state === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <Callout tone="error" className="self-stretch">
            {t('account.delete.blockersError')}
          </Callout>
          <button type="button" onClick={retry} className={secondaryButton}>
            {t('account.delete.retry')}
          </button>
        </div>
      )}
      {blockers.state === 'ready' && blockers.changed && blockers.groups.length > 0 && (
        <Callout tone="error">{t('account.delete.ownsActiveGroups')}</Callout>
      )}
      {blockers.state === 'ready' && blockers.groups.length > 0 && (
        <Callout tone="warning" announce={false}>
          <div className="flex flex-col gap-3">
            <p className="font-semibold">{t('account.delete.blockersHeading')}</p>
            <ul aria-label={t('account.delete.blockersHeading')} className="flex flex-col gap-1.5">
              {blockers.groups.map((group) => {
                const known = groups.find((entry) => entry.id === group.id);
                return (
                  <li key={group.id} className="flex items-center gap-2.5">
                    <Monogram
                      title={group.title}
                      color={known?.color ?? 'tinta'}
                      size={24}
                      photo={
                        known?.photoRevision == null
                          ? undefined
                          : { path: `/groups/${group.id}/photo`, revision: known.photoRevision }
                      }
                    />
                    <Link to={`/groups/${group.id}`} className={textLink}>
                      {group.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="text-sm">{t('account.delete.blockersHint')}</p>
          </div>
        </Callout>
      )}
      {blockers.state === 'ready' && blockers.groups.length === 0 && (
        <div>
          <DeleteAccountDialog onDeleted={onDeleted} onBlocked={onBlocked} />
        </div>
      )}
    </section>
  );
}

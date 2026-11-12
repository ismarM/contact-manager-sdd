import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { ApiError } from '../../shared/api/client';
import { errorAlert, secondaryButton } from '../../shared/ui/styles';
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
    <section aria-labelledby="account-delete" className="flex flex-col gap-3">
      <h2
        id="account-delete"
        ref={heading}
        tabIndex={-1}
        className="text-xl font-bold outline-none"
      >
        {t('account.delete.heading')}
      </h2>
      <p>{t('account.delete.consequences')}</p>
      {blockers.state === 'loading' && (
        <p role="status" className="text-muted-foreground">
          {t('account.delete.loading')}
        </p>
      )}
      {blockers.state === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{t('account.delete.blockersError')}</span>
          </div>
          <button type="button" onClick={retry} className={secondaryButton}>
            {t('account.delete.retry')}
          </button>
        </div>
      )}
      {blockers.state === 'ready' && blockers.changed && blockers.groups.length > 0 && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t('account.delete.ownsActiveGroups')}</span>
        </div>
      )}
      {blockers.state === 'ready' && blockers.groups.length > 0 && (
        <div className="flex flex-col gap-2">
          <ul
            aria-label={t('account.delete.blockersHeading')}
            className="flex list-disc flex-col gap-1 pl-6"
          >
            {blockers.groups.map((group) => (
              <li key={group.id}>
                <Link to={`/groups/${group.id}`} className="text-primary underline">
                  {group.title}
                </Link>
              </li>
            ))}
          </ul>
          <p>{t('account.delete.blockersHint')}</p>
        </div>
      )}
      {blockers.state === 'ready' && blockers.groups.length === 0 && (
        <div>
          <DeleteAccountDialog onDeleted={onDeleted} onBlocked={onBlocked} />
        </div>
      )}
    </section>
  );
}

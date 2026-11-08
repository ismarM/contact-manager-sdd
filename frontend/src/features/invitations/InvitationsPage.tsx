import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useGroups } from '../groups/groupsContext';
import { PAGE_SIZES, SectionPagination } from '../groups/SectionPagination';
import { useDelayed } from '../groups/useDelayed';
import { useInvitationsApi } from './api';
import { classify } from './errors';
import { InvitationItem } from './InvitationItem';
import { useInvitations } from './invitationsContext';
import type { ReceivedInvitation, ReceivedInvitations } from './types';

interface Loaded {
  key: string;
  result: ReceivedInvitations | null;
}

/**
 * Zaslon *Povabila* (design.md 9.8; FR-006-05 … FR-006-11): seznam prejetih povabil, novejše prvo, s paginacijo
 * (25/50/100), prazno stanje, sprejem in zavrnitev (z dialogom). Po uspehu se število v zgornji vrstici in povzetek
 * skupin osvežita; fokus preide na naslednje povabilo ali naslov.
 */
export function InvitationsPage() {
  const { t } = useTranslation();
  const api = useInvitationsApi();
  const invitations = useInvitations();
  const groups = useGroups();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const itemHeadings = useRef(new Map<string, HTMLHeadingElement>());
  const focusTarget = useRef<string | null>(null);
  const focusAfterLoad = useRef(false);
  const key = `${page}:${size}:${tick}`;
  useDocumentTitle(t('title.invitations'));

  useEffect(() => {
    let active = true;
    api.listReceived({ page, size }).then(
      (result) => {
        if (!active) return;
        setLoaded({ key, result });
        if (focusAfterLoad.current) {
          focusAfterLoad.current = false;
          heading.current?.focus();
        }
      },
      () => {
        if (active) setLoaded({ key, result: null });
      },
    );
    return () => {
      active = false;
    };
  }, [api, page, size, key]);

  // Fokus po odstranitvi povabila: naslednje povabilo ali naslov strani.
  useEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    focusTarget.current = null;
    if (target === 'page') heading.current?.focus();
    else (itemHeadings.current.get(target) ?? heading.current)?.focus();
  }, [loaded]);

  const loading = loaded?.key !== key;
  const showLoader = useDelayed(loading);
  const result = loaded?.result;
  const empty = !loading && result?.total === 0;

  const reload = useCallback(() => {
    setTick((value) => value + 1);
    invitations.refresh();
  }, [invitations]);

  const removeLocally = (invitation: ReceivedInvitation) => {
    if (!result) return;
    const index = result.items.findIndex((item) => item.id === invitation.id);
    const next = result.items[index + 1] ?? result.items[index - 1];
    focusTarget.current = next?.id ?? 'page';
    setLoaded({
      key,
      result: {
        ...result,
        total: result.total - 1,
        items: result.items.filter((item) => item.id !== invitation.id),
      },
    });
    reload();
  };

  const fail = (error: unknown, action: 'accept' | 'decline') => {
    const kind = classify(error);
    if (kind === 'unavailable') {
      setFailure(t('invitations.alerts.unavailable'));
      reload();
    } else if (kind === 'alreadyMember') {
      setFailure(t('invitations.alerts.alreadyMember'));
      groups.refresh();
      reload();
    } else if (kind === 'offline') {
      setFailure(t('invitations.alerts.offline'));
    } else {
      setFailure(
        t(
          action === 'accept'
            ? 'invitations.alerts.acceptFailed'
            : 'invitations.alerts.declineFailed',
        ),
      );
    }
  };

  const accept = async (invitation: ReceivedInvitation) => {
    if (accepting) return;
    setAccepting(invitation.id);
    setFailure(null);
    try {
      const joined = await api.accept(invitation.id);
      removeLocally(invitation);
      groups.refresh();
      toast(
        <span>
          {t('invitations.toast.joined', { title: joined.title })}{' '}
          <Link
            to={`/groups/${joined.groupId}`}
            className={`font-bold text-primary underline underline-offset-4 ${focusRing}`}
          >
            {t('invitations.toast.openGroup')}
          </Link>
        </span>,
      );
    } catch (error) {
      fail(error, 'accept');
    } finally {
      setAccepting(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-[80ch] flex-col gap-6 px-4 py-8">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
        {t('invitations.page.heading')}
      </h1>
      {failure && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{failure}</span>
        </div>
      )}
      {showLoader && <p role="status">{t('invitations.page.loading')}</p>}
      {!loading && result === null && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex-1">{t('invitations.page.loadFailed')}</span>
          <button type="button" className={secondaryButton} onClick={() => setTick((v) => v + 1)}>
            {t('invitations.page.retry')}
          </button>
        </div>
      )}
      {empty && (
        <section className="flex flex-col items-start gap-2">
          <h2 className="text-xl font-bold">{t('invitations.page.emptyTitle')}</h2>
          <p className="text-muted-foreground">{t('invitations.page.emptyText')}</p>
        </section>
      )}
      {result && result.items.length > 0 && (
        <ul
          aria-label={t('invitations.page.list')}
          aria-busy={loading}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
        >
          {result.items.map((invitation) => (
            <InvitationItem
              key={invitation.id}
              invitation={invitation}
              headingRef={(element) => {
                if (element) itemHeadings.current.set(invitation.id, element);
                else itemHeadings.current.delete(invitation.id);
              }}
              accepting={accepting !== null}
              onAccept={() => void accept(invitation)}
              onDeclined={() => {
                removeLocally(invitation);
                toast(t('invitations.toast.declined'));
              }}
              onError={(error) => fail(error, 'decline')}
            />
          ))}
        </ul>
      )}
      {result && result.total > PAGE_SIZES[0] && (
        <SectionPagination
          label={t('invitations.page.pagination')}
          page={result.page}
          size={result.size}
          total={result.total}
          disabled={loading}
          onPage={(next) => {
            focusAfterLoad.current = true;
            setPage(next);
          }}
          onSize={(next) => {
            setPage(0);
            setSize(next);
          }}
        />
      )}
    </div>
  );
}

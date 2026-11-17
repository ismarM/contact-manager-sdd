import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useAuditSentence } from '../audit/auditSentence';
import { useAuditTime } from '../audit/formatTime';
import { countryName } from '../contacts/countries';
import { useUiLanguage } from '../contacts/useUiLanguage';
import { useFormatters } from '../formats/useFormatters';
import { useGroup } from '../groups/groupContext';
import { useDelayed } from '../groups/useDelayed';
import { isNotFound, useHistoryApi } from './api';
import { stateName } from './historyRouting';
import { RestoreDialog } from './RestoreDialog';
import { CURRENT, type ContactStatus, type Version } from './types';
import { useVersionLabel } from './versionLabel';

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'notFound' }
  | { kind: 'ready'; version: Version };

const link = `text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`;

/** Polja različice za branje: samo izpolnjena, kot v pogledu kontakta (004). */
export function VersionFields({ version }: { version: Version }) {
  const { t } = useTranslation();
  const language = useUiLanguage();
  const format = useFormatters();
  const { state } = version;
  const rows: [string, string][] = [
    [t('contacts.view.company'), state.company ?? ''],
    [
      t('contacts.view.address'),
      state.addressParts ? format.address(state.addressParts) : (state.address ?? ''),
    ],
    [t('contacts.view.country'), state.country ? countryName(state.country, language) : ''],
    [t('contacts.view.email'), state.email ?? ''],
    [t('contacts.view.phone'), state.phone ? format.phone(state.phone) : ''],
  ];
  const filled = rows.filter(([, value]) => value !== '');
  return (
    <div className="flex flex-col gap-5">
      {filled.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {filled.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-bold">{label}</dt>
              <dd className="break-words whitespace-pre-line">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {state.attributes.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('contacts.view.attributes')}>
          <h3 className="text-lg font-bold">{t('contacts.view.attributes')}</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            {state.attributes.map((attribute) => (
              <div key={attribute.key} className="contents">
                <dt className="font-bold break-words">{attribute.key}</dt>
                <dd className="break-words whitespace-pre-line">
                  {attribute.parts
                    ? format.address(attribute.parts, true)
                    : format.byType(attribute.type, attribute.value ?? '')}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {state.tags.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('contacts.view.tags')}>
          <h3 className="text-lg font-bold">{t('contacts.view.tags')}</h3>
          <ul className="flex flex-wrap gap-2">
            {state.tags.map((tag) => (
              <li key={tag} className="rounded-sm bg-muted px-2 py-0.5 text-sm">
                {tag}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Ogled različice kontakta (FR-015-08; plan.md 015 – Pages and routes): stanje samo za branje z izvajalcem in časom
 * dogodka, povezavo na primerjavo s trenutnim stanjem (samo za obstoječ kontakt) in obnovo (EDITOR+ v nearhivirani skupini).
 */
export function VersionPage({ contactId, versionRef }: { contactId: string; versionRef: string }) {
  const { t } = useTranslation();
  const api = useHistoryApi();
  const navigate = useNavigate();
  const { group } = useGroup();
  const time = useAuditTime();
  const sentence = useAuditSentence();
  const versionLabel = useVersionLabel();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [status, setStatus] = useState<ContactStatus | null>(null);
  const [reloads, setReloads] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const showLoader = useDelayed(state.kind === 'loading');
  const canRestore = group.role !== 'VIEWER' && !group.archived && versionRef !== CURRENT;
  useDocumentTitle(t('title.groupScreen', { screen: t('title.version'), group: group.title }));

  useEffect(() => {
    let active = true;
    api.getVersion(group.id, contactId, versionRef).then(
      (version) => {
        if (active) setState({ kind: 'ready', version });
      },
      (error: unknown) => {
        if (active) setState({ kind: isNotFound(error) ? 'notFound' : 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, contactId, versionRef, reloads]);

  // Stanje kontakta (obstoječ/izbrisan) določa, ali je primerjava s trenutnim stanjem mogoča; napaka ni usodna.
  useEffect(() => {
    let active = true;
    api.getHistory(group.id, contactId, 0, 25).then(
      (history) => {
        if (active) setStatus(history.contact.status);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api, group.id, contactId]);

  if (state.kind === 'notFound') return <NotFoundPage />;

  const version = state.kind === 'ready' ? state.version : null;
  const base = `/groups/${group.id}/contacts/${contactId}`;
  const name = version ? stateName(version.state) : '';
  const actor = version
    ? version.actor
      ? (version.actor.name ?? version.actor.email)
      : t('audit.list.deletedUser')
    : '';

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-[70ch] flex-col gap-4 px-4 py-6"
    >
      <Link to={`${base}/history`} className={`inline-flex items-center gap-1 self-start ${link}`}>
        <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
        {t('history.version.back')}
      </Link>

      {state.kind === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('history.version.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                setReloads((n) => n + 1);
              }}
            >
              {t('history.version.retry')}
            </button>
          </span>
        </div>
      )}
      {state.kind === 'loading' && showLoader && (
        <p role="status">{t('history.version.loading')}</p>
      )}

      <h2 id={headingId} className="text-xl font-bold break-words">
        {version ? t('history.version.heading', { name }) : t('title.version')}
      </h2>
      {version && (
        <>
          <p className="font-bold">{versionLabel(version.ref, version.createdAt)}</p>
          {version.createdAt && version.action && (
            <p className="break-words text-muted-foreground">
              <time dateTime={version.createdAt}>{time(version.createdAt)}</time> {actor}{' '}
              {sentence(
                {
                  action: version.action,
                  contactCount: 1,
                  contactName: null,
                  targetInitial: false,
                },
                { anonymous: true },
              )}
            </p>
          )}
          <p className="text-muted-foreground">{t('history.version.readOnly')}</p>
          <div className="flex flex-wrap items-center gap-3">
            {status === 'ACTIVE' && versionRef !== CURRENT && (
              <Link
                to={`${base}/compare?from=${encodeURIComponent(versionRef)}&to=${CURRENT}`}
                className={secondaryButton}
              >
                {t('history.version.compareCurrent')}
              </Link>
            )}
            {canRestore && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  opener.current =
                    document.activeElement instanceof HTMLElement ? document.activeElement : null;
                  setRestoring(true);
                }}
              >
                {t('history.restore.button')}
              </button>
            )}
          </div>
          <VersionFields version={version} />
        </>
      )}

      <RestoreDialog
        contactId={contactId}
        contactName={name || null}
        from={restoring ? versionRef : null}
        returnFocus={opener}
        onClose={() => setRestoring(false)}
        onRestored={() => {
          opener.current = null;
          setRestoring(false);
          void navigate(`${base}/history`);
        }}
      />
    </section>
  );
}

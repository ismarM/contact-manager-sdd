import { IconChartBar, IconClock } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { Callout } from '../../shared/ui/Callout';
import { card, ghostButton, secondaryButton, textLink } from '../../shared/ui/styles';
import { useApiKeysApi } from './api';
import { CreateApiKeyDialog } from './CreateApiKeyDialog';
import { RevokeApiKeyDialog } from './RevokeApiKeyDialog';
import type { ApiKey } from './types';

const badge = 'inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-sm';
const neutralBadge = `${badge} border border-border text-muted-foreground`;
const okBadge = `${badge} bg-success-soft text-success`;
const warningBadge = `${badge} bg-warning-soft text-warning`;
const link = `${textLink} self-start text-sm`;

/**
 * Razdelek *API ključi* v *Mojem računu* (FR-019-01 … -04, -20; design.md 9.9): seznam z imenom, prepoznavnim delom,
 * obsegom, časi, stanjem (8.5) in »kmalu poteče«, nov ključ (prikazan enkrat), preklic s potrditvijo (8.11), povezava
 * na statistiko ključa in stran API. Vrednost ključa ni nikoli na seznamu.
 */
export function ApiKeysSection() {
  const { t } = useTranslation();
  const api = useApiKeysApi();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.list(controller.signal).then(
      (result) => {
        setKeys(result);
        setLoadFailed(false);
      },
      () => {
        if (!controller.signal.aborted) setLoadFailed(true);
      },
    );
    return () => controller.abort();
  }, [api, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  return (
    <section
      aria-labelledby="account-api-keys"
      className={`${card} flex flex-col gap-4 p-4 md:p-6`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <h2 id="account-api-keys" className="text-xl font-semibold">
            {t('apiKeys.heading')}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t('apiKeys.description')}</p>
          <Link to="/api-docs" className={link}>
            {t('apiKeys.docsLink')}
          </Link>
        </div>
        <CreateApiKeyDialog api={api} onCreated={reload} />
      </div>
      {loadFailed && (
        <Callout
          tone="error"
          action={
            <button type="button" className={secondaryButton} onClick={reload}>
              {t('apiKeys.retry')}
            </button>
          }
        >
          {t('apiKeys.loadFailed')}
        </Callout>
      )}
      {keys && keys.length === 0 && <p>{t('apiKeys.empty')}</p>}
      {keys && keys.length > 0 && (
        <ul aria-label={t('apiKeys.list')} className="flex flex-col gap-2.5">
          {keys.map((key) => (
            <ApiKeyItem
              key={key.id}
              apiKey={key}
              revoke={api.revoke}
              onRevoked={() => {
                toast(t('apiKeys.revoke.done', { name: key.name }));
                reload();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ApiKeyItem({
  apiKey,
  revoke,
  onRevoked,
}: {
  apiKey: ApiKey;
  revoke: (keyId: string) => Promise<void>;
  onRevoked: () => void;
}) {
  const { t, i18n } = useTranslation();
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );
  const format = (value: string) => date.format(new Date(value));
  const permission = (value: ApiKey['allGroupsPermission']) =>
    t(`apiKeys.permission.${value ?? 'READ'}`);
  const noValidGroups = !apiKey.allGroups && apiKey.groups.length === 0;

  const scope = apiKey.allGroups
    ? t('apiKeys.allGroupsWithPermission', { permission: permission(apiKey.allGroupsPermission) })
    : apiKey.groups
        .map((group) =>
          t('apiKeys.groupWithPermission', {
            title: group.title,
            permission: permission(group.permission),
          }),
        )
        .join(', ');

  const validity =
    apiKey.status === 'REVOKED' && apiKey.revokedAt
      ? t('apiKeys.revokedAt', { date: format(apiKey.revokedAt) })
      : apiKey.expiresAt === null
        ? t('apiKeys.noExpiry')
        : apiKey.status === 'EXPIRED'
          ? t('apiKeys.expired', { date: format(apiKey.expiresAt) })
          : t('apiKeys.expires', { date: format(apiKey.expiresAt) });

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-semibold break-words">{apiKey.name}</span>
        <span
          className={
            apiKey.status === 'ACTIVE'
              ? okBadge
              : apiKey.status === 'EXPIRED'
                ? warningBadge
                : neutralBadge
          }
        >
          {t(`apiKeys.status.${apiKey.status}`)}
        </span>
        {apiKey.expiringSoon && apiKey.status === 'ACTIVE' && (
          <span className={warningBadge}>
            <IconClock aria-hidden="true" size={16} stroke={1.75} />
            {t('apiKeys.status.expiringSoon')}
          </span>
        )}
        {noValidGroups && <span className={warningBadge}>{t('apiKeys.noValidGroups')}</span>}
        <span className="ml-auto font-mono text-sm break-all text-muted-foreground">
          {t('apiKeys.hint', { hint: `cmk_…${apiKey.hint}` })}
        </span>
      </div>
      {!noValidGroups && <span className="text-sm break-words">{scope}</span>}
      <span className="text-sm text-muted-foreground">
        {t('apiKeys.created', { date: format(apiKey.createdAt) })}
        {' · '}
        {validity}
        {' · '}
        {apiKey.lastUsedAt
          ? t('apiKeys.lastUsed', { date: format(apiKey.lastUsedAt) })
          : t('apiKeys.neverUsed')}
        {apiKey.lastUsedAt && (
          <>
            {' · '}
            {t('apiKeys.requests24h', { count: apiKey.requestsLast24h })}
          </>
        )}
      </span>
      <div className="-ml-3 flex flex-wrap items-center gap-2">
        <Link
          to={`/account/api-keys/${encodeURIComponent(apiKey.id)}`}
          className={`${ghostButton} text-primary`}
          aria-label={t('apiKeys.usageLink', { name: apiKey.name })}
        >
          <IconChartBar aria-hidden="true" size={20} stroke={1.75} />
          {t('apiKeys.usageShort')}
        </Link>
        {apiKey.status === 'ACTIVE' && (
          <RevokeApiKeyDialog apiKey={apiKey} revoke={revoke} onRevoked={onRevoked} />
        )}
      </div>
    </li>
  );
}

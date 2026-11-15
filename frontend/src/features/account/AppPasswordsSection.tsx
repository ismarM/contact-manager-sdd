import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import {
  dangerButton,
  errorAlert,
  fieldError,
  primaryButton,
  secondaryButton,
  textInput,
} from '../../shared/ui/styles';
import { useAuth } from '../auth/authContext';

// Gesla za aplikacijo in navodilo CardDAV (014, FR-014-21, -25, -27; contracts/openapi.yaml).

export interface AppPassword {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface CreatedPassword extends AppPassword {
  password: string;
  username: string;
}

function useAppPasswordsApi() {
  const { authFetch } = useAuth();
  return useMemo(
    () => ({
      list: (signal?: AbortSignal) =>
        authFetch<{ items: AppPassword[] }>('/me/app-passwords', { signal }),
      create: (name: string) =>
        authFetch<CreatedPassword>('/me/app-passwords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }),
      revoke: (id: string) => authFetch<void>(`/me/app-passwords/${id}`, { method: 'DELETE' }),
    }),
    [authFetch],
  );
}

/** Naslov strežnika CardDAV: isti izvor kot aplikacija, pot `/dav/` (research R-08). */
export function davServer(): string {
  return `${window.location.origin}/dav/`;
}

/**
 * Razdelek *Gesla za aplikacijo* v *Mojem računu*: seznam (ime, nastanek, zadnja uporaba), novo geslo (prikazano
 * enkrat), preklic s potrditvijo (feature-map §2.8) in navodilo za povezavo. Gesla nikoli niso v seznamu.
 */
export function AppPasswordsSection() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const api = useAppPasswordsApi();
  const [items, setItems] = useState<AppPassword[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );

  useEffect(() => {
    const controller = new AbortController();
    api.list(controller.signal).then(
      (result) => {
        setItems(result.items);
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
    <section aria-labelledby="account-app-passwords" className="flex flex-col gap-3">
      <h2 id="account-app-passwords" className="text-xl font-bold">
        {t('account.appPasswords.heading')}
      </h2>
      <p>{t('account.appPasswords.description')}</p>
      {loadFailed && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('account.appPasswords.loadFailed')}
            <button type="button" className={secondaryButton} onClick={reload}>
              {t('account.appPasswords.retry')}
            </button>
          </span>
        </div>
      )}
      {items && items.length === 0 && <p>{t('account.appPasswords.empty')}</p>}
      {items && items.length > 0 && (
        <ul aria-label={t('account.appPasswords.list')} className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="flex flex-col">
                <span className="font-bold">{item.name}</span>
                <span className="text-muted-foreground">
                  {t('account.appPasswords.created', {
                    date: date.format(new Date(item.createdAt)),
                  })}
                  {' · '}
                  {item.lastUsedAt
                    ? t('account.appPasswords.lastUsed', {
                        date: date.format(new Date(item.lastUsedAt)),
                      })
                    : t('account.appPasswords.neverUsed')}
                </span>
              </div>
              <RevokeDialog
                item={item}
                revoke={api.revoke}
                onRevoked={() => {
                  toast(t('account.appPasswords.revoked', { name: item.name }));
                  reload();
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <CreateDialog create={api.create} onCreated={reload} />
      <section aria-labelledby="account-carddav-help" className="flex flex-col gap-2">
        <h3 id="account-carddav-help" className="text-lg font-bold">
          {t('account.appPasswords.help.heading')}
        </h3>
        <ol className="list-decimal pl-6">
          <li>{t('account.appPasswords.help.step1')}</li>
          <li>{t('account.appPasswords.help.step2')}</li>
          <li>
            {t('account.appPasswords.help.step3', {
              server: davServer(),
              username: profile?.email ?? '',
            })}
          </li>
        </ol>
        <p className="text-muted-foreground">{t('account.appPasswords.help.https')}</p>
      </section>
    </section>
  );
}

function CreateDialog({
  create,
  onCreated,
}: {
  create: (name: string) => Promise<CreatedPassword>;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedPassword | null>(null);

  const submit = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('account.appPasswords.nameRequired'));
      return;
    }
    if ([...trimmed].length > 50) {
      setError(t('account.appPasswords.nameTooLong'));
      return;
    }
    setError(null);
    setFailure(null);
    setBusy(true);
    try {
      setCreated(await create(trimmed));
      onCreated();
    } catch (problem) {
      setFailure(
        problem instanceof ApiError && problem.code === 'APP_PASSWORD_LIMIT'
          ? t('account.appPasswords.limit')
          : problem instanceof ApiError
            ? t('account.appPasswords.failed')
            : t('groups.offline'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // Geslo po zaprtju okna ni več vidno (FR-014-21).
          setCreated(null);
          setName('');
          setError(null);
          setFailure(null);
        }
      }}
    >
      <DialogTrigger className={`${primaryButton} self-start`}>
        {t('account.appPasswords.create')}
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogTitle>
              {t('account.appPasswords.createdTitle', { name: created.name })}
            </DialogTitle>
            <p role="status">{t('account.appPasswords.showOnce')}</p>
            <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
              <CopyRow label={t('account.appPasswords.server')} value={davServer()} />
              <CopyRow label={t('account.appPasswords.username')} value={created.username} />
              <CopyRow label={t('account.appPasswords.password')} value={created.password} mono />
            </dl>
            <DialogClose className={`${secondaryButton} self-start`}>
              {t('account.appPasswords.close')}
            </DialogClose>
          </>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogTitle>{t('account.appPasswords.create')}</DialogTitle>
            <div className="flex flex-col gap-1">
              <label htmlFor={nameId} className="font-bold">
                {t('account.appPasswords.nameLabel')}
              </label>
              <input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${nameId}-error` : undefined}
                className={textInput}
              />
              {error && (
                <p id={`${nameId}-error`} className={fieldError}>
                  {error}
                </p>
              )}
            </div>
            {failure && (
              <p role="alert" className={errorAlert}>
                {failure}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={primaryButton} aria-disabled={busy}>
                {t('account.appPasswords.createSubmit')}
              </button>
              <DialogClose className={secondaryButton}>
                {t('account.appPasswords.cancel')}
              </DialogClose>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CopyRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <dt className="font-bold">{label}</dt>
      <dd className={`break-all ${mono ? 'font-mono' : ''}`}>{value}</dd>
      <dd>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(value)
              .then(() => toast(t('account.appPasswords.copied')));
          }}
        >
          {t('account.appPasswords.copy', { what: label })}
        </button>
      </dd>
    </>
  );
}

function RevokeDialog({
  item,
  revoke,
  onRevoked,
}: {
  item: AppPassword;
  revoke: (id: string) => Promise<void>;
  onRevoked: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await revoke(item.id);
      setOpen(false);
      onRevoked();
    } catch (problem) {
      if (problem instanceof ApiError && problem.status === 404) {
        setOpen(false);
        onRevoked();
      } else {
        setFailure(t('account.appPasswords.revokeFailed'));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setFailure(null);
      }}
    >
      <DialogTrigger className={secondaryButton}>
        {t('account.appPasswords.revoke', { name: item.name })}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t('account.appPasswords.revokeTitle', { name: item.name })}</DialogTitle>
        <p>{t('account.appPasswords.revokeBody')}</p>
        {failure && (
          <p role="alert" className={errorAlert}>
            {failure}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <DialogClose className={secondaryButton}>{t('account.appPasswords.cancel')}</DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {t('account.appPasswords.revokeConfirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

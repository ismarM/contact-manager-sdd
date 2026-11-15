import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../../shared/ui/dialog';
import {
  errorAlert,
  focusRing,
  primaryButton,
  secondaryButton,
  warningAlert,
} from '../../shared/ui/styles';
import { ChangeTable } from '../audit/ChangeTable';
import { useAuditTime } from '../audit/formatTime';
import { useGroup } from '../groups/groupContext';
import { useHistoryApi } from './api';
import { stateName } from './historyRouting';
import { INITIAL, LATEST, type RestorePreview, type RestoreRequest } from './types';

type Load =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'gone' }
  | { kind: 'ready'; preview: RestorePreview };

type Message = 'conflict' | 'failed' | 'archived' | 'forbidden' | 'gone';

const MESSAGE_KEY = {
  conflict: 'history.restore.conflict',
  failed: 'history.restore.failed',
  archived: 'history.restore.archived',
  forbidden: 'history.restore.forbidden',
  gone: 'history.restore.gone',
} as const satisfies Record<Message, string>;

/** Telo obnove iz predogleda: žeton obnove je verzija (obstoječ kontakt) ali najnovejši vnos (izbrisan; research R-04). */
function requestFor(from: string, preview: RestorePreview): RestoreRequest | null {
  if (preview.status === 'ACTIVE') {
    return preview.currentVersion === null ? null : { from, version: preview.currentVersion };
  }
  return preview.lastEntryId === null ? null : { from, lastEntryId: preview.lastEntryId };
}

/** Ključ prevoda polja, v katerem je kršitev (`country`, `company`, `attributes[i].key`). */
function violationField(
  field: string,
):
  | 'history.restore.fieldCountry'
  | 'history.restore.fieldCompany'
  | 'history.restore.fieldAttribute' {
  if (field === 'country') return 'history.restore.fieldCountry';
  if (field === 'company') return 'history.restore.fieldCompany';
  return 'history.restore.fieldAttribute';
}

/** Kode kršitev z lastnim besedilom; druge dobijo splošno. */
function violationCode(code: string): 'RESERVED_KEY' | 'INVALID_VALUE' | 'TOO_LONG' | 'default' {
  return code === 'RESERVED_KEY' || code === 'INVALID_VALUE' || code === 'TOO_LONG'
    ? code
    : 'default';
}

function RestoreBody({
  contactId,
  contactName,
  from,
  cancel,
  onRestored,
  onConflict,
}: {
  contactId: string;
  contactName: string | null;
  from: string;
  cancel: React.RefObject<HTMLButtonElement | null>;
  onRestored: () => void;
  onConflict?: () => void;
}) {
  const { t } = useTranslation();
  const api = useHistoryApi();
  const { group, reload: reloadGroup } = useGroup();
  const time = useAuditTime();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  // Možno podvajanje: uporabnik ga mora izrecno potrditi (FR-015-14); potrditev velja za prikazani predogled.
  const [acknowledged, setAcknowledged] = useState(false);
  // `LATEST` (seznam izbrisanih): zadnja zabeležena različica kontakta je stanje pred odstranitvijo, ki ga zgodovina
  // pove kot prvi dogodek z različico (ali izhodiščno stanje); sklic nanjo seznam izbrisanih ne vsebuje.
  const [resolved, setResolved] = useState<string | null>(from === LATEST ? null : from);
  const ref = from === LATEST ? resolved : from;

  useEffect(() => {
    if (from !== LATEST) return undefined;
    let active = true;
    api.getHistory(group.id, contactId, 0, 25).then(
      (history) => {
        if (!active) return;
        const event = history.items.find((item) => item.hasVersion);
        const next =
          event?.entryId ??
          (history.contact.hasInitial && history.total <= history.items.length ? INITIAL : null);
        if (next === null) setLoad({ kind: 'failed' });
        else setResolved(next);
      },
      (error: unknown) => {
        if (active)
          setLoad({ kind: error instanceof ApiError && error.status === 404 ? 'gone' : 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, contactId, from, reloads]);

  useEffect(() => {
    if (ref === null) return undefined;
    let active = true;
    api.restorePreview(group.id, contactId, ref).then(
      (preview) => {
        if (active) setLoad({ kind: 'ready', preview });
      },
      (error: unknown) => {
        if (!active) return;
        setLoad({ kind: error instanceof ApiError && error.status === 404 ? 'gone' : 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, contactId, ref, reloads]);

  const preview = load.kind === 'ready' ? load.preview : null;
  const name = contactName ?? (preview ? stateName(preview.target.state) : '');
  const when = preview?.target.createdAt ? time(preview.target.createdAt) : null;
  const title =
    ref === INITIAL
      ? t('history.restore.titleInitial', { name })
      : when
        ? t('history.restore.title', { name, time: when })
        : t('history.restore.titleLoading', { name });

  const refresh = () => {
    setAcknowledged(false);
    setLoad({ kind: 'loading' });
    setReloads((n) => n + 1);
  };

  const confirm = async () => {
    if (!preview || busy) return;
    const body = ref === null ? null : requestFor(ref, preview);
    if (!body) {
      setMessage('failed');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.restore(group.id, contactId, body);
      toast(
        ref === INITIAL || !when
          ? t('history.restore.toastInitial')
          : t('history.restore.toast', { time: when }),
      );
      onRestored();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        if (error.code === 'VERSION_CONFLICT') {
          // Kontakt se je medtem spremenil: predogled se osveži s trenutnim stanjem, zgodovina za dialogom tudi.
          setMessage('conflict');
          refresh();
          onConflict?.();
        } else if (error.code === 'GROUP_ARCHIVED') {
          setMessage('archived');
          void reloadGroup();
        } else {
          // RESTORE_NO_CHANGES, RESTORE_NOT_ALLOWED: predogled pokaže razlago.
          setMessage(null);
          refresh();
          onConflict?.();
        }
      } else if (error instanceof ApiError && error.status === 403) {
        setMessage('forbidden');
        void reloadGroup();
      } else if (error instanceof ApiError && error.status === 404) {
        setMessage('gone');
      } else {
        setMessage('failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const explanation =
    preview && !preview.restorable
      ? preview.reason === 'MERGED'
        ? t('history.restore.merged')
        : preview.reason === 'INVALID_STATE'
          ? t('history.restore.invalid')
          : t('history.restore.noChanges')
      : null;
  const duplicated = preview !== null && preview.duplicates.length > 0;
  const canConfirm = preview !== null && preview.restorable && message !== 'archived';

  return (
    <>
      <DialogTitle>{title}</DialogTitle>

      {load.kind === 'loading' && <p role="status">{t('history.restore.loading')}</p>}
      {(load.kind === 'failed' || load.kind === 'gone') && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {load.kind === 'gone' ? t('history.restore.gone') : t('history.restore.loadFailed')}
            {load.kind === 'failed' && (
              <button type="button" className={secondaryButton} onClick={refresh}>
                {t('history.restore.retry')}
              </button>
            )}
          </span>
        </div>
      )}

      {message && (
        <div role="alert" className={message === 'conflict' ? warningAlert : errorAlert}>
          <p className="flex gap-2">
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span className="flex flex-wrap items-center gap-3">
              {t(MESSAGE_KEY[message])}
              {message === 'conflict' && <span>{t('history.restore.conflictHint')}</span>}
              {message === 'failed' && preview && (
                <button type="button" className={secondaryButton} onClick={() => void confirm()}>
                  {t('history.restore.retry')}
                </button>
              )}
            </span>
          </p>
        </div>
      )}

      {preview && (
        <>
          {explanation ? (
            <>
              <p role="note">{explanation}</p>
              {preview.reason === 'INVALID_STATE' && (
                <ul className="flex flex-col gap-1">
                  {preview.violations.map((violation) => (
                    <li key={`${violation.field}:${violation.code}`}>
                      {t(`history.restore.violation.${violationCode(violation.code)}`, {
                        field: t(violationField(violation.field)),
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p>
                {preview.status === 'ACTIVE'
                  ? t('history.restore.text')
                  : t('history.restore.textDeleted')}
              </p>
              <section aria-label={t('history.restore.changes')}>
                <ChangeTable
                  change={{
                    contactId,
                    displayName: name,
                    kind: 'CHANGED',
                    fields: preview.changes,
                  }}
                />
              </section>
            </>
          )}
          {duplicated && preview.restorable && (
            <div role="status" className={warningAlert}>
              <p>{t('history.restore.duplicates')}</p>
              <ul className="flex flex-col gap-1">
                {preview.duplicates.map((duplicate) => (
                  <li key={duplicate.contactId}>
                    <Link
                      to={`/groups/${group.id}/contacts/${duplicate.contactId}`}
                      className={`font-bold text-primary underline underline-offset-4 ${focusRing}`}
                    >
                      {duplicate.displayName}
                    </Link>{' '}
                    – {t(`history.restore.duplicate${duplicate.reason}`)}
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex min-h-11 items-center gap-2 font-bold">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                {t('history.restore.duplicatesConfirm')}
              </label>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <DialogClose ref={cancel} className={secondaryButton}>
          {preview && !preview.restorable
            ? t('history.restore.close')
            : t('history.restore.cancel')}
        </DialogClose>
        {canConfirm && (
          <button
            type="button"
            className={primaryButton}
            disabled={busy || (duplicated && !acknowledged)}
            onClick={() => void confirm()}
          >
            {busy ? t('history.restore.busy') : t('history.restore.confirm')}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Potrditev obnove kontakta (design.md 8.11; FR-015-10 … FR-015-15): predogled sprememb iz `restore-preview`, opozorilo o
 * možnem podvajanju, razlaga za združen kontakt in enako stanje, fokus na *Prekliči*. Konflikt (409 VERSION_CONFLICT)
 * osveži predogled in zgodovino, napaka ostane ob dialogu z *Poskusi znova*. `from` je sklic na različico; `null` zapre.
 */
export function RestoreDialog({
  contactId,
  contactName,
  from,
  onClose,
  onRestored,
  onConflict,
  returnFocus,
}: {
  contactId: string;
  /** Trenutno ime kontakta; sicer ime iz ciljne različice. */
  contactName?: string | null;
  /** Sklic na različico, `LATEST` (zadnja zabeležena različica kontakta) ali `null` (zaprt). */
  from: string | null;
  onClose: () => void;
  /** Obnova je uspela (obvestilo je že prikazano). */
  onRestored: () => void;
  /** Stanje kontakta se je medtem spremenilo: starš naj osveži zgodovino. */
  onConflict?: () => void;
  /** Element, ki je odprl dialog: nanj se vrne fokus ob zaprtju. */
  returnFocus: { current: HTMLElement | null };
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={from !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        {from !== null && (
          <RestoreBody
            key={from}
            contactId={contactId}
            contactName={contactName ?? null}
            from={from}
            cancel={cancel}
            onRestored={onRestored}
            onConflict={onConflict}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

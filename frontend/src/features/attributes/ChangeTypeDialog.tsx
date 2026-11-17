import { IconAlertTriangle } from '@tabler/icons-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/dialog';
import { errorAlert, primaryButton, secondaryButton, warningAlert } from '../../shared/ui/styles';
import { TypeSelect } from '../contacts/typed/TypeSelect';
import { keyConflictCurrent, typeConflictDetails, useAttributesApi } from './api';
import { TypeConflictList } from './TypeConflictList';
import { typeNameKey } from './typeNames';
import type { AttributeKey, AttributeType, TypeConflictDetails } from './types';

type Failure =
  | { kind: 'conflict'; details: TypeConflictDetails }
  | { kind: 'message'; key: MessageKey; warning: boolean; retry: boolean };

type MessageKey =
  | 'attributes.change.versionConflict'
  | 'attributes.change.gone'
  | 'attributes.change.forbidden'
  | 'attributes.change.archived'
  | 'attributes.change.failed'
  | 'groups.offline';

/** Sporočilo za neuspelo spremembo tipa (design.md 8.13): brez tehničnih kod; omrežna napaka = brez povezave. */
function failureFor(error: unknown): Failure {
  const details = typeConflictDetails(error);
  if (details) return { kind: 'conflict', details };
  if (!(error instanceof ApiError)) {
    return { kind: 'message', key: 'groups.offline', warning: false, retry: true };
  }
  if (error.status === 409 && error.code === 'VERSION_CONFLICT') {
    return {
      kind: 'message',
      key: 'attributes.change.versionConflict',
      warning: true,
      retry: false,
    };
  }
  if (error.status === 409 && error.code === 'GROUP_ARCHIVED') {
    return { kind: 'message', key: 'attributes.change.archived', warning: false, retry: false };
  }
  if (error.status === 404) {
    return { kind: 'message', key: 'attributes.change.gone', warning: false, retry: false };
  }
  if (error.status === 403) {
    return { kind: 'message', key: 'attributes.change.forbidden', warning: false, retry: false };
  }
  return { kind: 'message', key: 'attributes.change.failed', warning: false, retry: true };
}

/**
 * Pogovorno okno *Sprememba tipa ključa* (design.md 8.11; FR-016-05, FR-016-27): izbira novega tipa, fokus na
 * *Prekliči*; konflikt z neveljavnimi vrednostmi pokaže seznam kontaktov, zastarela verzija trenutni ključ.
 */
export function ChangeTypeDialog({
  groupId,
  item,
  onClose,
  onChanged,
}: {
  groupId: string;
  item: AttributeKey | null;
  onClose: () => void;
  /** Tip je spremenjen ali je ključ zastarel: seznam se naloži znova. */
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {item && (
        <ChangeTypeContent
          key={`${item.key}-${item.version}`}
          groupId={groupId}
          item={item}
          onClose={onClose}
          onChanged={onChanged}
          label={t('attributes.change.title')}
        />
      )}
    </Dialog>
  );
}

function ChangeTypeContent({
  groupId,
  item,
  onClose,
  onChanged,
  label,
}: {
  groupId: string;
  item: AttributeKey;
  onClose: () => void;
  onChanged: () => void;
  label: string;
}) {
  const { t } = useTranslation();
  const api = useAttributesApi();
  const selectId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [type, setType] = useState<AttributeType>(item.type);
  const [version, setVersion] = useState(item.version);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const typeName = (value: AttributeType) => t(typeNameKey(value));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const saved = await api.changeType(groupId, { key: item.key, type, version });
      toast(
        saved.version === version
          ? t('attributes.change.unchanged', { key: item.key })
          : t('attributes.change.success', { key: item.key }),
      );
      onChanged();
      onClose();
    } catch (error) {
      const next = failureFor(error);
      setFailure(next);
      const current = keyConflictCurrent(error);
      if (current) {
        // Zastarela verzija: pokaži trenutni tip in ga uporabi za nov poskus.
        setVersion(current.version);
        setType(current.type);
        onChanged();
      } else if (next.kind === 'message' && !next.retry) {
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent
      aria-label={label}
      onInteractOutside={(event) => event.preventDefault()}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        cancel.current?.focus();
      }}
    >
      <DialogTitle>{t('attributes.change.title')}</DialogTitle>
      <p>
        {t('attributes.change.body', {
          key: item.key,
          type: typeName(type),
          count: item.contactCount,
        })}
      </p>
      <p>{t('attributes.change.current', { type: typeName(item.type) })}</p>
      <TypeSelect
        id={selectId}
        label={t('attributes.change.newType')}
        value={type}
        onChange={(next) => {
          setType(next);
          setFailure(null);
        }}
      />
      {failure?.kind === 'conflict' && (
        <TypeConflictList
          details={failure.details}
          typeName={typeName(type)}
          groupId={groupId}
          onNavigate={onClose}
          onRetry={() => void submit()}
        />
      )}
      {failure?.kind === 'message' && (
        <div role="alert" className={failure.warning ? warningAlert : errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t(failure.key)}
            {failure.retry && (
              <button type="button" className={secondaryButton} onClick={() => void submit()}>
                {t('attributes.list.retry')}
              </button>
            )}
          </span>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <button ref={cancel} type="button" className={secondaryButton} onClick={onClose}>
          {t('attributes.change.cancel')}
        </button>
        <button
          type="button"
          className={primaryButton}
          disabled={busy}
          onClick={() => void submit()}
        >
          {t('attributes.change.confirm')}
        </button>
      </div>
    </DialogContent>
  );
}

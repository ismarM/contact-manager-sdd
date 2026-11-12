import { IconAlertTriangle } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAuth } from '../../auth/authContext';
import { ApiError } from '../../../shared/api/client';
import { downloadBlob } from '../../../shared/download';
import { errorAlert, secondaryButton } from '../../../shared/ui/styles';
import { useGroup } from '../../groups/groupContext';
import type { FieldRef } from '../contactQuery';
import { SelectionChangedNotice } from '../selection/SelectionChangedNotice';
import { useSelectionCheck } from '../selection/useSelectionCheck';
import { useContactQuery } from '../useContactQuery';
import { type ExportResult, exportContacts } from './api';
import { exportFileName } from './exportFileName';

type Language = 'sl' | 'en';

/** Razvrstitev za strežnik: predefinirano polje ali `attr:‹ključ›` (dobesedni ključ, brez ubežanja iz naslova). */
function sortParam(field: FieldRef): string {
  return typeof field === 'string' ? field : `attr:${field.attribute}`;
}

/**
 * Gumb *Izvozi v Excel* v akcijski vrstici izbora (010, FR-010-01 … FR-010-15): najprej preverjanje izbora (FR-009-18),
 * nato izvoz; datoteko poimenuje odjemalec (R-03). Med delom ima gumb ime »Pripravljam izvoz…« z `aria-disabled`, bralnik
 * zaslona dobi besedilo samo prek enega skritega `status` (R-10). Napake so `alert` s *Poskusi znova*; izbor ostane.
 */
export function ExportButton() {
  const { t, i18n } = useTranslation();
  const { group } = useGroup();
  const { authFetchBlob } = useAuth();
  const { query } = useContactQuery();
  const language: Language = i18n.language.startsWith('en') ? 'en' : 'sl';

  const onSuccess = useCallback(
    (result: ExportResult) => {
      downloadBlob(result.blob, exportFileName(group.title, language, new Date()));
      const done = t('contacts.export.success', { count: result.count });
      toast(
        result.skipped > 0
          ? `${done} ${t('contacts.export.skipped', { count: result.skipped })}`
          : done,
      );
    },
    [group.title, language, t],
  );
  const run = useCallback(
    (ids: string[]) =>
      exportContacts(authFetchBlob, group.id, {
        contactIds: ids,
        sort: sortParam(query.sort),
        dir: query.dir,
        language,
      }),
    [authFetchBlob, group.id, query.sort, query.dir, language],
  );
  const check = useSelectionCheck({ run, onSuccess });

  const failure = check.error === null ? null : failureText(check.error, t);

  return (
    <>
      <button
        type="button"
        className={secondaryButton}
        aria-disabled={check.busy}
        onClick={() => void check.submit()}
      >
        {check.busy ? t('contacts.export.busy') : t('contacts.export.button')}
      </button>
      {check.busy && (
        <p role="status" className="sr-only">
          {t('contacts.export.busy')}
        </p>
      )}
      {check.notice && (
        <div className="basis-full">
          <SelectionChangedNotice
            notice={check.notice}
            removeNoLonger={check.removeNoLonger}
            onRemoveNoLonger={check.setRemoveNoLonger}
            onUpdate={check.updateSelection}
            onContinue={() => void check.continueAnyway()}
            onRemoveMissing={check.removeMissing}
            busy={check.busy}
          />
        </div>
      )}
      {failure !== null && (
        <div role="alert" className={`${errorAlert} basis-full`}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {failure}
            <button type="button" className={secondaryButton} onClick={() => void check.submit()}>
              {t('contacts.export.retry')}
            </button>
          </span>
        </div>
      )}
    </>
  );
}

/** Besedilo napake brez tehničnih kod (FR-010-15; design.md 8.13). */
function failureText(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t('groups.offline');
  if (error.status === 409 && error.code === 'EXPORT_EMPTY') return t('contacts.export.empty');
  if (error.status === 400 && hasFieldCode(error.body, 'TOO_MANY_COLUMNS')) {
    return t('contacts.export.tooManyColumns');
  }
  if (error.status === 400 && hasFieldCode(error.body, 'TOO_MANY')) {
    return t('contacts.export.tooMany');
  }
  return t('contacts.export.failed');
}

function hasFieldCode(body: unknown, code: string): boolean {
  if (!body || typeof body !== 'object' || !('errors' in body) || !Array.isArray(body.errors)) {
    return false;
  }
  return body.errors.some(
    (item: unknown) =>
      !!item &&
      typeof item === 'object' &&
      'field' in item &&
      item.field === 'contactIds' &&
      'code' in item &&
      item.code === code,
  );
}

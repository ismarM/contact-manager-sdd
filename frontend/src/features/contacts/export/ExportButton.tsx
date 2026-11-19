import { IconAlertTriangle, IconChevronDown, IconFileExport } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAuth } from '../../auth/authContext';
import { ApiError } from '../../../shared/api/client';
import { downloadBlob } from '../../../shared/download';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../shared/ui/dropdown-menu';
import { errorAlert, secondaryButton } from '../../../shared/ui/styles';
import { useGroup } from '../../groups/groupContext';
import type { FieldRef } from '../contactQuery';
import { SelectionChangedNotice } from '../selection/SelectionChangedNotice';
import { useSelectionCheck } from '../selection/useSelectionCheck';
import { useContactQuery } from '../useContactQuery';
import { type ExportResult, exportContacts, exportVcard } from './api';
import { exportFileName } from './exportFileName';
import type { ExportFormat } from './ExportMenu';

type Language = 'sl' | 'en';

/** Razvrstitev za strežnik: predefinirano polje ali `attr:‹ključ›` (dobesedni ključ, brez ubežanja iz naslova). */
function sortParam(field: FieldRef): string {
  return typeof field === 'string' ? field : `attr:${field.attribute}`;
}

/**
 * Izvoz izbranih kontaktov v Excel ali vizitke (010, FR-010-01 … FR-010-15): najprej preverjanje izbora (FR-009-18),
 * nato izvoz; datoteko poimenuje odjemalec (R-03). Uporabljata ga gumb {@link ExportButton} (od 1280 px) in meni
 * {@link SelectionExportMenu} (ožji zasloni); obvestila in napake izriše {@link ExportFeedback}.
 */
export function useSelectionExport(format: ExportFormat) {
  const { t, i18n } = useTranslation();
  const { group } = useGroup();
  const { authFetchBlob } = useAuth();
  const { query } = useContactQuery();
  const language: Language = i18n.language.startsWith('en') ? 'en' : 'sl';

  const onSuccess = useCallback(
    (result: ExportResult) => {
      downloadBlob(result.blob, exportFileName(group.title, language, new Date(), format));
      const done = t('contacts.export.success', { count: result.count });
      toast.success(
        result.skipped > 0
          ? `${done} ${t('contacts.export.skipped', { count: result.skipped })}`
          : done,
      );
    },
    [group.title, language, t, format],
  );
  const run = useCallback(
    (ids: string[]) =>
      (format === 'vcf' ? exportVcard : exportContacts)(authFetchBlob, group.id, {
        contactIds: ids,
        sort: sortParam(query.sort),
        dir: query.dir,
        language,
      }),
    [authFetchBlob, group.id, query.sort, query.dir, language, format],
  );
  const check = useSelectionCheck({ run, onSuccess });
  return {
    format,
    check,
    busyText: t(format === 'vcf' ? 'contacts.vcard.busy' : 'contacts.export.busy'),
  };
}

export type SelectionExport = ReturnType<typeof useSelectionExport>;

/**
 * Gumb *Izvozi v Excel* ali *Izvozi v vCard (.vcf)* v akcijski vrstici izbora. Med delom ima ime »Pripravljam izvoz…« z
 * `aria-disabled`, bralnik zaslona dobi besedilo samo prek enega skritega `status` (R-10, {@link ExportFeedback}).
 */
export function ExportButton({
  exporter,
  className = '',
}: {
  exporter: SelectionExport;
  className?: string;
}) {
  const { t } = useTranslation();
  const { check, format, busyText } = exporter;
  return (
    <button
      type="button"
      className={`${secondaryButton} ${className}`}
      aria-disabled={check.busy}
      onClick={() => void check.submit()}
    >
      {check.busy
        ? busyText
        : t(format === 'vcf' ? 'contacts.vcard.selection' : 'contacts.export.button')}
    </button>
  );
}

/**
 * Meni *Izvozi* v akcijski vrstici izbora na ožjih zaslonih: oba izvoza v enem gumbu, enako preverjanje izbora.
 */
export function SelectionExportMenu({
  xlsx,
  vcf,
  className = '',
}: {
  xlsx: SelectionExport;
  vcf: SelectionExport;
  className?: string;
}) {
  const { t } = useTranslation();
  // Med izvozom ostane ime menija enako (stanje sporoči skriti `status`), da je »Pripravljam izvoz…« en sam gumb.
  const busy = xlsx.check.busy || vcf.check.busy;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={`${secondaryButton} aria-disabled:cursor-wait aria-disabled:opacity-70 ${className}`}
        aria-disabled={busy}
      >
        <IconFileExport aria-hidden="true" size={20} stroke={1.75} />
        {t('contacts.exportMenu.button')}
        <IconChevronDown aria-hidden="true" size={16} stroke={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={busy} onSelect={() => void xlsx.check.submit()}>
          {t('contacts.exportMenu.xlsx')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => void vcf.check.submit()}>
          {t('contacts.exportMenu.vcf')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Skrito stanje med izvozom, obvestilo o spremenjenem izboru in napaka s *Poskusi znova*; čez vso širino vrstice. */
export function ExportFeedback({
  exporter,
  className = '',
}: {
  exporter: SelectionExport;
  className?: string;
}) {
  const { t } = useTranslation();
  const { check, busyText } = exporter;
  const failure = check.error === null ? null : failureText(check.error, t);
  return (
    <>
      {check.busy && (
        <p role="status" className="sr-only">
          {busyText}
        </p>
      )}
      {check.notice && (
        <div className={`col-span-full basis-full ${className}`}>
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
        <div role="alert" className={`${errorAlert} col-span-full basis-full ${className}`}>
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
export function failureText(error: unknown, t: TFunction): string {
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

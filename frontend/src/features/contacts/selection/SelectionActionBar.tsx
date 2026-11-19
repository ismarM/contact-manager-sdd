import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { ghostButton, primaryButton, secondaryButton } from '../../../shared/ui/styles';
import { useGroup } from '../../groups/groupContext';
import { canEditContacts } from '../contactRouting';
import {
  ExportButton,
  ExportFeedback,
  SelectionExportMenu,
  useSelectionExport,
} from '../export/ExportButton';
import { useSelectionApi } from './api';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { BulkEditDialog } from './BulkEditDialog';
import { type SelectionParams } from './selection';
import { useSelection } from './selectionContext';

/** Sporočilo pod akcijsko vrstico (FR-009-04, FR-009-17): meja 10 000 ali neuspeh nalaganja zadetkov. */
export type SelectionNotice = 'limit' | 'loadFailed';

/**
 * Akcijska vrstica izbora (FR-009-05; design.md 8.8, D-72): `toolbar` »Dejanja izbora« namesto vrstice z *Nov kontakt*,
 * dokler je kaj izbrano. Vsak član vidi število izbranih, *Izberi vse zadetke (N)* in *Počisti izbor*; *Uredi izbrane* in
 * *Izbriši* samo urednik in više v nearhivirani skupini; izvoz (010, 012) za vse člane. Število je območje
 * `aria-live="polite"`; pod 640 px je vrstica prilepljena na spodnji rob.
 */
export function SelectionActionBar({
  total,
  params,
  onNotice,
  onClear,
  onChanged,
  onDeleted,
}: {
  /** Število zadetkov trenutnega iskanja in filtrov (`null`, dokler seznam ni odgovoril). */
  total: number | null;
  /** Iskanje in filtri, ki so veljali ob kliku (zadnja poizvedba seznama). */
  params: () => SelectionParams;
  onNotice: (notice: SelectionNotice | null) => void;
  onClear: () => void;
  /** Množično urejanje je uspelo: seznam se osveži, izbor ostane. */
  onChanged: () => void;
  /** Množični izbris je uspel: seznam se osveži, izbor je prazen. */
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const api = useSelectionApi();
  const { group } = useGroup();
  const selection = useSelection();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const [loading, setLoading] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  // Pod 640 px je vrstica `fixed`; višino (ki se ob več vrsticah gumbov spreminja) objavimo kot spremenljivko, da seznam
  // dobi dovolj spodnjega odmika in vrstica ne pokrije paginacije (SC-005).
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return undefined;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty('--selection-bar-height', `${element.offsetHeight + 16}px`);
    publish();
    if (typeof ResizeObserver === 'undefined')
      return () => root.style.removeProperty('--selection-bar-height');
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--selection-bar-height');
    };
  }, []);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const xlsx = useSelectionExport('xlsx');
  const vcf = useSelectionExport('vcf');
  const editable = canEditContacts(group);

  /** Zapre dialog in takoj vrne fokus na gumb, ki ga je odprl (design.md 8.10); gumba morda ni več (vloga, arhiv). */
  const close = (button: RefObject<HTMLButtonElement | null>) => {
    flushSync(() => setDialog(null));
    button.current?.focus();
  };

  const selectAllResults = async () => {
    if (loading) return;
    setLoading(true);
    onNotice(null);
    try {
      const matched = params();
      const result = await api.contactIds(group.id, matched);
      if (result.truncated || result.total > 10_000) {
        onNotice('limit');
      } else if (selection.addMatches(matched, result.ids) === 'limit') {
        onNotice('limit');
      }
    } catch {
      onNotice('loadFailed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/*
        Pod 1280 px mreža z enako širokimi gumbi in vrsticami po pomenu: število in *Počisti izbor*, *Izberi vse zadetke*,
        nato dejanja (*Uredi izbrane*, *Izbriši*, en meni *Izvozi*). Od 1280 px ena vrstica z ločenima gumboma izvoza.
      */}
      <div
        ref={bar}
        role="toolbar"
        aria-label={t('contacts.selection.toolbar')}
        className="fixed inset-x-0 bottom-[calc(var(--k-bottom-bar-h)_+_env(safe-area-inset-bottom))] z-20 grid grid-cols-2 items-center gap-3 border-t border-border bg-popover p-3 shadow-md sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[36rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:grid-cols-6 sm:rounded-lg sm:border xl:flex xl:w-max xl:flex-wrap"
      >
        <p
          role="status"
          aria-live="polite"
          className="justify-self-start rounded-full bg-selected px-3 py-1 font-bold text-primary max-xl:order-1 sm:col-span-3"
        >
          {t('contacts.selection.count', { count: selection.count })}
        </p>
        {total !== null && (
          <button
            type="button"
            className={`${secondaryButton} col-span-2 max-xl:order-3 sm:col-span-6`}
            aria-disabled={loading}
            onClick={() => void selectAllResults()}
          >
            {t('contacts.selection.selectAllResults', { total })}
          </button>
        )}
        {editable && (
          <>
            <button
              ref={editButton}
              type="button"
              className={`${primaryButton} max-xl:order-4 sm:col-span-2`}
              onClick={() => setDialog('edit')}
            >
              {t('contacts.selection.edit')}
            </button>
            <button
              ref={deleteButton}
              type="button"
              className={`${secondaryButton} text-destructive max-xl:order-5 sm:col-span-2`}
              onClick={() => setDialog('delete')}
            >
              {t('contacts.selection.delete')}
            </button>
          </>
        )}
        <ExportButton exporter={xlsx} className="max-xl:hidden" />
        <ExportButton exporter={vcf} className="max-xl:hidden" />
        <SelectionExportMenu
          xlsx={xlsx}
          vcf={vcf}
          className={`col-span-2 max-xl:order-6 xl:hidden ${editable ? 'sm:col-span-2' : 'sm:col-span-6'}`}
        />
        <button
          type="button"
          className={`${ghostButton} justify-self-end max-xl:order-2 sm:col-span-3 xl:ml-auto`}
          onClick={onClear}
        >
          {t('contacts.selection.clear')}
        </button>
        <ExportFeedback exporter={xlsx} className="max-xl:order-7" />
        <ExportFeedback exporter={vcf} className="max-xl:order-7" />
      </div>
      {dialog === 'edit' && (
        <BulkEditDialog
          onClose={() => close(editButton)}
          onApplied={() => {
            close(editButton);
            onChanged();
          }}
        />
      )}
      {dialog === 'delete' && (
        <BulkDeleteDialog
          onClose={() => close(deleteButton)}
          onDeleted={() => {
            setDialog(null);
            onDeleted();
          }}
        />
      )}
    </>
  );
}

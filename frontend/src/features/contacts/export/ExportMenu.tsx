import { IconChevronDown, IconFileExport } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAuth } from '../../auth/authContext';
import { downloadBlob } from '../../../shared/download';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../shared/ui/dropdown-menu';
import { secondaryButton } from '../../../shared/ui/styles';
import { useGroup } from '../../groups/groupContext';
import { selectionParams, useSelectionApi } from '../selection/api';
import { useContactQuery } from '../useContactQuery';
import { exportContacts, exportVcard } from './api';
import { failureText } from './ExportButton';
import { exportFileName } from './exportFileName';

export type ExportFormat = 'xlsx' | 'vcf';

/**
 * Izvoz vseh kontaktov, ki ustrezajo trenutnemu iskanju in filtrom, v Excel ali vizitke; razvrstitev je enaka seznamu.
 * Uporabljata ga meni *Izvozi* (od 1280 px) in meni *Dejanja* (ožji zasloni).
 */
export function useExportAll() {
  const { t, i18n } = useTranslation();
  const { group } = useGroup();
  const { authFetchBlob } = useAuth();
  const selectionApi = useSelectionApi();
  const { query } = useContactQuery();
  const [busy, setBusy] = useState(false);
  const language = i18n.language.startsWith('en') ? 'en' : 'sl';

  const run = async (format: ExportFormat) => {
    if (busy) return;
    setBusy(true);
    try {
      const { ids, truncated } = await selectionApi.contactIds(group.id, selectionParams(query));
      if (truncated) {
        toast.error(t('contacts.export.tooMany'));
        return;
      }
      if (ids.length === 0) {
        toast.error(t('contacts.exportMenu.empty'));
        return;
      }
      const sort = typeof query.sort === 'string' ? query.sort : `attr:${query.sort.attribute}`;
      const result = await (format === 'vcf' ? exportVcard : exportContacts)(
        authFetchBlob,
        group.id,
        { contactIds: ids, sort, dir: query.dir, language },
      );
      downloadBlob(result.blob, exportFileName(group.title, language, new Date(), format));
      toast.success(t('contacts.export.success', { count: result.count }));
    } catch (error) {
      toast.error(failureText(error, t));
    } finally {
      setBusy(false);
    }
  };

  return { busy, run };
}

/** Skrito sporočilo za bralnik zaslona med pripravo izvoza. */
export function ExportBusyStatus({ busy }: { busy: boolean }) {
  const { t } = useTranslation();
  return busy ? (
    <p role="status" className="sr-only">
      {t('contacts.export.busy')}
    </p>
  ) : null;
}

/**
 * Meni *Izvozi* na seznamu kontaktov (ob *Uvozi*, od 1280 px): izvoz vseh zadetkov trenutne poizvedbe. Na voljo vsem
 * članom, tudi v arhivirani skupini.
 */
export function ExportMenu({ exporter }: { exporter: ReturnType<typeof useExportAll> }) {
  const { t } = useTranslation();
  const { busy, run } = exporter;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={secondaryButton} aria-disabled={busy}>
        <IconFileExport aria-hidden="true" size={20} stroke={1.75} />
        {busy ? t('contacts.export.busy') : t('contacts.exportMenu.button')}
        <IconChevronDown aria-hidden="true" size={16} stroke={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run('xlsx')}>
          {t('contacts.exportMenu.xlsx')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('vcf')}>
          {t('contacts.exportMenu.vcf')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

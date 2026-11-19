import { IconDots, IconPlus, IconQrcode } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';
import { primaryButton, secondaryButton } from '../../shared/ui/styles';
import { ImportMenu } from '../import/ImportMenu';
import { ExportBusyStatus, ExportMenu, useExportAll } from './export/ExportMenu';
import { QrScanDialog } from './qr/QrScanDialog';

/**
 * Dejanja seznama kontaktov. Od 1280 px ločeni gumbi *Uvozi*, *Izvozi*, *Dodaj s kodo QR* in *Nov kontakt*; na ožjih
 * zaslonih *Nov kontakt* in en meni *Dejanja* z uvozom, izvozom in kodo QR. Uvoz, koda QR in nov kontakt samo za urednike; izvoz za vse člane, kadar so kontakti.
 */
export function ContactListActions({
  base,
  link,
  editable,
  hasContacts,
}: {
  base: string;
  link: string;
  editable: boolean;
  hasContacts: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const exporter = useExportAll();
  const [qrOpen, setQrOpen] = useState(false);

  const newContact = editable && hasContacts && (
    <Link to={`${base}/new${link}`} className={primaryButton}>
      <IconPlus aria-hidden="true" size={20} stroke={1.75} />
      {t('contacts.newContact')}
    </Link>
  );

  return (
    // Pod 1280 px enako široka stolpca (*Dejanja*, *Nov kontakt*); na telefonu čez vso širino, poravnana z orodno vrstico.
    <div className="grid auto-cols-fr grid-flow-col gap-3 max-sm:w-full xl:flex xl:flex-wrap xl:items-center">
      <div className="hidden flex-wrap items-center gap-3 xl:flex">
        {editable && <ImportMenu base={base} />}
        {hasContacts && <ExportMenu exporter={exporter} />}
        {editable && (
          <button type="button" className={secondaryButton} onClick={() => setQrOpen(true)}>
            <IconQrcode aria-hidden="true" size={20} stroke={1.75} />
            {t('contacts.qrScan.button')}
          </button>
        )}
      </div>

      <div className="contents xl:hidden">
        {(editable || hasContacts) && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className={secondaryButton} aria-disabled={exporter.busy}>
              <IconDots aria-hidden="true" size={20} stroke={1.75} />
              {t('contacts.actionsMenu.button')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {editable && (
                <>
                  <DropdownMenuItem onSelect={() => void navigate(`${base}/import?source=xlsx`)}>
                    {t('contacts.actionsMenu.importXlsx')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void navigate(`${base}/import?source=vcf`)}>
                    {t('contacts.actionsMenu.importVcf')}
                  </DropdownMenuItem>
                </>
              )}
              {hasContacts && (
                <>
                  {editable && <DropdownMenuSeparator />}
                  <DropdownMenuItem onSelect={() => void exporter.run('xlsx')}>
                    {t('contacts.actionsMenu.exportXlsx')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exporter.run('vcf')}>
                    {t('contacts.actionsMenu.exportVcf')}
                  </DropdownMenuItem>
                </>
              )}
              {editable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setQrOpen(true)}>
                    {t('contacts.qrScan.button')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {newContact}
      <ExportBusyStatus busy={exporter.busy} />
      {editable && <QrScanDialog open={qrOpen} onOpenChange={setQrOpen} />}
    </div>
  );
}

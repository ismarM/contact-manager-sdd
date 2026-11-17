import { IconQrcode } from '@tabler/icons-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { downloadBlob } from '../../../shared/download';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../../shared/ui/dialog';
import {
  errorAlert,
  ghostButton,
  primaryButton,
  secondaryButton,
  softButton,
  warningAlert,
} from '../../../shared/ui/styles';
import { fileNameTitle } from '../export/exportFileName';
import type { ContactDetail } from '../types';
import { useUiLanguage } from '../useUiLanguage';
import { type QrField, qrContent } from './qrFit';

/**
 * Žetona design.md 4.1 v svetli temi (`--k-text`, `--k-surface`): koda je vedno temna na svetlem, tudi v temni temi,
 * da jo kamere zanesljivo preberejo.
 */
const QR_DARK = '#1C1B19';
const QR_LIGHT = '#FFFFFF';

/** Ime datoteke enega kontakta po pravilu FR-010-10: `‹ime-priimek›`. */
export function contactFileName(
  contact: Pick<ContactDetail, 'firstName' | 'lastName'>,
  language: 'sl' | 'en',
) {
  return fileNameTitle([contact.firstName, contact.lastName].filter(Boolean).join(' '), language);
}

/**
 * *Deli s kodo QR* (FR-014-14 … -16; design.md 8.10): koda s celotno vizitko (ali brez polj po prednosti), opozorilo o
 * vidnosti, seznam vključenih in izpuščenih polj, *Prenesi sliko* in *Zapri*. Koda nastane v brskalniku (deluje brez
 * povezave); pri izpuščenih poljih ponudi prenos celotne vizitke.
 */
export function QrShareDialog({
  contact,
  onDownloadVcard,
}: {
  contact: ContactDetail;
  onDownloadVcard: () => void;
}) {
  const { t } = useTranslation();
  const language = useUiLanguage();
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const content = useMemo(() => qrContent(contact, language), [contact, language]);
  const name = contact.displayName;

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    QRCode.toString(content.text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 4,
      color: { dark: QR_DARK, light: QR_LIGHT },
    }).then(
      (svg) => {
        if (active) setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [open, content.text]);

  const fields = (list: QrField[]) =>
    list.map((field) => t(`contacts.qrShare.fields.${field}`)).join(', ');

  const download = async () => {
    try {
      const url = await QRCode.toDataURL(content.text, {
        errorCorrectionLevel: 'M',
        margin: 4,
        width: 640,
        color: { dark: QR_DARK, light: QR_LIGHT },
      });
      downloadBlob(dataUrlToBlob(url), `${contactFileName(contact, language)}-qr.png`);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={softButton}>
        <IconQrcode aria-hidden="true" size={20} stroke={1.75} />
        {t('contacts.qrShare.button')}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t('contacts.qrShare.title', { name })}</DialogTitle>
        <p role="note" className={warningAlert}>
          {t('contacts.qrShare.warning')}
        </p>
        {failed && (
          <p role="alert" className={errorAlert}>
            {t('contacts.qrShare.failed')}
          </p>
        )}
        {image && (
          <img
            src={image}
            alt={t('contacts.qrShare.alt', { name })}
            width={320}
            height={320}
            className="mx-auto size-auto max-w-full rounded-md"
          />
        )}
        <p>{t('contacts.qrShare.included', { fields: fields(content.included) })}</p>
        {content.omitted.length > 0 && (
          <p>{t('contacts.qrShare.omitted', { fields: fields(content.omitted) })}</p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={primaryButton}
            disabled={!image}
            onClick={() => void download()}
          >
            {t('contacts.qrShare.download')}
          </button>
          {content.omitted.length > 0 && (
            <button type="button" className={secondaryButton} onClick={onDownloadVcard}>
              {t('contacts.vcard.download')}
            </button>
          )}
          <DialogClose className={ghostButton}>{t('contacts.qrShare.close')}</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function dataUrlToBlob(url: string): Blob {
  const data = url.slice(url.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

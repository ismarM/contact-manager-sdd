import { IconAlertTriangle, IconMinus, IconPlus } from '@tabler/icons-react';
import { type ChangeEvent, type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogClose, DialogContent, DialogTitle } from '../ui/dialog';
import { errorAlert, focusRing, primaryButton, secondaryButton } from '../ui/styles';
import { CropCanvas, type CropShape, FRAME } from './CropCanvas';
import { clampCrop, type CropState, INITIAL_CROP, MAX_ZOOM, MIN_ZOOM } from './cropMath';
import { type DecodedImage, decodeImage, exportCrop } from './imageExport';
import { imageErrorCode } from './imageApi';
import type { ImageErrorCode } from './photoTypes';

const ZOOM_STEP = 0.1;
/** Napake vsebine: ponovitev nima smisla z isto datoteko, zato *Poskusi znova* vrne na izbiro datoteke. */
const CONTENT_ERRORS: ImageErrorCode[] = ['INVALID_IMAGE', 'IMAGE_TOO_LARGE', 'FILE_TOO_LARGE'];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Okrogel okvir (uporabnik, kontakt) ali kvadraten (skupina). */
  shape: CropShape;
  /** Naslov dialoga; privzeto »Slika«. */
  title?: string;
  /** Naloži obrezano sliko; zavrnitev z `ApiError` prikaže trajno napako. Ob uspehu dialog zapre klicatelj. */
  onUpload: (file: Blob) => Promise<void>;
}

type Step = 'choose' | 'reading' | 'crop';

function UploadBody({ shape, title, onUpload }: Pick<Props, 'shape' | 'title' | 'onUpload'>) {
  const { t } = useTranslation();
  const fileId = useId();
  const zoomId = useId();
  const [step, setStep] = useState<Step>('choose');
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [crop, setCrop] = useState<CropState>(INITIAL_CROP);
  const [failure, setFailure] = useState<ImageErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  /** Že obrezana datoteka, ki je ob omrežni napaki ni treba znova obrezati. */
  const pending = useRef<Blob | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => () => image?.close(), [image]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFailure(null);
    setStep('reading');
    try {
      const decoded = await decodeImage(file);
      if (!alive.current) {
        decoded.close();
        return;
      }
      pending.current = null;
      setImage(decoded);
      setCrop(INITIAL_CROP);
      setStep('crop');
    } catch {
      if (!alive.current) return;
      setFailure('INVALID_IMAGE');
      setStep('choose');
    }
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    void pick(file);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void pick(event.dataTransfer.files[0]);
  };

  const save = async () => {
    if (busy || !image) return;
    setBusy(true);
    setFailure(null);
    try {
      pending.current ??= await exportCrop(image, crop, FRAME);
      await onUpload(pending.current);
    } catch (error) {
      if (alive.current) setFailure(imageErrorCode(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const retry = () => {
    if (failure && CONTENT_ERRORS.includes(failure)) {
      pending.current = null;
      setFailure(null);
      setStep('choose');
    } else {
      void save();
    }
  };

  const zoomBy = (delta: number) => {
    const next = clampCrop(
      { ...crop, zoom: crop.zoom + delta },
      image ?? { width: 1, height: 1 },
      FRAME,
    );
    setCrop(next);
    setAnnouncement(t('images.dialog.zoomValue', { percent: Math.round(next.zoom * 100) }));
  };
  const zoomTo = (zoom: number) => {
    setCrop(clampCrop({ ...crop, zoom }, image ?? { width: 1, height: 1 }, FRAME));
    setAnnouncement(t('images.dialog.zoomValue', { percent: Math.round(zoom * 100) }));
  };
  const changeCrop = (next: CropState) => {
    pending.current = null;
    setCrop(next);
  };

  const iconButton = `${secondaryButton} w-11 px-0 pointer-coarse:w-12`;

  return (
    <DialogContent
      wide
      onInteractOutside={(event) => event.preventDefault()}
      onOpenAutoFocus={(event) => {
        // Fokus na izbiro datoteke (ne na *Prekliči*).
        event.preventDefault();
        document.getElementById(fileId)?.focus();
      }}
    >
      <DialogTitle>{title ?? t('images.dialog.title')}</DialogTitle>

      {step !== 'crop' && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-6 text-center ${
            dragging ? 'border-ring bg-selected' : 'border-border'
          }`}
        >
          <input
            id={fileId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileInput}
            className="peer sr-only"
          />
          <label
            htmlFor={fileId}
            className={`${secondaryButton} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring`}
          >
            {t('images.dialog.choose')}
          </label>
          <p className="text-muted-foreground">
            {dragging ? t('images.dialog.dropActive') : t('images.dialog.dropHint')}
          </p>
          {step === 'reading' && <p role="status">{t('images.dialog.loading')}</p>}
        </div>
      )}

      {step === 'crop' && image && (
        <>
          <CropCanvas
            image={image}
            shape={shape}
            crop={crop}
            onCropChange={changeCrop}
            onAnnounce={setAnnouncement}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={iconButton}
              aria-label={t('images.dialog.zoomOut')}
              onClick={() => zoomBy(-ZOOM_STEP)}
            >
              <IconMinus aria-hidden="true" size={20} stroke={1.75} />
            </button>
            <input
              id={zoomId}
              type="range"
              aria-label={t('images.dialog.zoom')}
              aria-valuetext={t('images.dialog.zoomValue', {
                percent: Math.round(crop.zoom * 100),
              })}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={crop.zoom}
              onChange={(event) => zoomTo(Number(event.target.value))}
              className={`h-11 min-w-0 flex-1 accent-primary ${focusRing}`}
            />
            <button
              type="button"
              className={iconButton}
              aria-label={t('images.dialog.zoomIn')}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <IconPlus aria-hidden="true" size={20} stroke={1.75} />
            </button>
          </div>
        </>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {busy && <p role="status">{t('images.dialog.saving')}</p>}
      {failure && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <div className="flex flex-col items-start gap-2">
            <span>{t(`images.errors.${failure}`)}</span>
            {(step === 'crop' || failure !== 'INVALID_IMAGE') && (
              <button type="button" className={secondaryButton} onClick={retry}>
                {t('images.dialog.retry')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <DialogClose className={secondaryButton}>{t('images.dialog.cancel')}</DialogClose>
        {step === 'crop' && (
          <button
            type="button"
            className={primaryButton}
            aria-disabled={busy}
            aria-busy={busy}
            onClick={() => void save()}
          >
            {busy ? t('images.dialog.saving') : t('images.dialog.save')}
          </button>
        )}
      </div>
    </DialogContent>
  );
}

/**
 * Nalaganje slike (design.md 8.10, 8.13; FR-018-01, -04, -14): izbira ali povleci in spusti, predogled z obrezovanjem,
 * izvoz JPEG/PNG ≤ 1024 točk, napredek in trajne napake z *Poskusi znova*. Dokler nalaganje ne uspe, stara slika ostane.
 * Stanje živi samo, dokler je dialog odprt.
 */
export function ImageUploadDialog({ open, onClose, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <UploadBody {...rest} />}
    </Dialog>
  );
}

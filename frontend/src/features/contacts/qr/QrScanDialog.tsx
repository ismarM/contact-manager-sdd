import { IconQrcode } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Dialog, DialogClose, DialogContent, DialogTitle } from '../../../shared/ui/dialog';
import { errorAlert, focusRing, secondaryButton } from '../../../shared/ui/styles';
import { useGroup } from '../../groups/groupContext';
import { useUiLanguage } from '../useUiLanguage';
import { createDetector, type QrDetector, scanResult, stopStream } from './scanner';
import type { CardCandidate } from './vcardTypes';

const MAX_IMAGE = 10 * 1024 * 1024;

function cameraSupported(): boolean {
  const media = navigator.mediaDevices as MediaDevices | undefined;
  return media !== undefined && 'getUserMedia' in media;
}

/** Stanje usmerjevalnika, s katerim obrazec *Nov kontakt* dobi podatke iz kode QR (FR-014-18). */
export interface QrPrefillState {
  qrCandidate: CardCandidate;
}

type Problem = 'noCode' | 'manyCodes' | 'tooLarge' | null;

/**
 * *Dodaj s kodo QR* (FR-014-17 … -20; design.md 8.10): kamera ob odprtju okna (odprtje je dotik uporabnika), sicer ali na
 * zahtevo izbira slike; po prvi kodi s kontaktom se kamera ustavi in odpre se predizpolnjen obrazec *Nov kontakt*.
 * Kamera se ustavi tudi ob zaprtju okna in odhodu s strani; slike se ne pošiljajo na strežnik.
 */
export function QrScanDialog() {
  const { t } = useTranslation();
  const { group } = useGroup();
  const navigate = useNavigate();
  const language = useUiLanguage();
  const [open, setOpen] = useState(false);
  const [camera, setCamera] = useState<'starting' | 'on' | 'unavailable'>('starting');
  const [problem, setProblem] = useState<Problem>(null);
  const [reading, setReading] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const detector = useRef<QrDetector | null>(null);
  const imageId = useId();

  const stop = useCallback(() => {
    stopStream(stream.current);
    stream.current = null;
  }, []);

  const found = useCallback(
    (candidate: CardCandidate) => {
      stop();
      setOpen(false);
      const state: QrPrefillState = { qrCandidate: candidate };
      void navigate(`/groups/${group.id}/contacts/new`, { state });
    },
    [group.id, navigate, stop],
  );

  const detectorOnce = useCallback(async () => {
    detector.current ??= await createDetector();
    return detector.current;
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const media = navigator.mediaDevices as MediaDevices | undefined;
    if (!media || !cameraSupported()) return undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    media.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(
      (granted) => {
        if (!active) {
          stopStream(granted);
          return;
        }
        stream.current = granted;
        if (video.current) {
          video.current.srcObject = granted;
          // jsdom in nekateri brskalniki ne vrnejo obljube.
          void Promise.resolve(video.current.play()).catch(() => undefined);
        }
        setCamera('on');
        const scan = async () => {
          if (!active) return;
          try {
            const reader = await detectorOnce();
            if (video.current && video.current.readyState >= 2) {
              const result = scanResult(await reader.detect(video.current), language);
              if (result.kind === 'contact' && active) {
                found(result.candidate);
                return;
              }
            }
          } catch {
            // zaporedni poskusi
          }
          timer = setTimeout(() => void scan(), 250);
        };
        void scan();
      },
      () => {
        if (active) setCamera('unavailable');
      },
    );
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [open, detectorOnce, found, language, stop]);

  const readImage = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (file.size > MAX_IMAGE) {
      setProblem('tooLarge');
      return;
    }
    setReading(true);
    try {
      const reader = await detectorOnce();
      const bitmap = await createImageBitmap(file);
      const result = scanResult(await reader.detect(bitmap), language);
      if (result.kind === 'contact') found(result.candidate);
      else setProblem(result.kind === 'many' ? 'manyCodes' : 'noCode');
    } catch {
      setProblem('noCode');
    } finally {
      setReading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stop();
        setOpen(next);
      }}
    >
      <button
        type="button"
        className={secondaryButton}
        onClick={() => {
          setCamera('starting');
          setProblem(null);
          setOpen(true);
        }}
      >
        <IconQrcode aria-hidden="true" size={20} stroke={1.75} />
        {t('contacts.qrScan.button')}
      </button>
      <DialogContent>
        <DialogTitle>{t('contacts.qrScan.title')}</DialogTitle>
        {camera === 'unavailable' || !cameraSupported() ? (
          <p role="status">{t('contacts.qrScan.noCamera')}</p>
        ) : (
          <>
            <p role="status">{t('contacts.qrScan.instruction')}</p>
            <video
              ref={video}
              aria-label={t('contacts.qrScan.video')}
              playsInline
              muted
              autoPlay
              className="aspect-square w-full rounded-md bg-muted object-cover"
            />
          </>
        )}
        {problem && (
          <p role="alert" className={errorAlert}>
            {t(`contacts.qrScan.${problem}`)}
          </p>
        )}
        {reading && <p role="status">{t('contacts.qrScan.reading')}</p>}
        <div className="flex flex-wrap gap-3">
          <div>
            <input
              id={imageId}
              type="file"
              accept="image/png,image/jpeg"
              className={`peer sr-only ${focusRing}`}
              onChange={(event) => {
                void readImage(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <label
              htmlFor={imageId}
              className={`${secondaryButton} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring`}
            >
              {t('contacts.qrScan.pickImage')}
            </label>
          </div>
          <DialogClose className={secondaryButton}>{t('contacts.qrScan.close')}</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

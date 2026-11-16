import { type KeyboardEvent, type PointerEvent, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { focusRing } from '../ui/styles';
import { clampCrop, type CropState, INITIAL_CROP, placement } from './cropMath';
import type { DecodedImage } from './imageExport';

/** Stranica okvirja v CSS točkah: 360 px zaslon − odmik 2 × 16 px − notranji odmik dialoga 2 × 24 px. */
export const FRAME = 280;
const STEP = 10;
const BIG_STEP = 40;
const ZOOM_STEP = 0.1;
/** Zatemnitev zunaj okvirja (design.md 8.10: enaka kot ozadje dialoga). */
const DIM = 'rgb(0 0 0 / 0.4)';

export type CropShape = 'circle' | 'square';

interface Props {
  image: DecodedImage;
  shape: CropShape;
  crop: CropState;
  onCropChange: (crop: CropState) => void;
  /** Sporočilo za bralnik zaslona (`aria-live` ima nadrejeni dialog). */
  onAnnounce: (message: string) => void;
}

/**
 * Platno z obrezovanjem (design.md 8.10): premik s povleko ali s puščicami (premik 10 točk, Shift 40), povečava s
 * `+`/`−`, `Home` ponastavi. Okvir je okrogel (uporabnik, kontakt) ali kvadraten (skupina).
 */
export function CropCanvas({ image, shape, crop, onCropChange, onAnnounce }: Props) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const group = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const drag = useRef<{ pointer: number; x: number; y: number; origin: CropState } | null>(null);
  const size = { width: image.width, height: image.height };

  // Po izbiri datoteke fokus preide na obrezovanje (izbira datoteke izgine).
  useEffect(() => group.current?.focus(), []);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = FRAME * ratio;
    element.height = FRAME * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, FRAME, FRAME);
    const { left, top, width, height } = placement(crop, size, FRAME);
    context.drawImage(image, left, top, width, height);
    if (shape === 'circle') {
      context.beginPath();
      context.rect(0, 0, FRAME, FRAME);
      context.arc(FRAME / 2, FRAME / 2, FRAME / 2, 0, Math.PI * 2, true);
      context.fillStyle = DIM;
      context.fill('evenodd');
    }
    // `size` je izpeljan iz `image`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, crop, shape]);

  const change = (next: CropState) => onCropChange(clampCrop(next, size, FRAME));

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number, string]> = {
      ArrowLeft: [-step, 0, 'left'],
      ArrowRight: [step, 0, 'right'],
      ArrowUp: [0, -step, 'up'],
      ArrowDown: [0, step, 'down'],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      change({ ...crop, x: crop.x + move[0], y: crop.y + move[1] });
      onAnnounce(t('images.dialog.moved', { direction: t(`images.dialog.${move[2] as 'left'}`) }));
      return;
    }
    const zoom =
      event.key === '+' || event.key === '=' ? ZOOM_STEP : event.key === '-' ? -ZOOM_STEP : 0;
    if (zoom !== 0) {
      event.preventDefault();
      const next = clampCrop({ ...crop, zoom: crop.zoom + zoom }, size, FRAME);
      onCropChange(next);
      onAnnounce(t('images.dialog.zoomValue', { percent: Math.round(next.zoom * 100) }));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onCropChange(INITIAL_CROP);
      onAnnounce(t('images.dialog.reset'));
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, origin: crop };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const start = drag.current;
    if (start?.pointer !== event.pointerId) return;
    change({
      ...start.origin,
      x: start.origin.x + event.clientX - start.x,
      y: start.origin.y + event.clientY - start.y,
    });
  };
  const onPointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        ref={group}
        aria-label={t('images.dialog.cropLabel')}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        className={`size-70 overflow-hidden rounded-md border border-border bg-muted ${focusRing}`}
      >
        <canvas
          ref={canvas}
          aria-hidden="true"
          width={FRAME}
          height={FRAME}
          className="block size-70 cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
      </button>
      <p id={hintId} className="text-center text-sm text-muted-foreground">
        {t(shape === 'circle' ? 'images.dialog.cropFrameCircle' : 'images.dialog.cropFrameSquare')}{' '}
        {t('images.dialog.cropHint')}
      </p>
    </div>
  );
}

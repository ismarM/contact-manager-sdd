// Računanje obrezovanja (design.md 8.10): okvir je kvadrat s stranico `frame` (CSS točke), slika ga vedno pokriva.

export const MAX_ZOOM = 4;
export const MIN_ZOOM = 1;
export const EXPORT_MAX = 1024;

export interface CropState {
  /** 1 = slika ravno pokrije okvir. */
  zoom: number;
  /** Premik središča slike od središča okvirja (CSS točke). */
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const INITIAL_CROP: CropState = { zoom: 1, x: 0, y: 0 };

/** Merilo (CSS točk na točko slike) pri povečavi 1. */
export function baseScale(image: Size, frame: number): number {
  return frame / Math.min(image.width, image.height);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Premik se omeji tako, da slika pokriva ves okvir. */
export function clampCrop(crop: CropState, image: Size, frame: number): CropState {
  const zoom = clampZoom(crop.zoom);
  const scale = baseScale(image, frame) * zoom;
  const limitX = Math.max(0, (image.width * scale - frame) / 2);
  const limitY = Math.max(0, (image.height * scale - frame) / 2);
  return {
    zoom,
    x: Math.min(limitX, Math.max(-limitX, crop.x)),
    y: Math.min(limitY, Math.max(-limitY, crop.y)),
  };
}

/** Kje je slika v okvirju (zgornji levi kot in velikost v CSS točkah). */
export function placement(crop: CropState, image: Size, frame: number) {
  const scale = baseScale(image, frame) * crop.zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    left: frame / 2 - width / 2 + crop.x,
    top: frame / 2 - height / 2 + crop.y,
    width,
    height,
  };
}

/** Izrez v točkah izvorne slike in velikost izvoza (največ 1024, brez povečevanja). */
export function exportRect(crop: CropState, image: Size, frame: number) {
  const scale = baseScale(image, frame) * crop.zoom;
  const { left, top } = placement(crop, image, frame);
  const side = frame / scale;
  const sx = Math.max(0, Math.min(image.width - side, -left / scale));
  const sy = Math.max(0, Math.min(image.height - side, -top / scale));
  return { sx, sy, side, output: Math.max(1, Math.min(EXPORT_MAX, Math.round(side))) };
}

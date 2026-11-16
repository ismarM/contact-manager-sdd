import { describe, expect, it } from 'vitest';

import { clampCrop, EXPORT_MAX, exportRect, INITIAL_CROP, placement } from './cropMath';

const FRAME = 280;
const wide = { width: 1400, height: 700 };

describe('cropMath', () => {
  it('začetno obrezovanje je sredinski kvadrat z najkrajšo stranico', () => {
    const rect = exportRect(INITIAL_CROP, wide, FRAME);
    expect(rect.side).toBe(700);
    expect(rect.sx).toBe(350);
    expect(rect.sy).toBe(0);
  });

  it('premik je omejen, da slika pokriva okvir', () => {
    const clamped = clampCrop({ zoom: 1, x: 10_000, y: -10_000 }, wide, FRAME);
    const { left, top, width, height } = placement(clamped, wide, FRAME);
    expect(left).toBeCloseTo(0);
    expect(top + height).toBeGreaterThanOrEqual(FRAME - 1e-9);
    expect(width).toBe(560);
  });

  it('povečava je omejena med 1 in 4', () => {
    expect(clampCrop({ zoom: 99, x: 0, y: 0 }, wide, FRAME).zoom).toBe(4);
    expect(clampCrop({ zoom: 0.1, x: 0, y: 0 }, wide, FRAME).zoom).toBe(1);
  });

  it('izvoz je največ 1024 točk in slike ne povečuje', () => {
    const big = exportRect(INITIAL_CROP, { width: 4000, height: 3000 }, FRAME);
    expect(big.output).toBe(EXPORT_MAX);
    const small = exportRect(INITIAL_CROP, { width: 300, height: 200 }, FRAME);
    expect(small.output).toBe(200);
  });
});

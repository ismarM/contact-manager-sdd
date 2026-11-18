// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Kontrast žetonov v2 (FR-020-02, SC-006): bere žetone `--k-*: light-dark(svetla, temna)` iz app.css.

const css = readFileSync(path.resolve(import.meta.dirname, 'app.css'), 'utf8');

type Theme = 'light' | 'dark';

/** Žeton `--k-ime` kot šestnajstiško barvo v dani temi. */
function token(name: string, theme: Theme): string {
  const match = new RegExp(
    `--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`,
    'i',
  ).exec(css);
  if (!match) throw new Error(`žeton ${name} ni v app.css`);
  return (theme === 'light' ? match[1] : match[2]) as string;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const LAYERS = ['k-bg', 'k-surface', 'k-raised', 'k-sunken'];
const GROUPS = ['tinta', 'mah', 'opeka', 'oker', 'sliva', 'morje', 'grafit', 'rja'].map(
  (g) => `k-group-${g}`,
);

/** [besedilo, sloji] – vsak par ≥ 4,5 : 1 (WCAG 1.4.3). */
const TEXT_PAIRS: [string, string[]][] = [
  ['k-text', [...LAYERS, 'k-accent-soft', 'k-danger-soft', 'k-success-soft', 'k-warning-soft']],
  ['k-muted', LAYERS],
  ['k-accent', [...LAYERS, 'k-accent-soft']],
  ['k-accent-hover', [...LAYERS, 'k-accent-soft']],
  ['k-on-accent', ['k-accent', 'k-accent-hover', 'k-danger', ...GROUPS]],
  ['k-danger', ['k-bg', 'k-surface', 'k-raised', 'k-danger-soft']],
  ['k-success', ['k-bg', 'k-surface', 'k-raised', 'k-success-soft']],
  ['k-warning', ['k-bg', 'k-surface', 'k-raised', 'k-warning-soft']],
];

describe.each(['light', 'dark'] as const)('kontrast žetonov (%s tema)', (theme) => {
  it.each(TEXT_PAIRS.flatMap(([fg, layers]) => layers.map((bg) => [fg, bg] as const)))(
    'FR-020-02: besedilo %s na %s ≥ 4,5 : 1',
    (fg, bg) => {
      expect(contrast(token(fg, theme), token(bg, theme))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['k-bg', 'k-surface', 'k-raised'])(
    'FR-020-02: rob kontrolnika (k-border) na %s ≥ 3 : 1',
    (bg) => {
      expect(contrast(token('k-border', theme), token(bg, theme))).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(GROUPS)('FR-020-02: barva skupine %s (črta, jeziček) na k-surface ≥ 3 : 1', (group) => {
    expect(contrast(token(group, theme), token('k-surface', theme))).toBeGreaterThanOrEqual(3);
  });
});

// @vitest-environment node
import { ESLint } from 'eslint';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// Pravila projekta v frontend/eslint.config.js (FR-000-05, FR-000-12, FR-000-18).
// Tipsko odvisna pravila so izklopljena, ker navidezna datoteka ni del projekta TypeScript.
const eslint = new ESLint({
  cwd: path.resolve(import.meta.dirname, '../..'),
  overrideConfig: [tseslint.configs.disableTypeChecked],
});

async function ruleIds(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: 'src/lint-sample.tsx' });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const component = (body: string) => `export function Sample() {\n  return ${body};\n}\n`;

describe('ESLint pravila projekta', () => {
  it('FR-000-12: razred privzete palete Tailwind ni dovoljen', async () => {
    expect(await ruleIds(component('<p className="bg-zinc-500">x</p>'))).toContain(
      'better-tailwindcss/no-unknown-classes',
    );
  });

  it('FR-000-12: privzete sence Tailwind niso na voljo', async () => {
    expect(await ruleIds(component('<p className="shadow-sm">x</p>'))).toContain(
      'better-tailwindcss/no-unknown-classes',
    );
  });

  it.each(['bg-[#ff0000]', 'text-[rgb(0,0,0)]', 'border-[hsl(0_0%_0%)]'])(
    'FR-000-12: arbitrarna barva %s ni dovoljena',
    async (cls) => {
      expect(await ruleIds(component(`<p className="${cls}">x</p>`))).toContain(
        'better-tailwindcss/no-restricted-classes',
      );
    },
  );

  it('FR-000-12: različica dark: ni dovoljena', async () => {
    expect(await ruleIds(component('<p className="dark:bg-card">x</p>'))).toContain(
      'better-tailwindcss/no-restricted-classes',
    );
  });

  it('FR-000-12: atribut style ni dovoljen', async () => {
    expect(await ruleIds(component(`<p style={{ color: 'red' }}>x</p>`))).toContain(
      'no-restricted-syntax',
    );
  });

  it('FR-000-12: žetoni in sistemske barve v vsiljenih barvah so dovoljeni', async () => {
    expect(
      await ruleIds(component('<p className="bg-card forced-colors:outline-[Highlight]">x</p>')),
    ).toEqual([]);
  });

  it('FR-000-05: slika brez alt krši jsx-a11y', async () => {
    expect(await ruleIds(component('<img src="a.png" />'))).toContain('jsx-a11y/alt-text');
  });

  it('FR-000-18: @ts-nocheck ni dovoljen', async () => {
    expect(await ruleIds(`// @ts-nocheck\nexport const a = 1;\n`)).toContain(
      '@typescript-eslint/ban-ts-comment',
    );
  });

  it('FR-000-18: tip any ni dovoljen', async () => {
    expect(await ruleIds(`export let a: any = 1;\n`)).toContain(
      '@typescript-eslint/no-explicit-any',
    );
  });
});

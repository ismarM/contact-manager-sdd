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

  it('FR-020-01: privzete sence Tailwind (xl, 2xl, inner) niso na voljo; sence v2 sm, md in lg so', async () => {
    expect(await ruleIds(component('<p className="shadow-xl">x</p>'))).toContain(
      'better-tailwindcss/no-unknown-classes',
    );
    expect(await ruleIds(component('<p className="shadow-2xl">x</p>'))).toContain(
      'better-tailwindcss/no-unknown-classes',
    );
    expect(
      await ruleIds(component('<p className="shadow-sm hover:shadow-md shadow-lg">x</p>')),
    ).toEqual([]);
  });

  it('FR-020-01: zaobljenosti iz lestvice v2 (xs, sm, md, lg, full) so dovoljene, večje ne', async () => {
    expect(
      await ruleIds(
        component('<p className="rounded-xs rounded-sm rounded-md rounded-lg rounded-full">x</p>'),
      ),
    ).toEqual([]);
    expect(await ruleIds(component('<p className="rounded-3xl">x</p>'))).toContain(
      'better-tailwindcss/no-unknown-classes',
    );
  });

  it.each(['bg-linear-to-r', 'bg-gradient-to-b', 'from-card', 'via-muted', 'to-background'])(
    'FR-020-01: preliv %s ni dovoljen',
    async (cls) => {
      expect(await ruleIds(component(`<p className="${cls}">x</p>`))).toContain(
        'better-tailwindcss/no-restricted-classes',
      );
    },
  );

  it.each(['backdrop-blur-sm', 'blur-md', 'backdrop-blur'])(
    'FR-020-01: zameglitev %s ni dovoljena',
    async (cls) => {
      expect(await ruleIds(component(`<p className="${cls}">x</p>`))).toContain(
        'better-tailwindcss/no-restricted-classes',
      );
    },
  );

  it('FR-020-02: barva izven žetonov v2 (zinc) ni dovoljena', async () => {
    expect(
      await ruleIds(component('<p className="text-zinc-500 border-slate-200">x</p>')),
    ).toContain('better-tailwindcss/no-unknown-classes');
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

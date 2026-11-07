// @ts-check
import js from '@eslint/js';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'dev-dist/', 'test-results/', 'node_modules/'] },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { files: ['eslint.config.js'], ...tseslint.configs.disableTypeChecked },
  reactHooks.configs.flat.recommended,
  {
    // FR-000-18: brez tipa any in brez utišanja preverjanja tipov.
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          'ts-expect-error': true,
        },
      ],
    },
  },
  {
    // FR-000-05, FR-000-12, FR-000-13: dostopnost in barve samo iz žetonov design.md.
    files: ['src/**/*.{ts,tsx}'],
    ...jsxA11y.flatConfigs.recommended,
    plugins: {
      ...jsxA11y.flatConfigs.recommended.plugins,
      'better-tailwindcss': betterTailwindcss,
    },
    settings: {
      'better-tailwindcss': { entryPoint: 'src/styles/app.css' },
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // D-44: drsna regija preglednice mora biti dosegljiva s tipkovnico (WCAG 2.1.1, axe scrollable-region-focusable).
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'region'] }],
      'better-tailwindcss/no-unknown-classes': 'error',
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            {
              pattern: '^(.*:)?[a-z-]+-\\[(#|rgb|rgba|hsl|hsla|oklch|oklab|color)\\b.*\\]$',
              message: 'Arbitrarna barva ni dovoljena – uporabi žeton iz design.md.',
            },
            {
              pattern: '^dark:',
              message: 'Različica dark: ni dovoljena – žetoni se prilagodijo sami (light-dark()).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'Atribut style ni dovoljen – uporabi pripomočke Tailwind iz žetonov.',
        },
      ],
    },
  },
);

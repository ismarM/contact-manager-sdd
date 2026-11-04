import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Projekta ustrezata korakoma verify.sh: "unit FE" (*.test.ts) in "funkcionalni FE" (*.test.tsx).
export default defineConfig({
  plugins: [react()],
  test: {
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/junit.xml' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.ts'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
});

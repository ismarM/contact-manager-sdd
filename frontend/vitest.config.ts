import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// 005: čas vnosov sledi je v časovnem pasu brskalnika; testi tečejo v Europe/Ljubljana, da so dobesedni nizi determinirani.
process.env.TZ = 'Europe/Ljubljana';

// Projekta ustrezata korakoma verify.sh: "unit FE" (*.test.ts) in "funkcionalni FE" (*.test.tsx).
export default defineConfig({
  plugins: [react()],
  test: {
    // Pod obremenitvijo (vzporedni verify, Docker) so posamezni testi UI presegli privzetih 5 s, posamič pa so zeleni:
    // enotna višja meja in manj vzporednih delavcev namesto popravkov posameznih testov.
    testTimeout: 15_000,
    maxWorkers: '50%',
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

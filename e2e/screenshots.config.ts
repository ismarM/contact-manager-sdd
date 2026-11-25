import { defineConfig, devices } from '@playwright/test';

// Posnetki zaslona za predstavitev (ni del vrat kakovosti): teče proti predstavitvenemu sistemu (compose.demo.yaml
// in storitev seed). Zagon: npx playwright test -c screenshots.config.ts
export default defineConfig({
  testDir: './screenshots',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['line']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    contextOptions: { reducedMotion: 'reduce' },
    locale: 'sl-SI',
  },
});

import { defineConfig, devices } from '@playwright/test';

// Širine (konstitucija §3.3): vsi scenariji tečejo pri 360 in 1280 px. Pri 768 px tečejo dimni testi ogrodja
// (ogrodje.spec.ts) in scenariji z oznako @w768 – oznako dobi scenarij, katerega postavitev je pri tej širini
// drugačna kot pri obeh drugih.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['line'], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'w360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 } } },
    {
      name: 'w768',
      grep: /ogrodje\.spec\.ts|@w768/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'w1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});

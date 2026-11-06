import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './msw';
import { installMatchMedia, resetViewport } from './viewport';

// jsdom nima API-jev, ki jih uporabljajo meniji (radix-ui, D-21); brez vedenja, samo da se komponente izrišejo.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
const missing: [keyof Element, unknown][] = [
  ['scrollIntoView', () => undefined],
  ['hasPointerCapture', () => false],
  ['releasePointerCapture', () => undefined],
];
for (const [name, value] of missing) {
  // eslint-rules.test.ts teče v okolju node (brez DOM).
  if (typeof Element !== 'undefined' && !(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, { value, configurable: true, writable: true });
  }
}

// Prelomna točka stranskega pasu (002, research R-10): privzeto ozek zaslon.
if (typeof window !== 'undefined') installMatchMedia();

// Nepričakovan zahtevek na omrežje je napaka testa (MSW 3: onUnhandledFrame).
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetViewport();
  // Izbira jezika in teme (001) se ne prenaša med testi (ne v okolju node).
  if (typeof document !== 'undefined') {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  }
});
afterAll(() => server.close());

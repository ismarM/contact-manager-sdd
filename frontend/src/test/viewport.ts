// Nadomestek window.matchMedia za prelomno točko stranskega pasu (research R-10): jsdom nima CSS, zato test sam izbere
// širino. Privzeto ozko (< 1024 px); vsak test, ki potrebuje stranski pas, pokliče setViewport('wide').

const WIDE_QUERY = '(min-width: 1024px)';
const PANEL_QUERY = '(min-width: 1280px)';

type Listener = (event: MediaQueryListEvent) => void;

let level: 'narrow' | 'wide' | 'panel' = 'narrow';
const lists = new Set<{ media: string; listeners: Set<Listener>; list: MediaQueryList }>();

function matches(media: string): boolean {
  const query = media.replace(/\s+/g, '');
  if (query === WIDE_QUERY.replace(/\s+/g, '')) return level !== 'narrow';
  if (query === PANEL_QUERY.replace(/\s+/g, '')) return level === 'panel';
  return false;
}

function createList(media: string): MediaQueryList {
  const listeners = new Set<Listener>();
  const list = {
    media,
    get matches() {
      return matches(media);
    },
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  lists.add({ media, listeners, list });
  return list;
}

export function installMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => createList(media),
  });
}

/**
 * Širina zaslona za teste: `panel` ≥ 1280 px (stranski pas in panel podrobnosti kontakta), `wide` ≥ 1024 px (stranski
 * pas), `narrow` < 1024 px (gumb za preklop skupine).
 */
export function setViewport(width: 'panel' | 'wide' | 'narrow'): void {
  if (width === level) return;
  level = width;
  for (const { media, listeners, list } of lists) {
    const event = { matches: matches(media), media } as MediaQueryListEvent;
    for (const listener of listeners) listener.call(list, event);
  }
}

export function resetViewport(): void {
  level = 'narrow';
  lists.clear();
}

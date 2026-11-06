// Nadomestek window.matchMedia za prelomno točko stranskega pasu (research R-10): jsdom nima CSS, zato test sam izbere
// širino. Privzeto ozko (< 1024 px); vsak test, ki potrebuje stranski pas, pokliče setViewport('wide').

const WIDE_QUERY = '(min-width: 1024px)';

type Listener = (event: MediaQueryListEvent) => void;

let wide = false;
const lists = new Set<{ media: string; listeners: Set<Listener>; list: MediaQueryList }>();

function matches(media: string): boolean {
  return media.replace(/\s+/g, '') === WIDE_QUERY.replace(/\s+/g, '') ? wide : false;
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

/** Širina zaslona za teste: `wide` ≥ 1024 px (stranski pas), `narrow` < 1024 px (gumb za preklop skupine). */
export function setViewport(width: 'wide' | 'narrow'): void {
  const next = width === 'wide';
  if (next === wide) return;
  wide = next;
  for (const { media, listeners, list } of lists) {
    const event = { matches: matches(media), media } as MediaQueryListEvent;
    for (const listener of listeners) listener.call(list, event);
  }
}

export function resetViewport(): void {
  wide = false;
  lists.clear();
}

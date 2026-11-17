import { createContext, useContext } from 'react';

import { DEFAULT_FORMATS, type DisplayFormats } from './types';

export interface DisplayFormatsValue {
  formats: DisplayFormats;
  /** Takoj uveljavi izbiro (brez ponovnega nalaganja) in jo shrani v profil. */
  change: (patch: Partial<DisplayFormats>) => void;
  /** Izid zadnjega shranjevanja v profil: `failed` = izbira velja samo na tej napravi. */
  saveStatus: 'idle' | 'saved' | 'failed';
}

/** Brez ponudnika veljajo privzete sheme (npr. v testih posameznih prikazov). */
export const DisplayFormatsContext = createContext<DisplayFormatsValue>({
  formats: DEFAULT_FORMATS,
  change: () => undefined,
  saveStatus: 'idle',
});

export function useDisplayFormats(): DisplayFormatsValue {
  return useContext(DisplayFormatsContext);
}

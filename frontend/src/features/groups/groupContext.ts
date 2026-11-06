import { createContext, useContext } from 'react';

import type { GroupDetail } from './types';

/** Odprta skupina za zaslone skupine (glava, Nastavitve). */
export interface GroupContextValue {
  group: GroupDetail;
  /** Nove podatke (po shranjevanju ali razrešitvi konflikta) takoj prikažejo glava in naslov strani (FR-002-11). */
  setGroup: (group: GroupDetail) => void;
  /** Zahtevek je vrnil 404 (izguba članstva, izbris): namesto vsebine »Te strani ni« (FR-002-08). */
  markNotFound: () => void;
  /** Ponovno prebere skupino (stanje se je medtem spremenilo: arhivirana, odarhivirana; FR-003-04). */
  reload: () => Promise<void>;
}

export const GroupContext = createContext<GroupContextValue | null>(null);

export function useGroup(): GroupContextValue {
  const value = useContext(GroupContext);
  if (!value) throw new Error('useGroup outside GroupLayout');
  return value;
}

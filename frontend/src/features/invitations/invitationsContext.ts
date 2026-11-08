import { createContext, useContext } from 'react';

/** Število čakajočih povabil prijavljenega uporabnika za zgornjo vrstico (research R-08). */
export interface InvitationsContextValue {
  count: number;
  /** Ponovno naloži število (po sprejemu, zavrnitvi ali odgovoru 404 na strani *Povabila*). */
  refresh: () => void;
}

const EMPTY: InvitationsContextValue = { count: 0, refresh: () => undefined };

export const InvitationsContext = createContext<InvitationsContextValue>(EMPTY);

export function useInvitations(): InvitationsContextValue {
  return useContext(InvitationsContext);
}

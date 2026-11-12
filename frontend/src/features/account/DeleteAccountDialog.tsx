import type { DeletionOutcome } from './types';

export interface DeleteAccountDialogProps {
  /** Račun je izbrisan (`deleted` = 204, `pending` = 202). */
  onDeleted: (outcome: DeletionOutcome) => void;
  /** Zaledje je odgovorilo `409 OWNS_ACTIVE_GROUPS` z danim seznamom skupin. */
  onBlocked: (groups: { id: string; title: string }[]) => void;
}

/** Potrditveni dialog *Izbrišem račun?* (design.md 8.11; FR-012-07). Ogrodje – vedenje pride z implementacijo. */
export function DeleteAccountDialog(props: DeleteAccountDialogProps) {
  void props;
  return null;
}

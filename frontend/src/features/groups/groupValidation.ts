import type { GroupColor } from './types';

// Pravila podatkov skupine v obrazcu (FR-002-02, research R-07) – enaka kot na zaledju, ki je merodajno.

export type GroupFieldError =
  'titleRequired' | 'titleTooLong' | 'descriptionTooLong' | 'colorInvalid';

export interface GroupFormValues {
  title: string;
  description: string;
  color: string;
}

export interface GroupValidation {
  errors: Partial<Record<'title' | 'description' | 'color', GroupFieldError>>;
  /** Normalizirane vrednosti za zahtevek: naslov obrezan, prazen opis = `null`. */
  value: { title: string; description: string | null; color: GroupColor };
}

/** Ogrodje (T008): implementacija v T033. */
export function validateGroupInput(values: GroupFormValues): GroupValidation {
  void values;
  throw new Error('not implemented');
}

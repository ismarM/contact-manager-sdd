import { GROUP_COLORS, type GroupColor } from './types';

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

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 1000;

/** Dolžina v znakih (kodnih točkah), ne v enotah UTF-16. */
function length(text: string): number {
  return [...text].length;
}

function isColor(value: string): value is GroupColor {
  return (GROUP_COLORS as readonly string[]).includes(value);
}

export function validateGroupInput(values: GroupFormValues): GroupValidation {
  const errors: GroupValidation['errors'] = {};
  const title = values.title.trim();
  if (!title) errors.title = 'titleRequired';
  else if (length(title) > TITLE_MAX) errors.title = 'titleTooLong';

  const description = values.description.trim() ? values.description : null;
  if (description !== null && length(description) > DESCRIPTION_MAX) {
    errors.description = 'descriptionTooLong';
  }

  const color = isColor(values.color) ? values.color : 'tinta';
  if (!isColor(values.color)) errors.color = 'colorInvalid';

  return { errors, value: { title, description, color } };
}

/** Napaka polja s strežnika (400 VALIDATION_FAILED) → ključ sporočila ob polju; neznano polje → `null`. */
export function serverFieldError(
  field: string,
  code: string,
): [keyof GroupValidation['errors'], GroupFieldError] | null {
  if (field === 'title') return ['title', code === 'TOO_LONG' ? 'titleTooLong' : 'titleRequired'];
  if (field === 'description') return ['description', 'descriptionTooLong'];
  if (field === 'color') return ['color', 'colorInvalid'];
  return null;
}

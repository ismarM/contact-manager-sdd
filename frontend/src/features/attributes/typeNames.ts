import type { AttributeType } from './types';

/** Ključ prevoda imena tipa ključa (`attributes.types.<TIP>`); imena tipov se berejo samo prek prevodov (FR-016-01). */
export function typeNameKey<T extends AttributeType>(type: T): `attributes.types.${T}` {
  return `attributes.types.${type}`;
}

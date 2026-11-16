import { useTranslation } from 'react-i18next';

/** Podatki, iz katerih nastane stavek dejanja: vnos sledi ali dogodek zgodovine kontakta (FR-015-18). */
export interface SentenceSource {
  /** Znana vrsta ali novejša: neznana dobi splošni stavek »spremenil(a) kontakt«. */
  action: string;
  contactCount: number;
  contactName: string | null;
  /** `ROLLBACK` na začetno stanje, `RESTORE` na izhodiščno različico. */
  targetInitial: boolean;
}

/**
 * Stavek dejanja brez povezave na čas (FR-005-07, FR-015-18): vrsta, število kontaktov in množina iz i18n. `anonymous`
 * (zgodovina enega kontakta) izpusti ime pri enem kontaktu (»uredil(a) kontakt«). Neznana vrsta dejanja je splošen stavek.
 */
export function useAuditSentence() {
  const { t } = useTranslation();
  return (entry: SentenceSource, options: { anonymous?: boolean } = {}): string => {
    const name = options.anonymous ? null : entry.contactName;
    const single = entry.contactCount === 1;
    switch (entry.action) {
      case 'ROLLBACK':
        return entry.targetInitial
          ? t('audit.sentence.ROLLBACK_initial')
          : t('audit.sentence.ROLLBACK_target');
      case 'RESTORE':
        if (entry.targetInitial) {
          return name
            ? t('audit.sentence.RESTORE_initial_named', { name })
            : t('audit.sentence.RESTORE_initial');
        }
        return name
          ? t('audit.sentence.RESTORE_target_named', { name })
          : t('audit.sentence.RESTORE_target');
      case 'MERGE':
        return t('audit.sentence.MERGE_count', { count: entry.contactCount });
      case 'CREATE':
        if (single && name) return t('audit.sentence.CREATE_named', { name });
        if (single && options.anonymous) return t('audit.sentence.CREATE_single');
        return t('audit.sentence.CREATE_count', { count: entry.contactCount });
      case 'UPDATE':
        if (single && name) return t('audit.sentence.UPDATE_named', { name });
        if (single && options.anonymous) return t('audit.sentence.UPDATE_single');
        return t('audit.sentence.UPDATE_count', { count: entry.contactCount });
      case 'DELETE':
        if (single && name) return t('audit.sentence.DELETE_named', { name });
        if (single && options.anonymous) return t('audit.sentence.DELETE_single');
        return t('audit.sentence.DELETE_count', { count: entry.contactCount });
      case 'IMPORT':
        // 014 (FR-014-05): uvoz se prikaže kot vsak drug vnos z več kontakti.
        if (single && name) return t('audit.sentence.IMPORT_named', { name });
        if (single && options.anonymous) return t('audit.sentence.IMPORT_single');
        return t('audit.sentence.IMPORT_count', { count: entry.contactCount });
      default:
        if (single && name) return t('audit.sentence.default_named', { name });
        if (single && options.anonymous) return t('audit.sentence.default_single');
        return t('audit.sentence.default_count', { count: entry.contactCount });
    }
  };
}

package si.contactmanager.audit;

/**
 * Vrsta dejanja vnosa (FR-005-03): dodajanje, urejanje, odstranjevanje, združevanje, rollback; 015: obnova kontakta;
 * 014: uvoz (FR-014-05); 016: sprememba tipa ključa atributa (FR-016-26).
 */
public enum AuditAction {
    CREATE,
    UPDATE,
    DELETE,
    MERGE,
    ROLLBACK,
    RESTORE,
    IMPORT,
    ATTRIBUTE_TYPE
}

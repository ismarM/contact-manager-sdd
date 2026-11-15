package si.contactmanager.audit;

/** Vrsta dejanja vnosa (FR-005-03): dodajanje, urejanje, odstranjevanje, združevanje, rollback; uvoz (FR-014-05). */
public enum AuditAction {
    CREATE,
    UPDATE,
    DELETE,
    MERGE,
    ROLLBACK,
    IMPORT
}

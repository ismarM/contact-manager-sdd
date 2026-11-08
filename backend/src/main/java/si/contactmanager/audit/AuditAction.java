package si.contactmanager.audit;

/** Vrsta dejanja vnosa (FR-005-03): dodajanje, urejanje, odstranjevanje, združevanje, rollback. */
public enum AuditAction {
    CREATE,
    UPDATE,
    DELETE,
    MERGE,
    ROLLBACK
}

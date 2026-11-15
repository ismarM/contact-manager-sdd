package si.contactmanager.audit;

/** Vrsta dejanja vnosa (FR-005-03): dodajanje, urejanje, odstranjevanje, združevanje, rollback; 015: obnova kontakta. */
public enum AuditAction {
    CREATE,
    UPDATE,
    DELETE,
    MERGE,
    ROLLBACK,
    RESTORE
}

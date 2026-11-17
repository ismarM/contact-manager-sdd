package si.contactmanager.audit;

/** Vrsta spremembe slike kontakta v vnosu sledi (018, FR-018-10); vrednost je stolpec {@code audit_entry.photo_change}. */
public enum PhotoChange {
    ADDED,
    REPLACED,
    REMOVED
}

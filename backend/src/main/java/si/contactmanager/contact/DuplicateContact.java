package si.contactmanager.contact;

import java.util.UUID;

/** Kontakt v kartici skupine dvojnikov (data-model.md – DuplicateContact). */
public record DuplicateContact(UUID id, String displayName) {}

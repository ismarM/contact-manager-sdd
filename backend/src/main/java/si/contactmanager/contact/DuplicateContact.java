package si.contactmanager.contact;

import java.util.UUID;

/** Kontakt v kartici skupine dvojnikov (data-model.md – DuplicateContact); {@code photoRevision}: revizija slike kontakta (018). */
public record DuplicateContact(UUID id, String displayName, Long photoRevision) {}

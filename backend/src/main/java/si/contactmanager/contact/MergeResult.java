package si.contactmanager.contact;

import java.util.UUID;

/** Odgovor {@code POST …/duplicates/merge} (data-model.md – MergeResult). */
public record MergeResult(UUID keptContactId, String keptDisplayName, int mergedCount, UUID auditEntryId) {}

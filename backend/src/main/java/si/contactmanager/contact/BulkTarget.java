package si.contactmanager.contact;

import java.util.List;
import java.util.UUID;

/** Identitete izbranih kontaktov v zahtevku (data-model.md – BulkTarget): 1–10 000 po zlitju podvojenih. */
public record BulkTarget(List<UUID> contactIds) {}

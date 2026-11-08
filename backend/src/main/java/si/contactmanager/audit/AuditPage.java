package si.contactmanager.audit;

import java.util.List;
import java.util.UUID;

/** Stran vnosov (contracts/openapi.yaml – AuditPage); {@code latestEntryId} je vedno vnos celotne sledi. */
public record AuditPage(
        long total, int page, int size, List<AuditEntry> items, UUID latestEntryId, ContactFilter contactFilter) {

    /** Uporabljen filter po kontaktu. */
    public record ContactFilter(UUID id, String displayName) {}
}

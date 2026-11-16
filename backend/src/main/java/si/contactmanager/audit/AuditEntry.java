package si.contactmanager.audit;

import java.time.Instant;
import java.util.UUID;
import si.contactmanager.group.UserRef;

/** Vnos revizijske sledi (contracts/openapi.yaml – AuditEntry). {@code actor == null}: izbrisan uporabnik; {@code photoChange}: dejstvo spremembe slike kontakta (018, sicer {@code null}). */
public record AuditEntry(
        UUID id,
        Instant createdAt,
        UserRef actor,
        AuditAction action,
        int contactCount,
        String contactName,
        Target target,
        boolean targetInitial,
        PhotoChange photoChange) {

    /** Ciljni vnos rollbacka na vnos. */
    public record Target(UUID entryId, Instant createdAt) {}
}

package si.contactmanager.audit;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.UUID;
import si.contactmanager.group.UserRef;

/**
 * Vnos revizijske sledi (contracts/openapi.yaml – AuditEntry). {@code actor == null}: izbrisan uporabnik. Polja
 * {@code attributeKey}, {@code typeBefore} in {@code typeAfter} so zapolnjena samo pri {@code ATTRIBUTE_TYPE} (016).
 * {@code apiKeyName}: ime API ključa, s katerim je bila sprememba narejena (019, FR-019-12), sicer {@code null}.
 * {@code photoChange}: dejstvo spremembe slike kontakta (018), sicer {@code null}.
 */
public record AuditEntry(
        UUID id,
        Instant createdAt,
        UserRef actor,
        AuditAction action,
        int contactCount,
        String contactName,
        Target target,
        boolean targetInitial,
        @JsonInclude(JsonInclude.Include.NON_NULL) String attributeKey,
        @JsonInclude(JsonInclude.Include.NON_NULL) String typeBefore,
        @JsonInclude(JsonInclude.Include.NON_NULL) String typeAfter,
        String apiKeyName,
        PhotoChange photoChange) {

    /** Ciljni vnos rollbacka na vnos. */
    public record Target(UUID entryId, Instant createdAt) {}
}

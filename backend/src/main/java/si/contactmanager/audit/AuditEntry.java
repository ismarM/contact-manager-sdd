package si.contactmanager.audit;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.UUID;
import si.contactmanager.group.UserRef;

/**
 * Vnos revizijske sledi (contracts/openapi.yaml – AuditEntry). {@code actor == null}: izbrisan uporabnik. Polja
 * {@code attributeKey}, {@code typeBefore} in {@code typeAfter} so zapolnjena samo pri {@code ATTRIBUTE_TYPE} (016).
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
        @JsonInclude(JsonInclude.Include.NON_NULL) String typeAfter) {

    /** Ciljni vnos rollbacka na vnos. */
    public record Target(UUID entryId, Instant createdAt) {}
}

package si.contactmanager.contact;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import si.contactmanager.group.UserRef;

/** Kontakt z vsemi podatki (contracts/openapi.yaml – ContactDetail). {@code updatedBy == null}: izbrisan uporabnik. */
public record ContactDetail(
        UUID id,
        String firstName,
        String lastName,
        String displayName,
        String address,
        @JsonInclude(JsonInclude.Include.NON_NULL) Address addressParts,
        String email,
        String phone,
        String company,
        String country,
        List<Attribute> attributes,
        List<String> tags,
        long version,
        Instant createdAt,
        Instant updatedAt,
        UserRef updatedBy,
        RevertInfo reverted,
        Long photoRevision) {
    /** Stanje brez razčlenjenega naslova (pred 016): {@code addressParts} je {@code null}. */
    public ContactDetail(
            UUID id,
            String firstName,
            String lastName,
            String displayName,
            String address,
            String email,
            String phone,
            String company,
            String country,
            List<Attribute> attributes,
            List<String> tags,
            long version,
            Instant createdAt,
            Instant updatedAt,
            UserRef updatedBy,
            RevertInfo reverted,
            Long photoRevision) {
        this(
                id,
                firstName,
                lastName,
                displayName,
                address,
                null,
                email,
                phone,
                company,
                country,
                attributes,
                tags,
                version,
                createdAt,
                updatedAt,
                updatedBy,
                reverted,
                photoRevision);
    }
}

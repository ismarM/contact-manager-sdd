package si.contactmanager.contact;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Kontakt v primerjavi (data-model.md – CompareContact): trenutni podatki in verzija ob odprtju. */
public record CompareContact(
        UUID id,
        long version,
        Instant createdAt,
        String firstName,
        String lastName,
        String address,
        @JsonInclude(JsonInclude.Include.NON_NULL) Address addressParts,
        String email,
        String phone,
        String company,
        String country,
        List<Attribute> attributes,
        List<String> tags,
        Long photoRevision) {
    /** Stanje brez razčlenjenega naslova (pred 016): {@code addressParts} je {@code null}. */
    public CompareContact(
            UUID id,
            long version,
            Instant createdAt,
            String firstName,
            String lastName,
            String address,
            String email,
            String phone,
            String company,
            String country,
            List<Attribute> attributes,
            List<String> tags,
            Long photoRevision) {
        this(
                id,
                version,
                createdAt,
                firstName,
                lastName,
                address,
                null,
                email,
                phone,
                company,
                country,
                attributes,
                tags,
                photoRevision);
    }
}

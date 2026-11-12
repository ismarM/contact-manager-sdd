package si.contactmanager.contact;

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
        String email,
        String phone,
        List<Attribute> attributes,
        List<String> tags) {}

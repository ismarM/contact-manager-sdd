package si.contactmanager.contact;

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
        String email,
        String phone,
        List<Attribute> attributes,
        List<String> tags,
        long version,
        Instant createdAt,
        Instant updatedAt,
        UserRef updatedBy,
        RevertInfo reverted) {}

package si.contactmanager.contact;

import java.util.List;
import java.util.UUID;

/** Vrstica seznama kontaktov (contracts/openapi.yaml – ContactSummary); {@code version} potrebuje izbris iz vrstice; {@code photoRevision} je revizija slike ({@code null} = brez slike, 018). */
public record ContactSummary(
        UUID id,
        String firstName,
        String lastName,
        String displayName,
        String email,
        String phone,
        List<String> tags,
        long version,
        boolean reverted,
        Long photoRevision) {}

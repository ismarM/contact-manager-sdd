package si.contactmanager.group;

import java.time.Instant;
import java.util.UUID;

/** Skupina z vlogo klicatelja (contracts/openapi.yaml – GroupDetail). */
public record GroupDetail(
        UUID id,
        String title,
        String description,
        String color,
        Role role,
        boolean archived,
        long version,
        Instant updatedAt,
        UserRef updatedBy) {}

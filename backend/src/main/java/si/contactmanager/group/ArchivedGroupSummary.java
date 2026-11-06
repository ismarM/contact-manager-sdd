package si.contactmanager.group;

import java.util.UUID;

/** Vrstica seznama arhiviranih skupin (contracts/openapi.yaml – ArchivedGroupSummary). */
public record ArchivedGroupSummary(
        UUID id,
        String title,
        String description,
        String color,
        int contactCount,
        Role role,
        boolean permanentlyArchived) {}

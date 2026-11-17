package si.contactmanager.group;

import java.util.UUID;

/** Vrstica seznama skupin (contracts/openapi.yaml – GroupSummary); {@code contactCount} je število kontaktov skupine (004); {@code photoRevision}: revizija slike skupine ({@code null} = brez slike, 018). */
public record GroupSummary(
        UUID id, String title, String description, String color, int contactCount, Long photoRevision) {}

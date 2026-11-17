package si.contactmanager.group;

import java.util.UUID;

/** Vrstica seznama skupin (020, contracts/openapi.yaml – GroupItem); {@code contactCount} je število kontaktov skupine (004); {@code photoRevision}: revizija slike skupine ({@code null} = brez slike, 018); {@code role}: vloga klicatelja. */
public record GroupSummary(
        UUID id, String title, String description, String color, int contactCount, Long photoRevision, Role role) {}

package si.contactmanager.invitation;

import java.util.UUID;

/** Skupina prejetega povabila (trenutni naslov in barva). */
public record InvitationGroup(UUID id, String title, String color, boolean archived) {}

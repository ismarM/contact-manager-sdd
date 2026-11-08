package si.contactmanager.invitation;

import java.time.Instant;
import java.util.UUID;
import si.contactmanager.group.UserRef;

/** Prejeto povabilo; {@code invitedBy} je {@code null} za izbrisanega uporabnika (§2.5). */
public record ReceivedInvitation(UUID id, InvitationGroup group, String role, UserRef invitedBy, Instant createdAt) {}

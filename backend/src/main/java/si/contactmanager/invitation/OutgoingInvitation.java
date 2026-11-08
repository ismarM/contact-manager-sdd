package si.contactmanager.invitation;

import java.time.Instant;
import java.util.UUID;
import si.contactmanager.group.UserRef;

/** Čakajoče povabilo v odgovoru skupine; {@code invitedBy} je {@code null} za izbrisanega uporabnika (§2.5). */
public record OutgoingInvitation(
        UUID id, String inviteeEmail, String role, UserRef invitedBy, Instant createdAt, boolean canWithdraw) {}

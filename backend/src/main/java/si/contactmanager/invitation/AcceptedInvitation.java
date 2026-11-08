package si.contactmanager.invitation;

import java.util.UUID;

/** Odgovor sprejema povabila: skupina, vloga in ali je arhivirana. */
public record AcceptedInvitation(UUID groupId, String title, String role, boolean archived) {}

package si.contactmanager.invitation;

import java.util.List;

/** Odgovor {@code GET /api/groups/{groupId}/invitations} (contracts/openapi.yaml). */
public record OutgoingInvitations(int total, int page, int size, List<OutgoingInvitation> items) {}

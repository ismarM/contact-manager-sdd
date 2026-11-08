package si.contactmanager.invitation;

import java.util.List;

/** Odgovor {@code GET /api/invitations} (contracts/openapi.yaml). */
public record ReceivedInvitations(int total, int page, int size, List<ReceivedInvitation> items) {}

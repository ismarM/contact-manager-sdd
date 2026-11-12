package si.contactmanager.account;

import java.time.Instant;
import java.util.List;

/** Čista funkcija: vrstice iz baze → {@link MyData} (012, FR-012-02, FR-012-03). Ogrodje – vedenje pride z implementacijo. */
final class ExportAssembler {

    record ProfileRow(String name, String email, Instant createdAt, String language, String theme) {}

    record MembershipRow(String groupTitle, String role, Instant joinedAt, boolean archived, boolean hasOwner) {}

    record ReceivedRow(String groupTitle, String role, String senderName, boolean senderDeleted, Instant createdAt) {}

    record SentRow(String groupTitle, String role, String inviteeEmail, Instant createdAt) {}

    record OwnedRow(String title, String description, String color, boolean archived, Instant createdAt) {}

    private ExportAssembler() {}

    static MyData assemble(
            Instant exportedAt,
            ProfileRow profile,
            List<MembershipRow> memberships,
            List<ReceivedRow> received,
            List<SentRow> sent,
            List<OwnedRow> owned) {
        throw new UnsupportedOperationException("not implemented: ExportAssembler.assemble (FR-012-02)");
    }
}

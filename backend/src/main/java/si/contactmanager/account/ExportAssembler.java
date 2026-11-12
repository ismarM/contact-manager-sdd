package si.contactmanager.account;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/** Čista funkcija: vrstice iz baze → {@link MyData} (012, FR-012-02, FR-012-03). Ogrodje – vedenje pride z implementacijo. */
final class ExportAssembler {

    record ProfileRow(String name, String email, Instant createdAt, String language, String theme) {}

    record MembershipRow(String groupTitle, String role, Instant joinedAt, boolean archived, boolean hasOwner) {}

    record ReceivedRow(String groupTitle, String role, String senderName, boolean senderDeleted, Instant createdAt) {}

    record SentRow(String groupTitle, String role, String inviteeEmail, Instant createdAt) {}

    record OwnedRow(String title, String description, String color, boolean archived, Instant createdAt) {}

    private ExportAssembler() {}

    static final String DELETED_USER = "izbrisan uporabnik";

    static MyData assemble(
            Instant exportedAt,
            ProfileRow profile,
            List<MembershipRow> memberships,
            List<ReceivedRow> received,
            List<SentRow> sent,
            List<OwnedRow> owned) {
        return new MyData(
                1,
                exportedAt,
                new MyData.Profile(
                        profile.name(), profile.email(), profile.createdAt(), profile.language(), profile.theme()),
                memberships.stream()
                        .sorted(Comparator.comparing(MembershipRow::joinedAt).thenComparing(MembershipRow::groupTitle))
                        .map(row -> new MyData.Membership(row.groupTitle(), row.role(), row.joinedAt(), state(row)))
                        .toList(),
                received.stream()
                        .sorted(Comparator.comparing(ReceivedRow::createdAt).thenComparing(ReceivedRow::groupTitle))
                        .map(row -> new MyData.ReceivedInvitation(
                                row.groupTitle(), row.role(), sender(row), row.createdAt()))
                        .toList(),
                sent.stream()
                        .sorted(Comparator.comparing(SentRow::createdAt).thenComparing(SentRow::groupTitle))
                        .map(row -> new MyData.SentInvitation(
                                row.groupTitle(), row.role(), row.inviteeEmail(), row.createdAt()))
                        .toList(),
                owned.stream()
                        .sorted(Comparator.comparing(OwnedRow::createdAt).thenComparing(OwnedRow::title))
                        .map(row -> new MyData.OwnedGroup(
                                row.title(),
                                row.description(),
                                row.color(),
                                row.archived() ? "ARCHIVED" : "ACTIVE",
                                row.createdAt()))
                        .toList());
    }

    /** Arhivirana skupina brez lastnika je trajno arhivirana (feature-map §2.1; 003). */
    private static String state(MembershipRow row) {
        if (!row.archived()) {
            return "ACTIVE";
        }
        return row.hasOwner() ? "ARCHIVED" : "PERMANENTLY_ARCHIVED";
    }

    /** Izbrisan pošiljatelj: konstantno »izbrisan uporabnik« z zastavico; e-naslova pošiljatelja izvoz ne vsebuje (FR-012-03). */
    private static MyData.Sender sender(ReceivedRow row) {
        return row.senderDeleted() ? new MyData.Sender(DELETED_USER, true) : new MyData.Sender(row.senderName(), false);
    }
}

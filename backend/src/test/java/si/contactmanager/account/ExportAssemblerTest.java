package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.ExportAssembler.MembershipRow;
import si.contactmanager.account.ExportAssembler.OwnedRow;
import si.contactmanager.account.ExportAssembler.ProfileRow;
import si.contactmanager.account.ExportAssembler.ReceivedRow;
import si.contactmanager.account.ExportAssembler.SentRow;
import si.contactmanager.account.MyData.Membership;
import si.contactmanager.account.MyData.OwnedGroup;
import si.contactmanager.account.MyData.Profile;
import si.contactmanager.account.MyData.ReceivedInvitation;
import si.contactmanager.account.MyData.Sender;
import si.contactmanager.account.MyData.SentInvitation;

/**
 * Sestavljanje izvoza iz vrstic (FR-012-02, FR-012-03). Pričakovane vrednosti so napisane ročno in niso izpeljane iz
 * kode, ki jo preizkušamo.
 */
@Tag("FR-012-02")
@Tag("FR-012-03")
class ExportAssemblerTest {

    private static final Instant NOW = Instant.parse("2026-11-02T09:30:00Z");
    private static final Instant T1 = Instant.parse("2026-10-01T08:00:00Z");
    private static final Instant T2 = Instant.parse("2026-10-03T10:00:00Z");
    private static final Instant T3 = Instant.parse("2026-10-04T10:00:00Z");

    private static final ProfileRow PROFILE =
            new ProfileRow("Pia Kos", "pia.kos@primer.si", T1, "en", "dark", "NATIONAL", "ISO", "SINGLE_LINE");

    @Test
    void assemblesAllSectionsWithCodesAndIsoDates() {
        MyData actual = ExportAssembler.assemble(
                NOW,
                PROFILE,
                List.of(
                        new MembershipRow("Stara skupina", "VIEWER", T3, true, false),
                        new MembershipRow("Arhiv 2025", "EDITOR", T2, true, true),
                        new MembershipRow("Projekt FERI", "OWNER", T1, false, true)),
                List.of(new ReceivedRow("Klub", "EDITOR", "Ana Novak", false, T2)),
                List.of(new SentRow("Projekt FERI", "VIEWER", "cene.kralj@primer.si", T3)),
                List.of(new OwnedRow("Projekt FERI", "Skupni stiki", "morje", false, T1)));

        MyData expected = new MyData(
                1,
                NOW,
                new Profile("Pia Kos", "pia.kos@primer.si", T1, "en", "dark", "NATIONAL", "ISO", "SINGLE_LINE"),
                List.of(
                        new Membership("Projekt FERI", "OWNER", T1, "ACTIVE"),
                        new Membership("Arhiv 2025", "EDITOR", T2, "ARCHIVED"),
                        new Membership("Stara skupina", "VIEWER", T3, "PERMANENTLY_ARCHIVED")),
                List.of(new ReceivedInvitation("Klub", "EDITOR", new Sender("Ana Novak", false), T2)),
                List.of(new SentInvitation("Projekt FERI", "VIEWER", "cene.kralj@primer.si", T3)),
                List.of(new OwnedGroup("Projekt FERI", "Skupni stiki", "morje", "ACTIVE", T1)),
                List.of(),
                List.of());
        assertThat(actual).isEqualTo(expected);
    }

    /** 014 (FR-014-25): gesla za aplikacijo z imenom in časi, po času nastanka; brez gesla ali zgoščene vrednosti. */
    @Test
    void appPasswordsAreListedByCreationTimeWithNameAndTimesOnly() {
        MyData actual = ExportAssembler.assemble(
                NOW,
                PROFILE,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(
                        new ExportAssembler.AppPasswordRow("Telefon", T2, null),
                        new ExportAssembler.AppPasswordRow("iPhone", T1, T3)));

        assertThat(actual.appPasswords())
                .containsExactly(new MyData.AppPassword("iPhone", T1, T3), new MyData.AppPassword("Telefon", T2, null));
    }

    /** 019 (FR-019-05, -21): API ključi po času nastanka, skupine po naslovu, statistika po dnevih; brez ključa. */
    @Test
    void apiKeysAreListedByCreationTimeWithScopeTimesAndDailyUsage() {
        var day1 = new MyData.ApiKeyUsageDay(java.time.LocalDate.parse("2026-11-14"), 3, 1, 0, 0);
        var day2 = new MyData.ApiKeyUsageDay(java.time.LocalDate.parse("2026-11-15"), 0, 0, 2, 1);
        MyData actual = ExportAssembler.assemble(
                NOW,
                PROFILE,
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(
                        new ExportAssembler.ApiKeyRow(
                                "Skripta",
                                null,
                                List.of(
                                        new MyData.ApiKeyGroup("Zbor", "WRITE"),
                                        new MyData.ApiKeyGroup("Klub", "READ")),
                                T2,
                                null,
                                T3,
                                null,
                                List.of(day2, day1)),
                        new ExportAssembler.ApiKeyRow("Nočni izvoz", "READ", List.of(), T1, T2, null, T3, List.of())));

        assertThat(actual.apiKeys())
                .containsExactly(
                        new MyData.ApiKey("Nočni izvoz", true, "READ", List.of(), T1, T2, null, T3, List.of()),
                        new MyData.ApiKey(
                                "Skripta",
                                false,
                                null,
                                List.of(
                                        new MyData.ApiKeyGroup("Klub", "READ"),
                                        new MyData.ApiKeyGroup("Zbor", "WRITE")),
                                T2,
                                null,
                                T3,
                                null,
                                List.of(day1, day2)));
    }

    @Test
    void deletedSenderIsWrittenAsDeletedUserWithoutAnyEmail() {
        MyData actual = ExportAssembler.assemble(
                NOW,
                PROFILE,
                List.of(),
                List.of(new ReceivedRow("Društvo", "VIEWER", null, true, T2)),
                List.of(),
                List.of());

        assertThat(actual.receivedInvitations())
                .containsExactly(
                        new ReceivedInvitation("Društvo", "VIEWER", new Sender("izbrisan uporabnik", true), T2));
    }

    @Test
    void senderWithoutNameKeepsNullNameAndIsNotMarkedDeleted() {
        MyData actual = ExportAssembler.assemble(
                NOW,
                PROFILE,
                List.of(),
                List.of(new ReceivedRow("Klub", "ADMIN", null, false, T2)),
                List.of(),
                List.of());

        assertThat(actual.receivedInvitations().getFirst().sender()).isEqualTo(new Sender(null, false));
    }

    @Test
    void emptySectionsStayEmptyListsAndNullPreferencesStayNull() {
        MyData actual = ExportAssembler.assemble(
                NOW,
                new ProfileRow(null, "nov@primer.si", T1, null, null, null, null, null),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        assertThat(actual.profile()).isEqualTo(new Profile(null, "nov@primer.si", T1, null, null, null, null, null));
        assertThat(actual.memberships()).isEmpty();
        assertThat(actual.receivedInvitations()).isEmpty();
        assertThat(actual.sentInvitations()).isEmpty();
        assertThat(actual.ownedGroups()).isEmpty();
    }

    @Test
    void ownedArchivedGroupHasArchivedState() {
        MyData actual = ExportAssembler.assemble(
                NOW, PROFILE, List.of(), List.of(), List.of(), List.of(new OwnedRow("Arhiv", null, "tinta", true, T1)));

        assertThat(actual.ownedGroups()).containsExactly(new OwnedGroup("Arhiv", null, "tinta", "ARCHIVED", T1));
    }

    @Test
    void entriesAreOrderedByDateThenTitleDeterministically() {
        MyData actual = ExportAssembler.assemble(
                NOW,
                PROFILE,
                List.of(
                        new MembershipRow("B skupina", "VIEWER", T2, false, true),
                        new MembershipRow("A skupina", "VIEWER", T2, false, true),
                        new MembershipRow("Prva", "VIEWER", T1, false, true)),
                List.of(),
                List.of(),
                List.of());

        assertThat(actual.memberships())
                .extracting(Membership::groupTitle)
                .containsExactly("Prva", "A skupina", "B skupina");
    }
}

package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** Grupiranje, razvrščanje in izrez strani skupin dvojnikov (FR-011-07, FR-011-21; research R-04). */
class DuplicateGroupsTest {

    private static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");

    private static UUID id(int n) {
        return new UUID(0, n);
    }

    private static Instant at(int seconds) {
        return T0.plusSeconds(seconds);
    }

    private static DuplicateCandidate byEmail(int n, String email, int seconds) {
        return new DuplicateCandidate(id(n), "Ime" + n, "Priimek" + n, email, null, at(seconds));
    }

    private static List<UUID> ids(DuplicateGroup group) {
        return group.contacts().stream().map(DuplicateContact::id).toList();
    }

    private static List<String> values(DuplicatePage page) {
        return page.groups().stream().map(g -> g.reason().value()).toList();
    }

    @Test
    @Tag("FR-011-07")
    void threeContactsWithTheSameKeyAreOneGroupAndSingletonsAreOmitted() {
        List<DuplicateCandidate> candidates = List.of(
                byEmail(1, "a@primer.si", 1),
                byEmail(2, "A@primer.si", 2),
                byEmail(3, " a@primer.si", 3),
                byEmail(4, "drug@primer.si", 4));

        DuplicatePage page = DuplicateGroups.build("email", candidates, 0, 25);

        assertThat(page.total()).isEqualTo(1);
        assertThat(page.groups()).hasSize(1);
        assertThat(page.groups().get(0).size()).isEqualTo(3);
        assertThat(ids(page.groups().get(0))).containsExactly(id(1), id(2), id(3));
        assertThat(page.category()).isEqualTo("email");
        assertThat(page.page()).isZero();
        assertThat(page.size()).isEqualTo(25);
    }

    @Test
    @Tag("FR-011-07")
    void everyContactIsInAtMostOneGroup() {
        List<DuplicateCandidate> candidates = List.of(
                byEmail(1, "a@primer.si", 1),
                byEmail(2, "b@primer.si", 2),
                byEmail(3, "a@primer.si", 3),
                byEmail(4, "b@primer.si", 4),
                byEmail(5, "c@primer.si", 5));

        DuplicatePage page = DuplicateGroups.build("email", candidates, 0, 25);

        List<UUID> all = page.groups().stream().flatMap(g -> ids(g).stream()).toList();
        assertThat(all).containsExactlyInAnyOrder(id(1), id(2), id(3), id(4)).doesNotHaveDuplicates();
    }

    @Test
    @Tag("FR-011-07")
    void contactsInAGroupAreOrderedByCreatedAtThenById() {
        List<DuplicateCandidate> candidates = List.of(
                byEmail(9, "a@primer.si", 5),
                byEmail(3, "a@primer.si", 7),
                byEmail(7, "a@primer.si", 5),
                byEmail(1, "a@primer.si", 6));

        DuplicatePage page = DuplicateGroups.build("email", candidates, 0, 25);

        assertThat(ids(page.groups().get(0))).containsExactly(id(7), id(9), id(1), id(3));
    }

    @Test
    @Tag("FR-011-07")
    void theReasonValueIsTheNonNormalizedValueOfTheFirstContact() {
        List<DuplicateCandidate> byAge = List.of(byEmail(1, "janez@primer.si", 2), byEmail(2, "Janez@Primer.si", 1));
        assertThat(DuplicateGroups.build("email", byAge, 0, 25).groups().get(0).reason())
                .isEqualTo(new DuplicateGroup.Reason("email", "Janez@Primer.si"));

        List<DuplicateCandidate> names = List.of(
                new DuplicateCandidate(id(1), "Janez", "Novak", null, null, at(1)),
                new DuplicateCandidate(id(2), " janez ", "NOVAK", null, null, at(2)));
        DuplicateGroup group =
                DuplicateGroups.build("name", names, 0, 25).groups().get(0);
        assertThat(group.reason()).isEqualTo(new DuplicateGroup.Reason("name", "Janez Novak"));
        assertThat(group.contacts().get(0).displayName()).isEqualTo("Janez Novak");

        List<DuplicateCandidate> phones = List.of(
                new DuplicateCandidate(id(1), "A", "A", null, "+386 41 123 456", at(1)),
                new DuplicateCandidate(id(2), "B", "B", null, "00386 41-123-456", at(2)));
        assertThat(DuplicateGroups.build("phone", phones, 0, 25).groups().get(0).reason())
                .isEqualTo(new DuplicateGroup.Reason("phone", "+386 41 123 456"));
    }

    @Test
    @Tag("FR-011-07")
    void groupsAreSortedByReasonValueInSlovenianIgnoringCase() {
        List<String> shuffled = List.of("Tomšič", "Šuštar", "Cerar", "Sever", "čeh", "Dolenc");
        List<DuplicateCandidate> candidates = new ArrayList<>();
        int n = 1;
        for (String value : shuffled) {
            candidates.add(byEmail(n, value, n));
            candidates.add(byEmail(n + 100, value, n + 100));
            n++;
        }

        DuplicatePage page = DuplicateGroups.build("email", candidates, 0, 25);

        assertThat(values(page)).containsExactly("Cerar", "čeh", "Dolenc", "Sever", "Šuštar", "Tomšič");
    }

    @Test
    @Tag("FR-011-07")
    void groupsWithEqualReasonValuesIgnoringCaseAreOrderedByCreatedAtThenByIdOfTheFirstContact() {
        // »ana« in »Ana« sta različna ključa imena (priimek proti imenu), a enaka vrednost razloga brez ozira na
        // velikost.
        DuplicateCandidate lower1 = new DuplicateCandidate(id(1), "ana", null, null, null, at(10));
        DuplicateCandidate lower2 = new DuplicateCandidate(id(2), "ana", null, null, null, at(11));
        DuplicateCandidate upper1 = new DuplicateCandidate(id(3), null, "Ana", null, null, at(5));
        DuplicateCandidate upper2 = new DuplicateCandidate(id(4), null, "Ana", null, null, at(6));

        DuplicatePage page = DuplicateGroups.build("name", List.of(lower1, lower2, upper1, upper2), 0, 25);

        assertThat(values(page)).containsExactly("Ana", "ana");
        assertThat(page.groups().get(0).contacts().get(0).id()).isEqualTo(id(3));

        // enak created_at prvega kontakta: odloči id prvega kontakta
        DuplicateCandidate sameTime1 = new DuplicateCandidate(id(8), "ana", null, null, null, at(1));
        DuplicateCandidate sameTime2 = new DuplicateCandidate(id(9), "ana", null, null, null, at(2));
        DuplicateCandidate sameTime3 = new DuplicateCandidate(id(5), null, "Ana", null, null, at(1));
        DuplicateCandidate sameTime4 = new DuplicateCandidate(id(6), null, "Ana", null, null, at(2));
        DuplicatePage tie = DuplicateGroups.build("name", List.of(sameTime1, sameTime2, sameTime3, sameTime4), 0, 25);
        assertThat(values(tie)).containsExactly("Ana", "ana");
        assertThat(tie.groups().get(0).contacts().get(0).id()).isEqualTo(id(5));
    }

    private static List<DuplicateCandidate> thirtyGroups() {
        List<DuplicateCandidate> candidates = new ArrayList<>();
        for (int g = 1; g <= 30; g++) {
            String email = String.format("skupina%02d@primer.si", g);
            candidates.add(byEmail(g, email, g));
            candidates.add(byEmail(g + 1000, email, g + 1000));
        }
        return candidates;
    }

    @Test
    @Tag("FR-011-07")
    void aPageHoldsAtMostSizeGroupsAndTotalCountsAllGroups() {
        List<DuplicateCandidate> candidates = thirtyGroups();

        DuplicatePage first = DuplicateGroups.build("email", candidates, 0, 25);
        DuplicatePage second = DuplicateGroups.build("email", candidates, 1, 25);
        DuplicatePage third = DuplicateGroups.build("email", candidates, 2, 25);

        assertThat(first.groups()).hasSize(25);
        assertThat(second.groups()).hasSize(5);
        assertThat(third.groups()).isEmpty();
        for (DuplicatePage page : List.of(first, second, third)) {
            assertThat(page.total()).isEqualTo(30);
            assertThat(page.size()).isEqualTo(25);
        }
        assertThat(first.page()).isZero();
        assertThat(second.page()).isEqualTo(1);
        assertThat(third.page()).isEqualTo(2);
    }

    @Test
    @Tag("FR-011-07")
    void pagesTogetherCoverAllGroupsWithoutRepeating() {
        List<DuplicateCandidate> candidates = thirtyGroups();
        Set<String> seen = new HashSet<>();
        int count = 0;

        for (int page = 0; page < 3; page++) {
            for (DuplicateGroup group :
                    DuplicateGroups.build("email", candidates, page, 25).groups()) {
                seen.add(group.reason().value());
                count++;
            }
        }

        assertThat(count).isEqualTo(30);
        assertThat(seen).hasSize(30);
        // vrstni red je enak tistemu na eni strani
        List<String> whole = values(DuplicateGroups.build("email", candidates, 0, 100));
        List<String> joined = new ArrayList<>(values(DuplicateGroups.build("email", candidates, 0, 25)));
        joined.addAll(values(DuplicateGroups.build("email", candidates, 1, 25)));
        assertThat(joined).isEqualTo(whole);
    }

    @Test
    @Tag("FR-011-07")
    void sizeOneHundredPutsAllGroupsOnOnePage() {
        DuplicatePage page = DuplicateGroups.build("email", thirtyGroups(), 0, 100);

        assertThat(page.groups()).hasSize(30);
        assertThat(page.total()).isEqualTo(30);
        assertThat(page.size()).isEqualTo(100);
    }
}

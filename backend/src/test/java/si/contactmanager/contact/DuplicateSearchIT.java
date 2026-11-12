package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.DuplicateApiTest;

/**
 * Iskanje dvojnikov prek HTTP (FR-011-02 … FR-011-07; data-model.md – DuplicatePage): ključi ujemanja po kategorijah,
 * razvrščanje in razčlenjevanje na strani, izolacija skupin, neveljavni parametri. Iskanje je samo branje.
 */
@Tag("FR-011-02")
class DuplicateSearchIT extends DuplicateApiTest {

    private static final Instant BASE = Instant.parse("2026-02-01T10:00:00Z");

    private int seq;

    /** Naslednji čas ustvarjanja: vsak kontakt dobi svojo sekundo, zato je vrstni red določen. */
    private Instant next() {
        return BASE.plusSeconds(++seq);
    }

    private UUID add(Scenario s, String first, String last, String email, String phone) {
        return contacts.insertContact(s.group(), s.id(Who.OWNER), first, last, email, phone, next());
    }

    private Map<String, Object> search(Scenario s, String... pairs) throws Exception {
        HttpResponse<String> response = duplicates(s.token(Who.EDITOR), s.group(), pairs);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return json(response.body());
    }

    private static List<Map<String, Object>> groupsOf(Map<String, Object> page) {
        return asObjects(page.get("groups"));
    }

    private static List<String> idsOf(Map<String, Object> group) {
        return asObjects(group.get("contacts")).stream()
                .map(contact -> (String) contact.get("id"))
                .toList();
    }

    @Test
    @Tag("FR-011-04")
    void emailSearchReturnsOneGroupOfTwoContactsInCreationOrder() throws Exception {
        Scenario s = scenario();
        UUID first = add(s, "Janez", "Novak", "janez@primer.si", null);
        UUID second = add(s, "janez", "novak", "JANEZ@primer.si", null);
        add(s, "Ana", "Kos", "ana@primer.si", null);
        Snapshot before = snapshot(s.group());

        Map<String, Object> page = search(s, "category", "email");

        assertThat(page).containsEntry("category", "email").containsEntry("total", 1);
        assertThat(page).containsEntry("page", 0).containsEntry("size", 25);
        List<Map<String, Object>> groups = groupsOf(page);
        assertThat(groups).hasSize(1);
        Map<String, Object> group = groups.get(0);
        assertThat(asObject(group.get("reason")))
                .containsEntry("category", "email")
                .containsEntry("value", "janez@primer.si");
        assertThat(group).containsEntry("size", 2);
        assertThat(idsOf(group)).containsExactly(first.toString(), second.toString());
        assertThat(asObjects(group.get("contacts")))
                .extracting(contact -> contact.get("displayName"))
                .containsExactly("Janez Novak", "janez novak");
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-011-03")
    void nameSearchIgnoresCaseWhitespaceAndDiacriticsButNotWordOrder() throws Exception {
        Scenario s = scenario();
        UUID plain = add(s, "Janez", "Novak", null, null);
        UUID spaced = add(s, " janez  ", "  NOVAK ", null, null);
        UUID accented = add(s, "Janez", "Nóvak", null, null);
        UUID swapped = add(s, "Novak", "Janez", null, null);

        Map<String, Object> page = search(s, "category", "name");

        assertThat(page).containsEntry("total", 1);
        Map<String, Object> group = groupsOf(page).get(0);
        assertThat(asObject(group.get("reason")))
                .containsEntry("category", "name")
                .containsEntry("value", "Janez Novak");
        assertThat(idsOf(group)).containsExactly(plain.toString(), spaced.toString(), accented.toString());
        assertThat(idsOf(group)).doesNotContain(swapped.toString());
    }

    @Test
    @Tag("FR-011-04")
    void emailSearchIgnoresLetterCaseAndShowsTheFirstContactsValue() throws Exception {
        Scenario s = scenario();
        UUID upper = add(s, "Ana", "Kos", "Janez@Primer.si", null);
        UUID lower = add(s, "Bojan", "Breg", "janez@primer.si", null);

        Map<String, Object> group = groupsOf(search(s, "category", "email")).get(0);

        assertThat(asObject(group.get("reason"))).containsEntry("value", "Janez@Primer.si");
        assertThat(idsOf(group)).containsExactly(upper.toString(), lower.toString());
    }

    @Test
    @Tag("FR-011-05")
    void phoneSearchComparesDigitsOnlyAndDropsTheInternationalPrefix() throws Exception {
        Scenario s = scenario();
        UUID plus = add(s, "Ana", "Kos", null, "+386 41 123 456");
        UUID zeros = add(s, "Bojan", "Breg", null, "00386 41-123-456");
        UUID national = add(s, "Cene", "Cerar", null, "(041) 123 456");

        Map<String, Object> page = search(s, "category", "phone");

        assertThat(page).containsEntry("total", 1);
        Map<String, Object> group = groupsOf(page).get(0);
        assertThat(asObject(group.get("reason")))
                .containsEntry("category", "phone")
                .containsEntry("value", "+386 41 123 456");
        assertThat(idsOf(group)).containsExactly(plus.toString(), zeros.toString());
        assertThat(idsOf(group)).doesNotContain(national.toString());
    }

    @Test
    @Tag("FR-011-06")
    void contactsWithoutTheSearchedValueAreNeverDuplicates() throws Exception {
        Scenario s = scenario();
        add(s, "Ana", "Kos", null, "()");
        add(s, "Bojan", "Breg", null, "( )");
        add(s, "Cene", "Cerar", null, "()");

        Map<String, Object> byEmail = search(s, "category", "email");
        Map<String, Object> byPhone = search(s, "category", "phone");

        assertThat(byEmail).containsEntry("total", 0);
        assertThat(groupsOf(byEmail)).isEmpty();
        assertThat(byPhone).containsEntry("total", 0);
        assertThat(groupsOf(byPhone)).isEmpty();
    }

    @Test
    @Tag("FR-011-07")
    void pagesHoldTwentyFiveGroupsInAlphabeticalOrderAndEveryContactAppearsOnce() throws Exception {
        Scenario s = scenario();
        List<String> values = new ArrayList<>();
        for (int pair = 1; pair <= 30; pair++) {
            String email = "par" + String.format("%02d", pair) + "@primer.si";
            values.add(email);
            add(s, "Ime" + pair, "A", email, null);
            add(s, "Ime" + pair, "B", email, null);
        }
        Map<String, Object> first = search(s, "category", "email");
        Map<String, Object> second = search(s, "category", "email", "page", "1");
        Map<String, Object> wide = search(s, "category", "email", "size", "50");

        assertThat(first).containsEntry("total", 30).containsEntry("page", 0).containsEntry("size", 25);
        assertThat(groupsOf(first)).hasSize(25);
        assertThat(second).containsEntry("total", 30).containsEntry("page", 1);
        assertThat(groupsOf(second)).hasSize(5);
        assertThat(wide).containsEntry("size", 50);
        assertThat(groupsOf(wide)).hasSize(30);

        List<String> shownValues = new ArrayList<>();
        Set<String> contactIds = new HashSet<>();
        int contactCount = 0;
        for (Map<String, Object> group : concat(groupsOf(first), groupsOf(second))) {
            shownValues.add((String) asObject(group.get("reason")).get("value"));
            assertThat(group).containsEntry("size", 2);
            contactIds.addAll(idsOf(group));
            contactCount += idsOf(group).size();
        }
        assertThat(shownValues).containsExactlyElementsOf(values);
        assertThat(contactIds).hasSize(60);
        assertThat(contactCount).isEqualTo(60);
    }

    private static List<Map<String, Object>> concat(List<Map<String, Object>> a, List<Map<String, Object>> b) {
        List<Map<String, Object>> all = new ArrayList<>(a);
        all.addAll(b);
        return all;
    }

    @Test
    @Tag("FR-011-07")
    void threeContactsWithTheSameEmailFormOneGroup() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 3, "trije@primer.si");

        Map<String, Object> page = search(s, "category", "email");

        assertThat(page).containsEntry("total", 1);
        Map<String, Object> group = groupsOf(page).get(0);
        assertThat(group).containsEntry("size", 3);
        assertThat(idsOf(group))
                .containsExactlyElementsOf(ids.stream().map(UUID::toString).toList());
    }

    @Test
    @Tag("FR-011-02")
    void aGroupWithoutDuplicatesAndAPagePastTheLastReturnEmptyResults() throws Exception {
        Scenario s = scenario();
        add(s, "Ana", "Kos", "ana@primer.si", null);
        add(s, "Bojan", "Breg", "bojan@primer.si", null);

        Map<String, Object> none = search(s, "category", "email");

        assertThat(none).containsEntry("total", 0);
        assertThat(groupsOf(none)).isEmpty();

        contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, "dva@primer.si");
        contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, "tri@primer.si");
        Map<String, Object> past = search(s, "category", "email", "page", "5");

        assertThat(past).containsEntry("total", 2).containsEntry("page", 5);
        assertThat(groupsOf(past)).isEmpty();
    }

    @Test
    @Tag("FR-011-02")
    void contactsOfAnotherGroupWithTheSameEmailDoNotFormAGroup() throws Exception {
        Scenario s = scenario();
        Scenario other = scenario();
        add(s, "Ana", "Kos", "skupno@primer.si", null);
        contacts.insertContact(other.group(), other.id(Who.OWNER), "Bojan", "Breg", "skupno@primer.si", null, next());
        Snapshot before = snapshot(s.group());
        Snapshot otherBefore = snapshot(other.group());

        Map<String, Object> page = search(s, "category", "email");

        assertThat(page).containsEntry("total", 0);
        assertThat(groupsOf(page)).isEmpty();
        assertUnchanged(before, snapshot(s.group()));
        assertUnchanged(otherBefore, snapshot(other.group()));
    }

    @Test
    @Tag("FR-011-02")
    void invalidParametersAreRejectedWithFieldAndCodeAndNothingChanges() throws Exception {
        Scenario s = scenario();
        contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, "dva@primer.si");
        Snapshot before = snapshot(s.group());
        String token = s.token(Who.EDITOR);

        assertRejected(duplicates(token, s.group()), "category", "REQUIRED");
        assertRejected(duplicates(token, s.group(), "category", "foo"), "category", "INVALID_VALUE");
        assertRejected(duplicates(token, s.group(), "category", "email", "size", "7"), "size", "INVALID_VALUE");
        assertRejected(duplicates(token, s.group(), "category", "email", "page", "-1"), "page", "INVALID_VALUE");
        assertRejected(duplicates(token, s.group(), "category", "email", "page", "x"), "page", "INVALID_VALUE");

        assertUnchanged(before, snapshot(s.group()));
    }

    private void assertRejected(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body())).containsEntry(field, code);
    }

    @Test
    @Tag("FR-011-02")
    void searchingWritesNoAuditEntry() throws Exception {
        Scenario s = scenario();
        contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, "dva@primer.si");
        int entries = audit.count(s.group());

        IntStream.range(0, 3).forEach(i -> {
            try {
                search(s, "category", "email");
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });

        assertThat(audit.count(s.group())).isEqualTo(entries);
    }
}

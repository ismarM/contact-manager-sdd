package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.DuplicateApiTest;

/**
 * Primerjava kontaktov prek HTTP (FR-011-08, FR-011-20, FR-011-21; data-model.md – Comparison): trenutni podatki in
 * verzije po {@code created_at}, {@code id}; izbrisani kontakti (v sledi) so izpuščeni, tuji dajo {@code 404}; mejne
 * vrednosti števila identitet. Primerjava je samo branje.
 */
@Tag("FR-011-08")
class DuplicateCompareIT extends DuplicateApiTest {

    private static final Instant BASE = Instant.parse("2026-02-01T10:00:00Z");

    private List<Map<String, Object>> compared(Scenario s, List<UUID> ids) throws Exception {
        HttpResponse<String> response = compare(s.token(Who.EDITOR), s.group(), ids);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return asObjects(json(response.body()).get("contacts"));
    }

    private static List<String> idsOf(List<Map<String, Object>> contacts) {
        return contacts.stream().map(contact -> (String) contact.get("id")).toList();
    }

    private void assertRejected(HttpResponse<String> response, String field, String code) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body())).containsEntry(field, code);
    }

    @Test
    void contactsAreReturnedInCreationOrderWithAllCurrentValues() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        UUID a = contacts.insertContact(s.group(), owner, "Ana", "Kos", "ana@primer.si", "041 111 111", BASE);
        UUID b = contacts.insertContact(
                s.group(), owner, "Bojan", "Breg", "bojan@primer.si", "041 222 222", BASE.plusSeconds(5));
        UUID c = contacts.insertContact(s.group(), owner, "Cene", "Cerar", null, null, BASE.plusSeconds(9));
        jdbc.update("update contact set address = ? where id = ?", "Ulica 1, Ljubljana", a);
        contacts.addAttribute(a, 0, "Zadnji", "z");
        contacts.addAttribute(a, 1, "Prvi", "p");
        contacts.addTag(a, 0, "b");
        contacts.addTag(a, 1, "a");
        contacts.addAttribute(c, 0, "Oddelek", "IT");
        contacts.addTag(c, 0, "vip");
        contacts.editedByOther(b, owner, "041 333 333");
        Snapshot before = snapshot(s.group());

        List<Map<String, Object>> result = compared(s, List.of(c, a, b));

        assertThat(idsOf(result)).containsExactly(a.toString(), b.toString(), c.toString());
        Map<String, Object> first = result.get(0);
        assertThat(first)
                .containsEntry("version", 0)
                .containsEntry("firstName", "Ana")
                .containsEntry("lastName", "Kos")
                .containsEntry("address", "Ulica 1, Ljubljana")
                .containsEntry("email", "ana@primer.si")
                .containsEntry("phone", "041 111 111")
                .containsEntry("tags", List.of("b", "a"));
        assertThat(OffsetDateTime.parse((String) first.get("createdAt")).toInstant())
                .isEqualTo(BASE);
        assertThat(asObjects(first.get("attributes")))
                .containsExactly(Map.of("key", "Zadnji", "value", "z"), Map.of("key", "Prvi", "value", "p"));
        Map<String, Object> second = result.get(1);
        assertThat(second)
                .containsEntry("version", 1)
                .containsEntry("firstName", "Bojan")
                .containsEntry("phone", "041 333 333")
                .containsEntry("tags", List.of());
        assertThat(second.get("address")).isNull();
        assertThat(asObjects(second.get("attributes"))).isEmpty();
        Map<String, Object> third = result.get(2);
        assertThat(third).containsEntry("version", 0).containsEntry("firstName", "Cene");
        assertThat(third.get("email")).isNull();
        assertThat(third.get("phone")).isNull();
        assertThat(third).containsEntry("tags", List.of("vip"));
        assertThat(asObjects(third.get("attributes"))).containsExactly(Map.of("key", "Oddelek", "value", "IT"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    void contactsWithTheSameCreationTimeAreOrderedByIdAscending() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        UUID one = contacts.insertContact(s.group(), owner, "Ana", "Kos", "a@primer.si", null, BASE);
        UUID two = contacts.insertContact(s.group(), owner, "Bojan", "Breg", "a@primer.si", null, BASE);
        List<String> expected = new ArrayList<>(List.of(one.toString(), two.toString()));
        expected.sort(Comparator.naturalOrder());

        List<Map<String, Object>> asked =
                compared(s, List.of(UUID.fromString(expected.get(1)), UUID.fromString(expected.get(0))));

        assertThat(idsOf(asked)).containsExactlyElementsOf(expected);
    }

    @Test
    @Tag("FR-011-21")
    void tenIdentitiesAreAcceptedAndElevenAreRejected() throws Exception {
        Scenario s = scenario();
        List<UUID> eleven = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 11, "x@primer.si");
        Snapshot before = snapshot(s.group());

        List<Map<String, Object>> ten = compared(s, eleven.subList(0, 10));
        HttpResponse<String> tooMany = compare(s.token(Who.EDITOR), s.group(), eleven);

        assertThat(ten).hasSize(10);
        assertRejected(tooMany, "ids", "TOO_MANY");
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-011-21")
    void fewerThanTwoRepeatedOrMalformedIdentitiesAreRejected() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, "x@primer.si");
        UUID a = ids.get(0);
        String token = s.token(Who.EDITOR);
        Snapshot before = snapshot(s.group());

        assertRejected(compareRaw(token, s.group(), ""), "ids", "REQUIRED");
        assertRejected(compareRaw(token, s.group(), "ids=" + a), "ids", "REQUIRED");
        assertRejected(compareRaw(token, s.group(), "ids=" + a + "," + a), "ids", "DUPLICATE");
        assertRejected(compareRaw(token, s.group(), "ids=" + a + ",ni-uuid"), "ids", "INVALID_VALUE");

        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    void aContactDeletedThroughTheApiIsSkippedInsteadOfFailing() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = new ArrayList<>();
        for (String name : List.of("Ana", "Bojan", "Cene")) {
            ids.add(UUID.fromString((String) createViaApi(s, input(name, "Kos")).get("id")));
        }
        assertDeleted(s, ids.get(1));

        List<Map<String, Object>> two = compared(s, ids);

        assertThat(idsOf(two)).containsExactly(ids.get(0).toString(), ids.get(2).toString());

        assertDeleted(s, ids.get(0));
        List<Map<String, Object>> one = compared(s, ids);

        assertThat(idsOf(one)).containsExactly(ids.get(2).toString());
    }

    private void assertDeleted(Scenario s, UUID id) throws Exception {
        HttpResponse<String> response = delete(contactPath(s.group(), id) + "?version=0", s.token(Who.EDITOR));
        assertThat(response.statusCode()).as(response.body()).isBetween(200, 204);
        assertThat(contacts.exists(id)).isFalse();
    }

    @Test
    @Tag("FR-011-20")
    void aContactOfAnotherGroupOrAMadeUpIdentityGives404WithoutBodyForEveryRole() throws Exception {
        Scenario s = scenario();
        Scenario other = scenario();
        List<UUID> own = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, "x@primer.si");
        UUID foreign =
                contacts.insertContact(other.group(), other.id(Who.OWNER), "Tuj", "Kontakt", "x@primer.si", null, BASE);
        Snapshot before = snapshot(s.group());
        Snapshot otherBefore = snapshot(other.group());

        for (Who who : List.of(Who.EDITOR, Who.VIEWER)) {
            HttpResponse<String> withForeign =
                    compare(s.token(who), s.group(), List.of(own.get(0), own.get(1), foreign));
            HttpResponse<String> madeUp =
                    compare(s.token(who), s.group(), List.of(own.get(0), own.get(1), UUID.randomUUID()));

            assertThat(withForeign.statusCode()).as(who.name()).isEqualTo(404);
            assertThat(withForeign.body()).isEmpty();
            assertThat(madeUp.statusCode()).as(who.name()).isEqualTo(404);
            assertThat(madeUp.body()).isEmpty();
        }
        assertUnchanged(before, snapshot(s.group()));
        assertUnchanged(otherBefore, snapshot(other.group()));
    }

    @Test
    void comparingNeverChangesAnythingOrWritesAnAuditEntry() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 3, "x@primer.si");
        Snapshot before = snapshot(s.group());

        compared(s, ids);
        compared(s, ids.subList(0, 2));

        assertUnchanged(before, snapshot(s.group()));
    }
}

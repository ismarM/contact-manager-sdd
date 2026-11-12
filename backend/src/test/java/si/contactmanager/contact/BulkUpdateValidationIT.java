package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.BulkApiTest;

/**
 * Atomarnost in validacija množičnega urejanja (FR-009-04, -09, -17; SC-003): kršitev pri katerem koli kontaktu ali
 * neveljaven zahtevek → {@code 400}, nič se ne spremeni, vnos sledi ne nastane.
 */
class BulkUpdateValidationIT extends BulkApiTest {

    private static final List<String> THIRTY =
            IntStream.rangeClosed(1, 30).mapToObj(i -> "t" + i).toList();

    private UUID withThirtyTags(Scenario s, String first, String last) {
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), first, last);
        contacts.addTags(id, THIRTY.toArray(String[]::new));
        return id;
    }

    @Test
    @Tag("FR-009-09")
    @Tag("FR-009-17")
    void oneContactWithTooManyTagsRejectsTheWholeOperationAndNamesTheContact() throws Exception {
        Scenario s = scenario();
        List<UUID> all = new ArrayList<>(contacts.insertMany(s.group(), s.id(Who.OWNER), 4));
        UUID mojca = withThirtyTags(s, "Mojca", "Kralj");
        all.add(mojca);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(all, "addTags", List.of("nova")));

        assertThat(response.statusCode()).isEqualTo(400);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "VALIDATION_FAILED");
        assertThat(asObjects(body.get("errors"))).isEmpty();
        List<Map<String, Object>> perContact = asObjects(body.get("contacts"));
        assertThat(perContact).hasSize(1);
        assertThat(perContact.get(0))
                .containsEntry("contactId", mojca.toString())
                .containsEntry("displayName", "Mojca Kralj");
        assertThat(asObjects(perContact.get(0).get("errors")))
                .containsExactly(Map.of("field", "tags", "code", "TOO_MANY"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-09")
    void everyAffectedContactIsListedSortedBySlovenianAlphabetOfTheDisplayName() throws Exception {
        Scenario s = scenario();
        List<String> lastNames = List.of(
                "Zupan", "Žagar", "Čeh", "Cene", "Šuligoj", "Sever", "Horvat", "Kralj", "Novak", "Božič", "Bizjak",
                "Dolenc");
        List<UUID> all = new ArrayList<>();
        for (String last : lastNames) {
            all.add(withThirtyTags(s, "Ana", last));
        }
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(all, "addTags", List.of("nova")));

        assertThat(response.statusCode()).isEqualTo(400);
        List<Map<String, Object>> perContact = asObjects(json(response.body()).get("contacts"));
        assertThat(perContact)
                .extracting(c -> c.get("displayName"))
                .containsExactly(
                        "Ana Bizjak",
                        "Ana Božič",
                        "Ana Cene",
                        "Ana Čeh",
                        "Ana Dolenc",
                        "Ana Horvat",
                        "Ana Kralj",
                        "Ana Novak",
                        "Ana Sever",
                        "Ana Šuligoj",
                        "Ana Zupan",
                        "Ana Žagar");
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-09")
    void fiftyAttributesPlusANewKeyIsTooManyForThatContactOnly() throws Exception {
        Scenario s = scenario();
        UUID full = contacts.insert(s.group(), s.id(Who.OWNER), "Polni", "Kontakt");
        for (int i = 0; i < 50; i++) {
            contacts.addAttribute(full, i, "k" + i, "v");
        }
        UUID other = contacts.insert(s.group(), s.id(Who.OWNER), "Drugi", "Kontakt");
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(List.of(full, other), "attributes", List.of(attributeSet("custom", "nov", "x"))));

        assertThat(response.statusCode()).isEqualTo(400);
        List<Map<String, Object>> perContact = asObjects(json(response.body()).get("contacts"));
        assertThat(perContact).hasSize(1);
        assertThat(perContact.get(0)).containsEntry("contactId", full.toString());
        assertThat(asObjects(perContact.get(0).get("errors")))
                .containsExactly(Map.of("field", "attributes", "code", "TOO_MANY"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-07")
    void aValueInvalidForItsFieldIsARequestErrorWithoutPerContactErrors() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 3);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(all, "attributes", List.of(attributeSet("email", null, "ni-veljaven"))));

        assertThat(response.statusCode()).isEqualTo(400);
        Map<String, Object> body = json(response.body());
        assertThat(asObjects(body.get("errors")))
                .containsExactly(Map.of("field", "attributes[0].value", "code", "INVALID_VALUE"));
        assertThat(body).doesNotContainKey("contacts");
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-07")
    void firstNameIsNotAnAllowedField() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 2);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(all, "attributes", List.of(attributeSet("firstName", null, "Nov"))));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].field", "code", "INVALID_VALUE"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-04")
    void anEmptySelectionIsRejected() throws Exception {
        Scenario s = scenario();
        contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(List.of(), "addTags", List.of("nova")));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .contains(Map.of("field", "contactIds", "code", "REQUIRED"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-04")
    void moreThanTenThousandIdentitiesAreRejected() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 10_001);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(all, "addTags", List.of("nova")));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .contains(Map.of("field", "contactIds", "code", "TOO_MANY"));
        assertUnchanged(before, snapshot(s.group()));
    }

    @Test
    @Tag("FR-009-06")
    void aRequestWithoutAnyOperationIsRejected() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 2);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = bulkUpdate(s.token(Who.EDITOR), s.group(), request(all));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .containsExactly(Map.of("field", "body", "code", "EMPTY_OPERATION"));
        assertUnchanged(before, snapshot(s.group()));
    }
}

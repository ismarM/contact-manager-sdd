package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactApiTest;

/** Ustvarjanje kontakta prek {@code POST /api/groups/{groupId}/contacts} (FR-004-01, FR-004-02, FR-004-14). */
class ContactCreateIT extends ContactApiTest {

    @Test
    @Tag("FR-004-01")
    void editorCreatesContactWithAttributesAndTagsInThatGroup() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Janez", "Novak");
        input.put("address", "Ulica 1\n1000 Ljubljana");
        input.put("email", "janez@primer.si");
        input.put("phone", "+386 1 234 56 78");
        input.put(
                "attributes",
                List.of(Map.of("key", "kompetenca", "value", "web dev"), Map.of("key", "Oddelek", "value", "IT")));
        input.put("tags", List.of("ne_obveščaj", "konferenca2025"));

        HttpResponse<String> response = post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));

        assertThat(response.statusCode()).isEqualTo(201);
        Map<String, Object> created = json(response.body());
        assertThat(created)
                .containsOnlyKeys(
                        "id",
                        "firstName",
                        "lastName",
                        "displayName",
                        "address",
                        "email",
                        "phone",
                        "attributes",
                        "tags",
                        "version",
                        "createdAt",
                        "updatedAt",
                        "updatedBy")
                .containsEntry("firstName", "Janez")
                .containsEntry("lastName", "Novak")
                .containsEntry("displayName", "Janez Novak")
                .containsEntry("address", "Ulica 1\n1000 Ljubljana")
                .containsEntry("email", "janez@primer.si")
                .containsEntry("phone", "+386 1 234 56 78")
                .containsEntry("version", 0)
                .containsEntry("tags", List.of("ne_obveščaj", "konferenca2025"))
                .containsEntry(
                        "attributes",
                        List.of(
                                Map.of("key", "kompetenca", "value", "web dev"),
                                Map.of("key", "Oddelek", "value", "IT")));
        assertThat(created.get("updatedBy"))
                .isEqualTo(Map.of(
                        "name",
                        "EDITOR",
                        "email",
                        groups.email(s.users().get(Who.EDITOR).uid())));
        UUID id = UUID.fromString((String) created.get("id"));
        assertThat(contacts.row(id)).containsEntry("group_id", s.group()).containsEntry("version", 0L);
        assertThat(contacts.tagsOf(id)).containsExactly("ne_obveščaj", "konferenca2025");
        assertThat(contacts.attributesOf(id))
                .extracting(row -> row.get("key"))
                .containsExactly("kompetenca", "Oddelek");
    }

    @Test
    @Tag("FR-004-01")
    void adminAndOwnerMayCreateToo() throws Exception {
        Scenario s = scenario();

        for (Who who : List.of(Who.ADMIN, Who.OWNER)) {
            HttpResponse<String> response = post(contactsPath(s.group()), s.token(who), body(input("A", who.name())));
            assertThat(response.statusCode()).as(who.name()).isEqualTo(201);
        }
        assertThat(contacts.count(s.group())).isEqualTo(2);
    }

    @Test
    @Tag("FR-004-01")
    @Tag("FR-004-02")
    void firstNameAloneAndLastNameAloneAreEnoughAndValuesAreTrimmed() throws Exception {
        Scenario s = scenario();
        Map<String, Object> onlyFirst = Map.of("firstName", "  Janez  ", "email", "  ", "phone", " 01 234 ");

        HttpResponse<String> first = post(contactsPath(s.group()), s.token(Who.EDITOR), body(onlyFirst));
        HttpResponse<String> last =
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(Map.of("lastName", "Novak")));

        assertThat(first.statusCode()).isEqualTo(201);
        assertThat(json(first.body()))
                .containsEntry("firstName", "Janez")
                .containsEntry("lastName", null)
                .containsEntry("displayName", "Janez")
                .containsEntry("email", null)
                .containsEntry("phone", "01 234")
                .containsEntry("attributes", List.of())
                .containsEntry("tags", List.of());
        assertThat(last.statusCode()).isEqualTo(201);
        assertThat(json(last.body())).containsEntry("displayName", "Novak").containsEntry("firstName", null);
    }

    @Test
    @Tag("FR-004-02")
    void withoutFirstAndLastNameValidationFailsOnBothAndNothingIsStored() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(Map.of("firstName", " ", "email", "a@b.si")));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body()))
                .containsEntry("firstName", "REQUIRED")
                .containsEntry("lastName", "REQUIRED");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("FR-004-02")
    void duplicateKeyIgnoringCaseIsRejectedAtTheSecondRow() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("A", "B");
        input.put(
                "attributes",
                List.of(Map.of("key", "Kompetenca", "value", "1"), Map.of("key", "kompetenca", "value", "2")));

        HttpResponse<String> response = post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("attributes[1].key", "DUPLICATE");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("FR-004-02")
    void invalidEmailPhoneTagAndReservedKeyAreRejectedWithTheFieldName() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("A", "B");
        input.put("email", "janez@");
        input.put("phone", "01 234 abc");
        input.put("tags", List.of("moja znacka"));
        input.put("attributes", List.of(Map.of("key", "E-naslov", "value", "x")));

        HttpResponse<String> response = post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body()))
                .containsEntry("email", "INVALID_VALUE")
                .containsEntry("phone", "INVALID_VALUE")
                .containsEntry("tags[0]", "INVALID_VALUE")
                .containsEntry("attributes[0].key", "RESERVED_KEY");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("FR-004-02")
    void tooManyAttributesOrTagsAreRejected() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("A", "B");
        input.put(
                "attributes",
                IntStream.range(0, 51)
                        .mapToObj(i -> Map.of("key", "k" + i, "value", "v"))
                        .toList());
        input.put("tags", IntStream.range(0, 31).mapToObj(i -> "t" + i).collect(Collectors.toList()));

        HttpResponse<String> response = post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body()))
                .containsEntry("attributes", "TOO_MANY")
                .containsEntry("tags", "TOO_MANY");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("FR-004-02")
    void fiftyAttributesAndThirtyTagsAreStored() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("A", "B");
        input.put(
                "attributes",
                IntStream.range(0, 50)
                        .mapToObj(i -> Map.of("key", "k" + i, "value", "v"))
                        .toList());
        input.put("tags", IntStream.range(0, 30).mapToObj(i -> "t" + i).collect(Collectors.toList()));

        HttpResponse<String> response = post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));

        assertThat(response.statusCode()).isEqualTo(201);
        UUID id = UUID.fromString((String) json(response.body()).get("id"));
        assertThat(contacts.attributeRows(id)).isEqualTo(50);
        assertThat(contacts.tagsOf(id)).hasSize(30);
    }

    @Test
    @Tag("FR-004-02")
    void malformedBodyAndUnknownFieldsAreValidationErrors() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> malformed = post(contactsPath(s.group()), s.token(Who.EDITOR), "{broken");
        HttpResponse<String> unknown =
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(Map.of("firstName", "A", "nickname", "x")));

        assertThat(malformed.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(malformed.body())).containsEntry("body", "MALFORMED");
        assertThat(unknown.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(unknown.body())).containsEntry("nickname", "UNKNOWN_FIELD");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("FR-004-02")
    void emailOfExactly254CharactersIsStoredAnd255IsRejected() throws Exception {
        Scenario s = scenario();
        String exact = "a".repeat(244) + "@primer.si";
        String tooLong = "a".repeat(245) + "@primer.si";
        Map<String, Object> ok = input("A", "B");
        ok.put("email", exact);
        Map<String, Object> rejected = input("C", "D");
        rejected.put("email", tooLong);

        HttpResponse<String> stored = post(contactsPath(s.group()), s.token(Who.EDITOR), body(ok));
        HttpResponse<String> response = post(contactsPath(s.group()), s.token(Who.EDITOR), body(rejected));

        assertThat(stored.statusCode()).isEqualTo(201);
        assertThat(json(stored.body())).containsEntry("email", exact);
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("email", "TOO_LONG");
        assertThat(contacts.count(s.group())).isEqualTo(1);
    }

    @Test
    @Tag("FR-004-01")
    void viewerWithAnInvalidBodyIsForbiddenBeforeValidation() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> invalid =
                post(contactsPath(s.group()), s.token(Who.VIEWER), body(Map.of("email", "janez@")));
        HttpResponse<String> malformed = post(contactsPath(s.group()), s.token(Who.VIEWER), "{broken");

        // feature-map §2.2: 403 (korak 3) pred 400 VALIDATION_FAILED (korak 6).
        for (HttpResponse<String> response : List.of(invalid, malformed)) {
            assertThat(response.statusCode()).isEqualTo(403);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        }
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("FR-004-14")
    void contactBelongsOnlyToTheGroupInThePath() throws Exception {
        Scenario a = scenario();
        Scenario b = scenario();

        HttpResponse<String> response = post(contactsPath(a.group()), a.token(Who.EDITOR), body(input("Samo", "VA")));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(contacts.count(a.group())).isEqualTo(1);
        assertThat(contacts.count(b.group())).isZero();
    }
}

package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.contact.support.ContactApiTest;

/** Urejanje kontakta prek {@code PUT …/contacts/{contactId}} (FR-004-02, FR-004-10, FR-004-11, FR-004-13). */
class ContactUpdateIT extends ContactApiTest {

    /** Kontakt Janez Novak z dvema atributoma in tremi značkami, ustvarjen kot urednik. */
    private Map<String, Object> janez(Scenario s) throws Exception {
        Map<String, Object> input = input("Janez", "Novak");
        input.put("email", "janez@primer.si");
        input.put("phone", "01 234 567");
        input.put(
                "attributes",
                List.of(Map.of("key", "kompetenca", "value", "web dev"), Map.of("key", "Oddelek", "value", "IT")));
        input.put("tags", List.of("vip", "ne_obveščaj", "konferenca2025"));
        return createViaApi(s, input);
    }

    /** Vrednosti obstoječega kontakta kot telo zahtevka (brez verzije). */
    private static Map<String, Object> valuesOf(Map<String, Object> detail) {
        Map<String, Object> values = new LinkedHashMap<>();
        for (String field : List.of("firstName", "lastName", "address", "email", "phone", "attributes", "tags")) {
            values.put(field, detail.get(field));
        }
        return values;
    }

    private static UUID idOf(Map<String, Object> detail) {
        return UUID.fromString((String) detail.get("id"));
    }

    @Test
    @Tag("FR-004-10")
    void changeWithCurrentVersionIsSavedAndIncreasesTheVersion() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        UUID id = idOf(created);
        Timestamp before = (Timestamp) contacts.row(id).get("updated_at");
        Map<String, Object> changed = valuesOf(created);
        changed.put("phone", "031 111 222");
        changed.put("tags", List.of("vip", "konferenca2025"));
        changed.put(
                "attributes",
                List.of(Map.of("key", "Oddelek", "value", "IT"), Map.of("key", "kompetenca", "value", "web dev")));

        HttpResponse<String> response =
                put(contactPath(s.group(), id), s.token(Who.ADMIN), body(withVersion(changed, 0)));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> saved = json(response.body());
        assertThat(saved)
                .containsEntry("id", id.toString())
                .containsEntry("version", 1)
                .containsEntry("phone", "031 111 222")
                .containsEntry("tags", List.of("vip", "konferenca2025"))
                .containsEntry(
                        "attributes",
                        List.of(
                                Map.of("key", "Oddelek", "value", "IT"),
                                Map.of("key", "kompetenca", "value", "web dev")))
                .containsEntry(
                        "updatedBy",
                        Map.of(
                                "name",
                                "ADMIN",
                                "email",
                                groups.email(s.users().get(Who.ADMIN).uid())));
        Map<String, Object> row = contacts.row(id);
        assertThat(row).containsEntry("version", 1L).containsEntry("updated_by", s.id(Who.ADMIN));
        assertThat(((Timestamp) row.get("updated_at")).after(before)).isTrue();
        assertThat(contacts.tagsOf(id)).containsExactly("vip", "konferenca2025");
        assertThat(contacts.attributesOf(id)).extracting(r -> r.get("key")).containsExactly("Oddelek", "kompetenca");
    }

    @Test
    @Tag("FR-004-10")
    void saveWithoutAnyChangeSucceedsAndKeepsVersionEditorAndTime() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        UUID id = idOf(created);
        Map<String, Object> rowBefore = contacts.row(id);
        Map<String, Object> same = valuesOf(created);
        same.put("firstName", "  Janez ");
        same.put("phone", " 01 234 567 ");

        HttpResponse<String> response = put(contactPath(s.group(), id), s.token(Who.ADMIN), body(withVersion(same, 0)));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("version", 0);
        assertThat(contacts.row(id)).isEqualTo(rowBefore);
    }

    @Test
    @Tag("FR-004-10")
    void reorderingTagsIsAChange() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        Map<String, Object> reordered = valuesOf(created);
        reordered.put("tags", List.of("konferenca2025", "ne_obveščaj", "vip"));

        HttpResponse<String> response =
                put(contactPath(s.group(), idOf(created)), s.token(Who.EDITOR), body(withVersion(reordered, 0)));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("version", 1);
    }

    @Test
    @Tag("FR-004-11")
    void staleVersionWithDifferentValuesIsAConflictWithTheCurrentStateAndNothingChanges() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        UUID id = idOf(created);
        contacts.editedByOther(id, s.id(Who.ADMIN), "031 999 888");
        Map<String, Object> rowBefore = contacts.row(id);
        Map<String, Object> mine = valuesOf(created);
        mine.put("phone", "041 000 111");

        HttpResponse<String> response =
                put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(mine, 0)));

        assertThat(response.statusCode()).isEqualTo(409);
        Map<String, Object> conflict = json(response.body());
        assertThat(conflict).containsOnlyKeys("code", "current").containsEntry("code", "VERSION_CONFLICT");
        Map<String, Object> current = asObject(conflict.get("current"));
        assertThat(current)
                .containsEntry("id", id.toString())
                .containsEntry("version", 1)
                .containsEntry("phone", "031 999 888")
                .containsEntry(
                        "updatedBy",
                        Map.of(
                                "name",
                                "ADMIN",
                                "email",
                                groups.email(s.users().get(Who.ADMIN).uid())));
        assertThat(current.get("updatedAt")).isInstanceOf(String.class);
        assertThat(contacts.row(id)).isEqualTo(rowBefore);
    }

    @Test
    @Tag("FR-004-11")
    void staleVersionWithValuesEqualToTheCurrentOnesSucceedsWithoutIncreasingTheVersion() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        UUID id = idOf(created);
        contacts.editedByOther(id, s.id(Who.ADMIN), "031 999 888");
        Map<String, Object> rowBefore = contacts.row(id);
        Map<String, Object> sameAsCurrent = valuesOf(created);
        sameAsCurrent.put("phone", "031 999 888");

        HttpResponse<String> response =
                put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(sameAsCurrent, 0)));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("version", 1).containsEntry("phone", "031 999 888");
        assertThat(contacts.row(id)).isEqualTo(rowBefore);
    }

    @Test
    @Tag("FR-004-11")
    void staleVersionWithInvalidValuesIsAConflictNotAValidationError() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        UUID id = idOf(created);
        contacts.editedByOther(id, s.id(Who.ADMIN), "031 999 888");
        Map<String, Object> invalid = valuesOf(created);
        invalid.put("email", "janez@");

        HttpResponse<String> response =
                put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(invalid, 0)));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).containsEntry("code", "VERSION_CONFLICT");
    }

    @Test
    @Tag("FR-004-02")
    void invalidValuesWithTheCurrentVersionAreRejectedAndNothingChanges() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        UUID id = idOf(created);
        Map<String, Object> rowBefore = contacts.row(id);
        Map<String, Object> invalid = valuesOf(created);
        invalid.put("firstName", null);
        invalid.put("lastName", null);
        invalid.put("email", "janez@");
        invalid.put("phone", "01 234 abc");
        invalid.put("tags", List.of("moja znacka"));
        invalid.put("attributes", List.of(Map.of("key", "Telefon", "value", "x")));

        HttpResponse<String> response =
                put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(invalid, 0)));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body()))
                .containsEntry("firstName", "REQUIRED")
                .containsEntry("lastName", "REQUIRED")
                .containsEntry("email", "INVALID_VALUE")
                .containsEntry("phone", "INVALID_VALUE")
                .containsEntry("tags[0]", "INVALID_VALUE")
                .containsEntry("attributes[0].key", "RESERVED_KEY");
        assertThat(contacts.row(id)).isEqualTo(rowBefore);
        assertThat(contacts.tagsOf(id)).containsExactly("vip", "ne_obveščaj", "konferenca2025");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "\"version\":\"0\"", "\"version\":1.5", "\"version\":null"})
    @Tag("FR-004-10")
    void missingOrNonIntegerVersionIsAValidationErrorOnTheVersionField(String versionField) throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        UUID id = idOf(created);
        String values = body(valuesOf(created));
        String raw =
                versionField.isEmpty() ? values : values.substring(0, values.length() - 1) + "," + versionField + "}";

        HttpResponse<String> response = put(contactPath(s.group(), id), s.token(Who.EDITOR), raw);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsKey("version");
        assertThat(contacts.version(id)).isZero();
    }

    @Test
    @Tag("FR-004-13")
    void contactDeletedInTheMeantimeIsNotFoundAndIsNotRecreated() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        UUID id = idOf(created);
        assertThat(delete(contactPath(s.group(), id) + "?version=0", s.token(Who.ADMIN))
                        .statusCode())
                .isEqualTo(204);

        HttpResponse<String> response =
                put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(valuesOf(created), 0)));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertThat(contacts.exists(id)).isFalse();
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    @Tag("FR-004-10")
    void viewerWithAnInvalidBodyIsForbiddenBeforeValidation() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = janez(s);
        UUID id = idOf(created);
        Map<String, Object> rowBefore = contacts.row(id);
        Map<String, Object> invalid = valuesOf(created);
        invalid.put("email", "janez@");

        HttpResponse<String> response =
                put(contactPath(s.group(), id), s.token(Who.VIEWER), body(withVersion(invalid, 0)));
        HttpResponse<String> withoutVersion = put(contactPath(s.group(), id), s.token(Who.VIEWER), "{broken");

        // feature-map §2.2: 403 (korak 3) pred 400 VALIDATION_FAILED (korak 6).
        for (HttpResponse<String> r : List.of(response, withoutVersion)) {
            assertThat(r.statusCode()).isEqualTo(403);
            assertThat(json(r.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        }
        assertThat(contacts.row(id)).isEqualTo(rowBefore);
    }

    @Test
    @Tag("FR-004-14")
    void contactOfAnotherGroupCannotBeEditedThroughThisGroup() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga skupina");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        Map<String, Object> rowBefore = contacts.row(foreign);

        HttpResponse<String> response = put(
                contactPath(s.group(), foreign),
                s.token(Who.OWNER),
                body(withVersion(input("Prepisan", "Kontakt"), 0)));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertThat(contacts.row(foreign)).isEqualTo(rowBefore);
    }
}

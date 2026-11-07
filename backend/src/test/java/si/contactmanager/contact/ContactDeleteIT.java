package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.contact.support.ContactApiTest;

/** Izbris kontakta prek {@code DELETE …/contacts/{contactId}?version=} (FR-004-12, FR-004-13, FR-004-14). */
class ContactDeleteIT extends ContactApiTest {

    private UUID contactWithAttributesAndTags(Scenario s, String first) {
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), first, "Novak");
        contacts.addAttribute(id, 0, "kompetenca", "web dev");
        contacts.addTag(id, 0, "vip");
        return id;
    }

    private int rows(String table, UUID contact) {
        Integer count =
                jdbc.queryForObject("select count(*) from " + table + " where contact_id = ?", Integer.class, contact);
        return count == null ? 0 : count;
    }

    @Test
    @Tag("FR-004-12")
    void deleteWithTheCurrentVersionRemovesTheContactWithItsAttributesAndTags() throws Exception {
        Scenario s = scenario();
        UUID id = contactWithAttributesAndTags(s, "Janez");
        UUID other = contactWithAttributesAndTags(s, "Drugi");

        HttpResponse<String> response = delete(contactPath(s.group(), id) + "?version=0", s.token(Who.EDITOR));

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
        assertThat(contacts.exists(id)).isFalse();
        assertThat(rows("contact_attribute", id)).isZero();
        assertThat(rows("contact_tag", id)).isZero();
        assertThat(contacts.exists(other)).isTrue();
        assertThat(rows("contact_tag", other)).isEqualTo(1);
        assertThat(get(contactPath(s.group(), id), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(404);
    }

    @Test
    @Tag("FR-004-12")
    void staleVersionIsAConflictWithTheCurrentStateAndTheContactStays() throws Exception {
        Scenario s = scenario();
        UUID id = contactWithAttributesAndTags(s, "Janez");
        contacts.editedByOther(id, s.id(Who.ADMIN), "031 999 888");

        HttpResponse<String> response = delete(contactPath(s.group(), id) + "?version=0", s.token(Who.EDITOR));

        assertThat(response.statusCode()).isEqualTo(409);
        Map<String, Object> conflict = json(response.body());
        assertThat(conflict).containsEntry("code", "VERSION_CONFLICT");
        Map<String, Object> current = asObject(conflict.get("current"));
        assertThat(current).containsEntry("version", 1).containsEntry("phone", "031 999 888");
        assertThat(contacts.exists(id)).isTrue();
        assertThat(rows("contact_tag", id)).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "?version=", "?version=abc", "?version=-1", "?version=1.5"})
    @Tag("FR-004-12")
    void missingOrInvalidVersionIsAValidationErrorAndTheContactStays(String query) throws Exception {
        Scenario s = scenario();
        UUID id = contactWithAttributesAndTags(s, "Janez");

        HttpResponse<String> response = delete(contactPath(s.group(), id) + query, s.token(Who.EDITOR));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body())).containsKey("version");
        assertThat(contacts.exists(id)).isTrue();
    }

    @Test
    @Tag("FR-004-13")
    void alreadyDeletedContactIsNotFound() throws Exception {
        Scenario s = scenario();
        UUID id = contactWithAttributesAndTags(s, "Janez");
        assertThat(delete(contactPath(s.group(), id) + "?version=0", s.token(Who.ADMIN))
                        .statusCode())
                .isEqualTo(204);

        HttpResponse<String> response = delete(contactPath(s.group(), id) + "?version=0", s.token(Who.EDITOR));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertThat(delete(contactPath(s.group(), UUID.randomUUID()) + "?version=0", s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(404);
    }

    @Test
    @Tag("FR-004-13")
    @Tag("FR-004-14")
    void missingOrForeignContactIsNotFoundEvenWithoutAVersion() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga skupina");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");

        // plan.md: manjkajoč version → 400 šele po 404 in 409 (feature-map §2.2, korak 2 pred korakom 6).
        for (String query : List.of("", "?version=abc")) {
            HttpResponse<String> missing =
                    delete(contactPath(s.group(), UUID.randomUUID()) + query, s.token(Who.EDITOR));
            HttpResponse<String> foreignResponse = delete(contactPath(s.group(), foreign) + query, s.token(Who.OWNER));
            assertThat(missing.statusCode()).as(query).isEqualTo(404);
            assertThat(missing.body()).isEmpty();
            assertThat(foreignResponse.statusCode()).as(query).isEqualTo(404);
            assertThat(foreignResponse.body()).isEmpty();
        }
        assertThat(contacts.exists(foreign)).isTrue();
    }

    @Test
    @Tag("FR-004-12")
    void viewerWithoutAVersionIsForbiddenBeforeValidation() throws Exception {
        Scenario s = scenario();
        UUID id = contactWithAttributesAndTags(s, "Janez");

        HttpResponse<String> response = delete(contactPath(s.group(), id), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        assertThat(contacts.exists(id)).isTrue();
    }

    @Test
    @Tag("FR-004-14")
    void contactOfAnotherGroupCannotBeDeletedThroughThisGroup() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga skupina");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");

        HttpResponse<String> response = delete(contactPath(s.group(), foreign) + "?version=0", s.token(Who.OWNER));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertThat(contacts.exists(foreign)).isTrue();
    }

    /** Regresijski test (003 FR-003-11, D-35 točka 5): uspe že z migracijo iz ogrodja ({@code ON DELETE CASCADE}). */
    @Test
    @Tag("FR-004-12")
    void deletingTheGroupDeletesItsContactsAttributesAndTags() throws Exception {
        Scenario s = scenario();
        UUID id = contactWithAttributesAndTags(s, "Janez");

        HttpResponse<String> response = delete("/api/groups/" + s.group(), s.token(Who.OWNER));

        // Skupina ima več članov, zato izbris po 003 ni dovoljen; odstranimo druge člane in ponovimo.
        assertThat(response.statusCode()).isEqualTo(409);
        jdbc.update("delete from group_member where group_id = ? and role <> 'OWNER'", s.group());
        assertThat(delete("/api/groups/" + s.group(), s.token(Who.OWNER)).statusCode())
                .isEqualTo(204);

        assertThat(contacts.exists(id)).isFalse();
        assertThat(rows("contact_attribute", id)).isZero();
        assertThat(rows("contact_tag", id)).isZero();
        assertThat(List.of(contacts.count(s.group()))).containsExactly(0);
    }
}

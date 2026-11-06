package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;

/**
 * Urejanje podatkov skupine {@code PUT /api/groups/{groupId}} (FR-002-02, FR-002-11, FR-002-12): verzija, nespremenjeno
 * shranjevanje (Clarifications 2026-11-05), konflikt verzij s trenutnim stanjem in vrstni red preverjanj (feature-map
 * §2.2: 409 GROUP_ARCHIVED → 409 VERSION_CONFLICT → 400).
 */
class GroupUpdateIT extends ApiTest {

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private GroupFixtures fixtures;
    private SignedIn owner;
    private SignedIn admin;
    private UUID group;

    @BeforeEach
    void setUp() throws Exception {
        fixtures = new GroupFixtures(jdbc);
        owner = registeredUser("Ana Novak");
        admin = registeredUser("Bojan Kos");
        group = fixtures.createGroup(fixtures.userId(owner.uid()), "Projekt FERI", "Opis", "mah");
        fixtures.addMember(group, fixtures.userId(admin.uid()), "ADMIN");
    }

    private static String body(String title, String description, String color, long version) {
        return "{\"title\":" + quote(title) + ",\"description\":" + quote(description) + ",\"color\":" + quote(color)
                + ",\"version\":" + version + "}";
    }

    private static String quote(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    private HttpResponse<String> update(SignedIn user, String jsonBody) throws Exception {
        return put("/api/groups/" + group, user.idToken(), jsonBody);
    }

    @Test
    @Tag("FR-002-11")
    @Tag("FR-002-12")
    void adminChangesTitleAndColorAndTheVersionIncreases() throws Exception {
        Timestamp before = (Timestamp) fixtures.row(group).get("updated_at");

        HttpResponse<String> response = update(admin, body("Projekt FERI 2", "Opis", "rja", 0));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> result = json(response.body());
        assertThat(result)
                .containsEntry("title", "Projekt FERI 2")
                .containsEntry("color", "rja")
                .containsEntry("version", 1)
                .containsEntry("role", "ADMIN")
                .containsEntry("updatedBy", Map.of("name", "Bojan Kos", "email", fixtures.email(admin.uid())));
        Map<String, Object> row = fixtures.row(group);
        assertThat(row)
                .containsEntry("title", "Projekt FERI 2")
                .containsEntry("color", "rja")
                .containsEntry("version", 1L)
                .containsEntry("updated_by", fixtures.userId(admin.uid()));
        assertThat((Timestamp) row.get("updated_at")).isAfter(before);
    }

    @Test
    @Tag("FR-002-11")
    void ownerClearsTheDescription() throws Exception {
        assertThat(update(owner, body("Projekt FERI", null, "mah", 0)).statusCode())
                .isEqualTo(200);
        assertThat(fixtures.row(group)).containsEntry("description", null);

        jdbc.update("update contact_group set description = 'Spet opis' where id = ?", group);
        HttpResponse<String> emptyString = update(owner, body("Projekt FERI", "", "mah", 1));
        assertThat(emptyString.statusCode()).isEqualTo(200);
        assertThat(json(emptyString.body())).containsEntry("description", null);
    }

    @Test
    @Tag("FR-002-12")
    void savingUnchangedDataDoesNotChangeVersionEditorOrTime() throws Exception {
        Map<String, Object> before = fixtures.row(group);

        HttpResponse<String> unchanged = update(admin, body("Projekt FERI", "Opis", "mah", 0));
        HttpResponse<String> paddedTitle = update(admin, body("  Projekt FERI  ", "Opis", "mah", 0));

        assertThat(unchanged.statusCode()).isEqualTo(200);
        assertThat(json(unchanged.body())).containsEntry("version", 0);
        assertThat(paddedTitle.statusCode()).isEqualTo(200);
        assertThat(json(paddedTitle.body())).containsEntry("version", 0);
        assertThat(fixtures.row(group)).isEqualTo(before);
    }

    @Test
    @Tag("FR-002-12")
    void staleVersionIsAConflictWithTheCurrentStateAndNothingChanges() throws Exception {
        jdbc.update(
                "update contact_group set title = 'Novejši', version = 5, updated_by = ? where id = ?",
                fixtures.userId(owner.uid()),
                group);
        Map<String, Object> before = fixtures.row(group);

        HttpResponse<String> response = update(admin, body("Moj naslov", "Opis", "mah", 0));

        assertThat(response.statusCode()).isEqualTo(409);
        Map<String, Object> error = json(response.body());
        assertThat(error).containsOnlyKeys("code", "current").containsEntry("code", "VERSION_CONFLICT");
        Map<String, Object> current = JSON.convertValue(error.get("current"), MAP);
        assertThat(current)
                .containsEntry("id", group.toString())
                .containsEntry("title", "Novejši")
                .containsEntry("version", 5)
                .containsEntry("role", "ADMIN")
                .containsEntry("updatedBy", Map.of("name", "Ana Novak", "email", fixtures.email(owner.uid())));
        assertThat(fixtures.row(group)).isEqualTo(before);
    }

    @Test
    @Tag("FR-002-12")
    void staleVersionIsAConflictEvenWhenDataIsUnchanged() throws Exception {
        jdbc.update("update contact_group set version = 2 where id = ?", group);

        HttpResponse<String> response = update(admin, body("Projekt FERI", "Opis", "mah", 1));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).containsEntry("code", "VERSION_CONFLICT");
    }

    static List<Arguments> invalidBodies() {
        return List.of(
                Arguments.of(body("", "Opis", "mah", 0), "title", "REQUIRED"),
                Arguments.of(body("a".repeat(101), "Opis", "mah", 0), "title", "TOO_LONG"),
                Arguments.of(body("X", "b".repeat(1001), "mah", 0), "description", "TOO_LONG"),
                Arguments.of(body("X", "Opis", "blue", 0), "color", "INVALID_VALUE"),
                Arguments.of("{\"title\":\"X\",\"description\":null,\"color\":\"mah\"}", "version", "REQUIRED"));
    }

    @ParameterizedTest(name = "{1} {2}")
    @MethodSource("invalidBodies")
    @Tag("FR-002-02")
    void invalidDataIsRejectedAndNothingChanges(String jsonBody, String field, String code) throws Exception {
        Map<String, Object> before = fixtures.row(group);

        HttpResponse<String> response = update(admin, jsonBody);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body()))
                .containsEntry("code", "VALIDATION_FAILED")
                .containsEntry("errors", List.of(Map.of("field", field, "code", code)));
        assertThat(fixtures.row(group)).isEqualTo(before);
    }

    @Test
    @Tag("FR-002-11")
    @Tag("FR-002-12")
    void archivedIsCheckedBeforeVersionAndVersionBeforeData() throws Exception {
        jdbc.update("update contact_group set version = 4 where id = ?", group);

        HttpResponse<String> staleAndInvalid = update(admin, body("", "Opis", "mah", 0));
        fixtures.archive(group);
        HttpResponse<String> archivedStaleAndInvalid = update(admin, body("", "Opis", "mah", 0));

        assertThat(staleAndInvalid.statusCode()).isEqualTo(409);
        assertThat(json(staleAndInvalid.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(archivedStaleAndInvalid.statusCode()).isEqualTo(409);
        assertThat(json(archivedStaleAndInvalid.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
    }

    @Test
    @Tag("FR-002-08")
    void missingOrMalformedGroupIs404WithEmptyBodyBeforeValidation() throws Exception {
        SignedIn stranger = registeredUser("Tujec");

        HttpResponse<String> missing = put("/api/groups/" + UUID.randomUUID(), admin.idToken(), "{}");
        HttpResponse<String> malformed = put("/api/groups/abc", admin.idToken(), "{}");
        HttpResponse<String> foreignInvalid = put("/api/groups/" + group, stranger.idToken(), "{}");
        HttpResponse<String> foreignValid =
                put("/api/groups/" + group, stranger.idToken(), body("Tuje", null, "rja", 0));

        for (HttpResponse<String> response : List.of(missing, malformed, foreignInvalid, foreignValid)) {
            assertThat(response.statusCode()).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
        assertThat(fixtures.row(group)).containsEntry("title", "Projekt FERI").containsEntry("version", 0L);
    }
}

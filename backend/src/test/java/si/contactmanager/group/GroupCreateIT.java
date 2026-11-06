package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
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

/** Ustvarjanje skupine prek {@code POST /api/groups} (FR-002-01, FR-002-02, FR-002-03; plan.md – REST endpoints). */
class GroupCreateIT extends ApiTest {

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    @Test
    @Tag("FR-002-01")
    @Tag("FR-002-03")
    void creatorBecomesTheOnlyMemberWithRoleOwner() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        String email = fixtures.email(ana.uid());

        HttpResponse<String> response = post(
                "/api/groups",
                ana.idToken(),
                "{\"title\":\"Projekt FERI\",\"description\":\"Kontakti projekta\",\"color\":\"mah\"}");

        assertThat(response.statusCode()).isEqualTo(201);
        Map<String, Object> body = json(response.body());
        assertThat(body)
                .containsOnlyKeys(
                        "id", "title", "description", "color", "role", "archived", "version", "updatedAt", "updatedBy")
                .containsEntry("title", "Projekt FERI")
                .containsEntry("description", "Kontakti projekta")
                .containsEntry("color", "mah")
                .containsEntry("role", "OWNER")
                .containsEntry("archived", false)
                .containsEntry("version", 0)
                .containsEntry("updatedBy", Map.of("name", "Ana Novak", "email", email));
        assertThat(body.get("updatedAt")).isInstanceOf(String.class);
        UUID id = UUID.fromString((String) body.get("id"));
        List<Map<String, Object>> members =
                jdbc.queryForList("select user_id, role from group_member where group_id = ?", id);
        assertThat(members).hasSize(1);
        assertThat(members.getFirst())
                .containsEntry("user_id", fixtures.userId(ana.uid()))
                .containsEntry("role", "OWNER");
    }

    @Test
    @Tag("FR-002-03")
    void groupWithoutColorGetsTinta() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = post("/api/groups", ana.idToken(), "{\"title\":\"Brez barve\"}");

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json(response.body())).containsEntry("color", "tinta").containsEntry("description", null);
    }

    @Test
    @Tag("FR-002-02")
    void titleIsStoredTrimmed() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = post("/api/groups", ana.idToken(), "{\"title\":\"  X  \"}");

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json(response.body())).containsEntry("title", "X");
    }

    static List<Arguments> invalidBodies() {
        return List.of(
                Arguments.of("{\"title\":\"\"}", "title", "REQUIRED"),
                Arguments.of("{\"title\":\"   \"}", "title", "REQUIRED"),
                Arguments.of("{\"title\":\"" + "a".repeat(101) + "\"}", "title", "TOO_LONG"),
                Arguments.of(
                        "{\"title\":\"X\",\"description\":\"" + "b".repeat(1001) + "\"}", "description", "TOO_LONG"),
                Arguments.of("{\"title\":\"X\",\"color\":\"blue\"}", "color", "INVALID_VALUE"));
    }

    @ParameterizedTest(name = "{1} {2}")
    @MethodSource("invalidBodies")
    @Tag("FR-002-02")
    void invalidDataIsRejectedAndNothingIsCreated(String body, String field, String code) throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        int before = fixtures.groupCount();

        HttpResponse<String> response = post("/api/groups", ana.idToken(), body);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body()))
                .containsEntry("code", "VALIDATION_FAILED")
                .containsEntry("errors", List.of(Map.of("field", field, "code", code)));
        assertThat(fixtures.groupCount()).isEqualTo(before);
    }

    @Test
    @Tag("FR-002-01")
    void userWithoutPriorProfileSyncCanCreateAGroup() throws Exception {
        SignedIn fresh = newGoogleUser("Nova Uporabnica");

        HttpResponse<String> response = post("/api/groups", fresh.idToken(), "{\"title\":\"Prva\"}");

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json(response.body())).containsEntry("role", "OWNER");
        assertThat(profileRows(fresh.uid())).hasSize(1);
    }

    @Test
    @Tag("FR-002-01")
    void titlesAreNotUnique() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");

        assertThat(post("/api/groups", ana.idToken(), "{\"title\":\"Enak naslov\"}")
                        .statusCode())
                .isEqualTo(201);
        assertThat(post("/api/groups", bojan.idToken(), "{\"title\":\"Enak naslov\"}")
                        .statusCode())
                .isEqualTo(201);
        assertThat(post("/api/groups", ana.idToken(), "{\"title\":\"Enak naslov\"}")
                        .statusCode())
                .isEqualTo(201);
    }
}

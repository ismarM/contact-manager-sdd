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
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;

/**
 * Odarhiviranje skupine {@code POST /api/groups/{groupId}/unarchive} (FR-003-06, FR-003-08; plan.md – REST endpoints):
 * samo lastnik arhivirane skupine; trajno arhivirana skupina nima lastnika, zato vsak član dobi 403.
 */
class GroupUnarchiveIT extends ApiTest {

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {};

    @Test
    @Tag("FR-003-06")
    void ownerUnarchivesAndTheGroupReturnsToTheOwnerSection() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.archive(group);

        HttpResponse<String> response = post("/api/groups/" + group + "/unarchive", ana.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("archived", false);
        assertThat(fixtures.archivedAt(group)).isNull();
        List<Map<String, Object>> sections =
                JSON.convertValue(json(get("/api/groups", ana.idToken()).body()).get("sections"), LIST);
        assertThat(sections).hasSize(1);
        assertThat(sections.getFirst()).containsEntry("role", "OWNER");
    }

    @Test
    @Tag("FR-003-06")
    void unarchivingANonArchivedGroupIsAConflict() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");

        HttpResponse<String> response = post("/api/groups/" + group + "/unarchive", ana.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_NOT_ARCHIVED"));
        assertThat(fixtures.archivedAt(group)).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR", "ADMIN"})
    @Tag("FR-003-06")
    void rolesBelowOwnerCannotUnarchive(String role) throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn member = registeredUser("Član " + role);
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(member.uid()), role);
        fixtures.archive(group);

        HttpResponse<String> response = post("/api/groups/" + group + "/unarchive", member.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        assertThat(fixtures.archivedAt(group)).isNotNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR", "ADMIN"})
    @Tag("FR-003-08")
    void permanentlyArchivedGroupCannotBeUnarchivedByAnyMember(String role) throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn member = registeredUser("Član " + role);
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(member.uid()), role);
        fixtures.makePermanentlyArchived(group);

        HttpResponse<String> response = post("/api/groups/" + group + "/unarchive", member.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(fixtures.archivedAt(group)).isNotNull();
        assertThat(fixtures.memberCount(group)).isEqualTo(1);
    }
}

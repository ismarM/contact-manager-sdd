package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.core.type.TypeReference;

/**
 * Arhiviranje skupine {@code POST /api/groups/{groupId}/archive} (FR-003-01, FR-003-02; plan.md – REST endpoints):
 * samo lastnik, ponovitev 409 GROUP_ARCHIVED, članstvo in branje ostaneta, podatki skupine se ne spremenijo (R-04).
 */
class GroupArchiveIT extends ApiTest {

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {};

    @Test
    @Tag("FR-003-01")
    void ownerArchivesTheGroupAndDataStaysUntouched() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI", "Opis", "mah");
        Map<String, Object> before = fixtures.row(group);

        HttpResponse<String> response = post("/api/groups/" + group + "/archive", ana.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .containsEntry("archived", true)
                .containsEntry("permanentlyArchived", false)
                .containsEntry("role", "OWNER")
                .containsEntry("title", "Projekt FERI");
        assertThat(fixtures.archivedAt(group)).isNotNull();
        assertThat(fixtures.row(group)).isEqualTo(before);
    }

    @Test
    @Tag("FR-003-01")
    @Tag("FR-003-02")
    void archivedGroupLeavesTheRoleSectionsButMembersStillReadIt() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn eva = registeredUser("Eva Urednik");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Konferenca");
        fixtures.addMember(group, fixtures.userId(eva.uid()), "EDITOR");

        assertThat(post("/api/groups/" + group + "/archive", ana.idToken(), null)
                        .statusCode())
                .isEqualTo(200);

        for (SignedIn member : List.of(ana, eva)) {
            List<Map<String, Object>> sections = JSON.convertValue(
                    json(get("/api/groups", member.idToken()).body()).get("sections"), LIST);
            assertThat(sections).isEmpty();
        }
        HttpResponse<String> read = get("/api/groups/" + group, eva.idToken());
        assertThat(read.statusCode()).isEqualTo(200);
        assertThat(json(read.body())).containsEntry("archived", true).containsEntry("role", "EDITOR");
        assertThat(fixtures.memberCount(group)).isEqualTo(2);
    }

    @Test
    @Tag("FR-003-01")
    void archivingAnArchivedGroupIsAConflict() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.archive(group);
        Object archivedAt = fixtures.archivedAt(group);

        HttpResponse<String> response = post("/api/groups/" + group + "/archive", ana.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        assertThat(fixtures.archivedAt(group)).isEqualTo(archivedAt);
    }

    @Test
    @Tag("FR-003-01")
    void adminCannotArchiveTheGroup() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(bojan.uid()), "ADMIN");

        HttpResponse<String> response = post("/api/groups/" + group + "/archive", bojan.idToken(), null);

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        assertThat(fixtures.archivedAt(group)).isNull();
    }

    @Test
    @Tag("FR-003-01")
    void malformedOrMissingGroupIs404() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        assertThat(post("/api/groups/abc/archive", ana.idToken(), null).statusCode())
                .isEqualTo(404);
        assertThat(post("/api/groups/" + UUID.randomUUID() + "/archive", ana.idToken(), null)
                        .statusCode())
                .isEqualTo(404);
    }
}

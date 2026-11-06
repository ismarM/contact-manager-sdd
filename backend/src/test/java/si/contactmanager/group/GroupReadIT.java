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
 * Branje skupine {@code GET /api/groups/{groupId}} za glavo in Nastavitve (FR-002-07, FR-002-08, FR-002-10): vloga
 * klicatelja, arhivirana skupina dovoljena, nečlan in neobstoječa skupina dobita enak 404 brez telesa.
 */
class GroupReadIT extends ApiTest {

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    @Test
    @Tag("FR-002-07")
    @Tag("FR-002-10")
    void memberReadsTheGroupWithOwnRole() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn editor = registeredUser("Cene Urednik");
        UUID group = fixtures.createGroup(fixtures.userId(owner.uid()), "Projekt FERI", "Opis", "mah");
        fixtures.addMember(group, fixtures.userId(editor.uid()), "EDITOR");

        HttpResponse<String> response = get("/api/groups/" + group, editor.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .containsOnlyKeys(
                        "id", "title", "description", "color", "role", "archived", "version", "updatedAt", "updatedBy")
                .containsEntry("id", group.toString())
                .containsEntry("title", "Projekt FERI")
                .containsEntry("description", "Opis")
                .containsEntry("color", "mah")
                .containsEntry("role", "EDITOR")
                .containsEntry("archived", false)
                .containsEntry("version", 0)
                .containsEntry("updatedBy", Map.of("name", "Ana Novak", "email", fixtures.email(owner.uid())));
    }

    @Test
    @Tag("FR-002-07")
    void archivedGroupCanStillBeRead() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn viewer = registeredUser("Bralka");
        UUID group = fixtures.createGroup(fixtures.userId(owner.uid()), "Arhiv");
        fixtures.addMember(group, fixtures.userId(viewer.uid()), "VIEWER");
        fixtures.archive(group);

        HttpResponse<String> response = get("/api/groups/" + group, viewer.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("archived", true).containsEntry("role", "VIEWER");
    }

    @Test
    @Tag("FR-002-08")
    void nonMemberAndMissingGroupGetTheSameEmpty404() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn stranger = registeredUser("Tujec");
        UUID foreign = fixtures.createGroup(fixtures.userId(owner.uid()), "Tuja skupina");

        HttpResponse<String> forForeign = get("/api/groups/" + foreign, stranger.idToken());
        HttpResponse<String> forMissing = get("/api/groups/" + UUID.randomUUID(), stranger.idToken());
        HttpResponse<String> forMalformed = get("/api/groups/abc", stranger.idToken());

        for (HttpResponse<String> response : List.of(forForeign, forMissing, forMalformed)) {
            assertThat(response.statusCode()).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
        assertThat(forForeign.headers().firstValue("Content-Type"))
                .isEqualTo(forMissing.headers().firstValue("Content-Type"));
        assertThat(forForeign.body()).doesNotContain("Tuja skupina");
    }

    @Test
    @Tag("FR-002-10")
    void lastEditorWhoDeletedTheAccountIsReportedAsNull() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn former = registeredUser("Nekdanji Urednik");
        UUID group = fixtures.createGroup(fixtures.userId(owner.uid()), "Skupina");
        fixtures.setUpdatedBy(group, fixtures.userId(former.uid()));
        jdbc.update("delete from app_user where firebase_uid = ?", former.uid());

        HttpResponse<String> response = get("/api/groups/" + group, owner.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("updatedBy", null);
    }

    @Test
    @Tag("FR-002-10")
    void creatorWithoutNameIsReportedWithNullName() throws Exception {
        SignedIn nameless = emulator().signInWithGoogle(uniqueEmail(), null);
        assertThat(put("/api/me", nameless.idToken(), null).statusCode()).isEqualTo(201);
        UUID group = fixtures.createGroup(fixtures.userId(nameless.uid()), "Brez imena");

        HttpResponse<String> response = get("/api/groups/" + group, nameless.idToken());

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> updatedBy =
                JSON.convertValue(json(response.body()).get("updatedBy"), new TypeReference<>() {});
        assertThat(updatedBy).containsEntry("name", null).containsEntry("email", fixtures.email(nameless.uid()));
    }
}

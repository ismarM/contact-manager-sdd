package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Pravilo samo za branje v arhivirani skupini (FR-003-03, FR-003-04, SC-001; feature-map §2.4): pisanje podatkov skupine
 * (002) vrne 403 ali 409 GROUP_ARCHIVED po vrstnem redu §2.2, branje 200, po odarhiviranju urejanje spet deluje.
 */
class ArchivedWriteRuleIT extends ApiTest {

    private static final String BODY =
            "{\"title\":\"Spremenjeno\",\"description\":null,\"color\":\"rja\",\"version\":0}";

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    @Test
    @Tag("FR-003-03")
    @Tag("FR-003-04")
    void ownerAndAdminAreRejectedWith409AndNothingChanges() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(bojan.uid()), "ADMIN");
        fixtures.archive(group);
        Map<String, Object> before = fixtures.row(group);

        for (SignedIn user : new SignedIn[] {ana, bojan}) {
            HttpResponse<String> response = put("/api/groups/" + group, user.idToken(), BODY);
            assertThat(response.statusCode()).isEqualTo(409);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        }
        assertThat(fixtures.row(group)).isEqualTo(before);
    }

    @Test
    @Tag("FR-003-03")
    void rolePrecedesStateSoViewerAndEditorGet403() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn eva = registeredUser("Eva Bralka");
        SignedIn uros = registeredUser("Uroš Urednik");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(eva.uid()), "VIEWER");
        fixtures.addMember(group, fixtures.userId(uros.uid()), "EDITOR");
        fixtures.archive(group);

        for (SignedIn user : new SignedIn[] {eva, uros}) {
            HttpResponse<String> response = put("/api/groups/" + group, user.idToken(), BODY);
            assertThat(response.statusCode()).isEqualTo(403);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        }
    }

    @Test
    @Tag("FR-003-03")
    void everyMemberCanStillReadAnArchivedGroup() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn eva = registeredUser("Eva Bralka");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(eva.uid()), "VIEWER");
        fixtures.archive(group);

        for (SignedIn user : new SignedIn[] {ana, eva}) {
            HttpResponse<String> response = get("/api/groups/" + group, user.idToken());
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(json(response.body())).containsEntry("archived", true);
        }
    }

    @Test
    @Tag("FR-003-03")
    @Tag("FR-003-08")
    void permanentlyArchivedGroupFollowsTheSameRules() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        SignedIn eva = registeredUser("Eva Bralka");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(bojan.uid()), "ADMIN");
        fixtures.addMember(group, fixtures.userId(eva.uid()), "VIEWER");
        fixtures.makePermanentlyArchived(group);
        Map<String, Object> before = fixtures.row(group);

        assertThat(put("/api/groups/" + group, bojan.idToken(), BODY).statusCode())
                .isEqualTo(409);
        assertThat(put("/api/groups/" + group, eva.idToken(), BODY).statusCode())
                .isEqualTo(403);
        assertThat(get("/api/groups/" + group, eva.idToken()).statusCode()).isEqualTo(200);
        assertThat(fixtures.row(group)).isEqualTo(before);
    }

    @Test
    @Tag("FR-003-06")
    void editingWorksAgainAfterUnarchiving() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        assertThat(post("/api/groups/" + group + "/archive", ana.idToken(), null)
                        .statusCode())
                .isEqualTo(200);
        assertThat(put("/api/groups/" + group, ana.idToken(), BODY).statusCode())
                .isEqualTo(409);
        assertThat(post("/api/groups/" + group + "/unarchive", ana.idToken(), null)
                        .statusCode())
                .isEqualTo(200);

        HttpResponse<String> response = put("/api/groups/" + group, ana.idToken(), BODY);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("title", "Spremenjeno").containsEntry("version", 1);
    }
}

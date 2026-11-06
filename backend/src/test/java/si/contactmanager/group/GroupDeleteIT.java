package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
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
import si.contactmanager.support.Http;

/**
 * Izbris skupine {@code DELETE /api/groups/{groupId}} (FR-003-08 … FR-003-11; plan.md – REST endpoints): samo edini
 * član; v trajno arhivirani skupini katera koli vloga; vsi podatki skupine izginejo; polje {@code canDelete}.
 */
class GroupDeleteIT extends ApiTest {

    private GroupFixtures fixtures;

    @BeforeEach
    void setUp() {
        fixtures = new GroupFixtures(jdbc);
    }

    private HttpResponse<String> delete(UUID group, SignedIn user) throws Exception {
        return Http.send("DELETE", url("/api/groups/" + group), Http.bearer(user.idToken()));
    }

    @Test
    @Tag("FR-003-09")
    @Tag("FR-003-11")
    void soleOwnerDeletesTheGroupAndNothingRemains() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");

        HttpResponse<String> response = delete(group, ana);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
        assertThat(fixtures.exists(group)).isFalse();
        assertThat(fixtures.memberCount(group)).isZero();
        assertThat(get("/api/groups/" + group, ana.idToken()).statusCode()).isEqualTo(404);
        assertThat(post("/api/groups/" + group + "/archive", ana.idToken(), null)
                        .statusCode())
                .isEqualTo(404);
        assertThat(delete(group, ana).statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-003-09")
    void formerMemberOfADeletedGroupGets404() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        assertThat(delete(group, ana).statusCode()).isEqualTo(204);
        SignedIn stranger = registeredUser("Nekdo Drug");

        assertThat(get("/api/groups/" + group, stranger.idToken()).statusCode()).isEqualTo(404);
        assertThat(delete(group, stranger).statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-003-09")
    void deletionIsAllowedInAnArchivedGroup() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.archive(group);

        assertThat(delete(group, ana).statusCode()).isEqualTo(204);
        assertThat(fixtures.exists(group)).isFalse();
    }

    @Test
    @Tag("FR-003-09")
    void ownerWithAnotherMemberCannotDelete() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn eva = registeredUser("Eva Bralka");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(eva.uid()), "VIEWER");

        HttpResponse<String> response = delete(group, ana);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_HAS_OTHER_MEMBERS"));
        assertThat(fixtures.exists(group)).isTrue();
        assertThat(fixtures.memberCount(group)).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR", "ADMIN"})
    @Tag("FR-003-09")
    void rolesBelowOwnerCannotDeleteAnActiveGroup(String role) throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn member = registeredUser("Član " + role);
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(member.uid()), role);

        HttpResponse<String> response = delete(group, member);

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        assertThat(fixtures.exists(group)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR", "ADMIN"})
    @Tag("FR-003-08")
    @Tag("FR-003-09")
    void soleRemainingMemberOfAnyRoleDeletesAPermanentlyArchivedGroup(String role) throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn eva = registeredUser("Eva " + role);
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(eva.uid()), role);
        fixtures.makePermanentlyArchived(group);

        HttpResponse<String> response = delete(group, eva);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(fixtures.exists(group)).isFalse();
    }

    @Test
    @Tag("FR-003-08")
    @Tag("FR-003-09")
    void permanentlyArchivedGroupWithTwoMembersCannotBeDeleted() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn eva = registeredUser("Eva Bralka");
        SignedIn bojan = registeredUser("Bojan Kos");
        UUID group = fixtures.createGroup(fixtures.userId(ana.uid()), "Projekt FERI");
        fixtures.addMember(group, fixtures.userId(eva.uid()), "VIEWER");
        fixtures.addMember(group, fixtures.userId(bojan.uid()), "EDITOR");
        fixtures.makePermanentlyArchived(group);

        HttpResponse<String> response = delete(group, eva);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_HAS_OTHER_MEMBERS"));
        assertThat(fixtures.exists(group)).isTrue();
    }

    @Test
    @Tag("FR-003-10")
    void canDeleteReflectsTheRulesForEachCaller() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn eva = registeredUser("Eva Bralka");
        long anaId = fixtures.userId(ana.uid());
        UUID alone = fixtures.createGroup(anaId, "Sam");
        UUID shared = fixtures.createGroup(anaId, "Skupna");
        fixtures.addMember(shared, fixtures.userId(eva.uid()), "ADMIN");
        UUID permanent = fixtures.createGroup(anaId, "Trajna");
        fixtures.addMember(permanent, fixtures.userId(eva.uid()), "VIEWER");
        fixtures.makePermanentlyArchived(permanent);

        assertThat(json(get("/api/groups/" + alone, ana.idToken()).body()))
                .containsEntry("canDelete", true)
                .containsEntry("permanentlyArchived", false);
        assertThat(json(get("/api/groups/" + shared, ana.idToken()).body())).containsEntry("canDelete", false);
        assertThat(json(get("/api/groups/" + shared, eva.idToken()).body())).containsEntry("canDelete", false);
        assertThat(json(get("/api/groups/" + permanent, eva.idToken()).body()))
                .containsEntry("canDelete", true)
                .containsEntry("permanentlyArchived", true)
                .containsEntry("archived", true);
    }
}

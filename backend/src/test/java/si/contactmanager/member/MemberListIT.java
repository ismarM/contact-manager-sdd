package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.member.support.MemberApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/** Seznam članov {@code GET /api/groups/{groupId}/members} (FR-007-01, FR-007-02, FR-007-10). */
class MemberListIT extends MemberApiTest {

    private record Fixture(UUID group, SignedIn owner, SignedIn admin, SignedIn editor, SignedIn viewer) {}

    private Fixture fixture() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editor = registeredUser("Cene Urednik");
        SignedIn viewer = registeredUser("Dana Bralec");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        join(group, admin, "ADMIN");
        join(group, editor, "EDITOR");
        join(group, viewer, "VIEWER");
        return new Fixture(group, owner, admin, editor, viewer);
    }

    @Test
    @Tag("FR-007-01")
    void everyMemberSeesAllMembersOrderedByRoleAndTheirOwnRowIsMarked() throws Exception {
        Fixture f = fixture();

        HttpResponse<String> response = list(f.group(), f.viewer());

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("total", 4).containsEntry("page", 0).containsEntry("size", 25);
        assertThat(body).containsEntry("deletedOwner", false);
        assertThat(items(response))
                .extracting(item -> item.get("role"))
                .containsExactly("OWNER", "ADMIN", "EDITOR", "VIEWER");
        assertThat(items(response))
                .extracting(item -> item.get("email"))
                .containsExactly(email(f.owner()), email(f.admin()), email(f.editor()), email(f.viewer()));
        assertThat(items(response)).extracting(item -> item.get("self")).containsExactly(false, false, false, true);
        Map<String, Object> first = items(response).get(0);
        assertThat(first)
                .containsEntry("name", "Ana Novak")
                .containsEntry("version", 0)
                .containsEntry("updatedBy", null);
        assertThat(UUID.fromString((String) first.get("id"))).isEqualTo(members.memberId(f.group(), id(f.owner())));
        assertThat(first.keySet())
                .containsExactlyInAnyOrder(
                        "id", "name", "email", "role", "version", "self", "canManage", "updatedBy", "updatedAt");
    }

    @Test
    @Tag("FR-007-01")
    void sameRoleMembersAreOrderedByNameAccordingToTheLanguage() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Razvrščanje");
        for (String name : List.of("Čedomir Bralec", "Cene Bralec", "Šime Bralec", "Sandi Bralec", "Zala Bralec")) {
            join(group, registeredUser(name), "VIEWER");
        }

        List<Object> sl = items(list(group, owner, "?lang=sl")).stream()
                .map(item -> item.get("name"))
                .toList();
        List<Object> en = items(list(group, owner, "?lang=en")).stream()
                .map(item -> item.get("name"))
                .toList();

        // slovenska abeceda: c, č, s, š, z; angleška kolacija jih razvrsti drugače (č za c, š za s)
        assertThat(sl.subList(1, 6))
                .containsExactly("Cene Bralec", "Čedomir Bralec", "Sandi Bralec", "Šime Bralec", "Zala Bralec");
        // angleška kolacija: č je naglašen c, zato se razvrsti po nadaljnjih črkah (Čed… pred Cen…)
        assertThat(en.subList(1, 6))
                .containsExactly("Čedomir Bralec", "Cene Bralec", "Sandi Bralec", "Šime Bralec", "Zala Bralec");
        assertThat(sl.get(0)).isEqualTo("Ana Novak");
        assertThat(en.get(0)).isEqualTo("Ana Novak");
    }

    @Test
    @Tag("FR-007-01")
    void membersWithoutANameAreOrderedByTheirEmail() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn second = registeredUser("Drugi");
        SignedIn first = registeredUser("Prvi");
        UUID group = groups.createGroup(id(owner), "Brez imena");
        join(group, second, "VIEWER");
        join(group, first, "VIEWER");
        String suffix = UUID.randomUUID().toString();
        jdbc.update("update app_user set name = null, email = ? where id = ?", "a-" + suffix + "@primer.si", id(first));
        jdbc.update(
                "update app_user set name = null, email = ? where id = ?", "b-" + suffix + "@primer.si", id(second));

        HttpResponse<String> response = list(group, owner);

        assertThat(items(response))
                .extracting(item -> item.get("email"))
                .containsExactly(email(owner), "a-" + suffix + "@primer.si", "b-" + suffix + "@primer.si");
        assertThat(row(response, "a-" + suffix + "@primer.si")).containsEntry("name", null);
    }

    @Test
    @Tag("FR-007-01")
    void listIsPaginated() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Velika");
        for (int i = 0; i < 29; i++) {
            groups.addMember(group, id(registeredUser("Član " + i)), "VIEWER");
        }

        assertThat(items(list(group, owner))).hasSize(25);
        HttpResponse<String> second = list(group, owner, "?page=1");
        assertThat(items(second)).hasSize(5);
        assertThat(json(second.body())).containsEntry("total", 30).containsEntry("page", 1);
        assertThat(items(list(group, owner, "?size=100"))).hasSize(30);
        assertThat(items(list(group, owner, "?size=50"))).hasSize(30);
    }

    @ParameterizedTest
    @ValueSource(strings = {"?page=-1", "?page=x", "?size=0", "?size=101", "?size=x", "?lang=de"})
    @Tag("FR-007-01")
    void invalidPagingOrLanguageIs400(String query) throws Exception {
        Fixture f = fixture();

        HttpResponse<String> response = list(f.group(), f.owner(), query);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
    }

    @Test
    @Tag("FR-007-02")
    void canManageIsTrueOnlyForStrictlyLowerRolesAndOnlyForOwnerAndAdmin() throws Exception {
        Fixture f = fixture();

        assertThat(items(list(f.group(), f.viewer())))
                .extracting(item -> item.get("canManage"))
                .containsOnly(false);
        assertThat(items(list(f.group(), f.editor())))
                .extracting(item -> item.get("canManage"))
                .containsOnly(false);
        // admin: samo urednik in bralec
        assertThat(items(list(f.group(), f.admin())))
                .extracting(item -> item.get("canManage"))
                .containsExactly(false, false, true, true);
        // lastnik: admin, urednik, bralec; ne on sam
        assertThat(items(list(f.group(), f.owner())))
                .extracting(item -> item.get("canManage"))
                .containsExactly(false, true, true, true);
    }

    @Test
    @Tag("FR-007-01")
    @Tag("FR-007-02")
    @Tag("FR-007-10")
    void archivedGroupIsReadableByEveryRoleButNothingIsManageable() throws Exception {
        Fixture f = fixture();
        groups.archive(f.group());

        for (SignedIn member : List.of(f.owner(), f.admin(), f.editor(), f.viewer())) {
            HttpResponse<String> response = list(f.group(), member);
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(items(response)).hasSize(4);
            assertThat(items(response))
                    .extracting(item -> item.get("canManage"))
                    .containsOnly(false);
        }
    }

    @Test
    @Tag("FR-007-01")
    void permanentlyArchivedGroupFlagsTheDeletedOwnerWithoutCountingThem() throws Exception {
        Fixture f = fixture();
        groups.makePermanentlyArchived(f.group());

        HttpResponse<String> response = list(f.group(), f.viewer());

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("deletedOwner", true).containsEntry("total", 3);
        assertThat(items(response)).extracting(item -> item.get("role")).containsExactly("ADMIN", "EDITOR", "VIEWER");
        assertThat(items(response)).extracting(item -> item.get("canManage")).containsOnly(false);
    }

    @Test
    @Tag("FR-007-01")
    void responseNeverExposesTheInternalUserId() throws Exception {
        Fixture f = fixture();

        HttpResponse<String> response = list(f.group(), f.owner());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).doesNotContain("\"userId\"").doesNotContain("firebase");
    }

    @Test
    @Tag("FR-007-04")
    void updatedByIsNullBeforeTheFirstRoleChange() throws Exception {
        Fixture f = fixture();

        assertThat(items(list(f.group(), f.owner())))
                .allSatisfy(item ->
                        assertThat(item).containsEntry("updatedBy", null).containsEntry("updatedAt", null));
    }
}

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

/** Zapuščanje skupine {@code POST /api/groups/{groupId}/leave} (FR-007-06, FR-007-07, FR-007-08, FR-007-10). */
class MemberLeaveIT extends MemberApiTest {

    @ParameterizedTest(name = "{0} zapusti skupino")
    @ValueSource(strings = {"ADMIN", "EDITOR", "VIEWER"})
    @Tag("FR-007-06")
    void nonOwnersLeaveAndLoseAccess(String role) throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn leaver = registeredUser("Odhajajoči");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        join(group, leaver, role);
        assertThat(get("/api/groups", leaver.idToken()).body()).contains(group.toString());

        HttpResponse<String> response = leave(group, leaver);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
        assertThat(members.role(group, id(leaver))).isEmpty();
        assertThat(get("/api/groups/" + group, leaver.idToken()).statusCode()).isEqualTo(404);
        assertThat(get("/api/groups/" + group + "/contacts", leaver.idToken()).statusCode())
                .isEqualTo(404);
        HttpResponse<String> overview = get("/api/groups", leaver.idToken());
        assertThat(overview.statusCode()).isEqualTo(200);
        assertThat(overview.body()).doesNotContain(group.toString());
        assertThat(members.count(group)).isEqualTo(1);
    }

    @ParameterizedTest(name = "{0} zapusti arhivirano skupino")
    @ValueSource(strings = {"ADMIN", "EDITOR", "VIEWER"})
    @Tag("FR-007-06")
    void leavingIsAllowedInAnArchivedGroup(String role) throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn leaver = registeredUser("Odhajajoči");
        UUID group = groups.createGroup(id(owner), "Arhivirana");
        join(group, leaver, role);
        groups.archive(group);
        assertThat(get("/api/groups/archived", leaver.idToken()).body()).contains(group.toString());

        assertThat(leave(group, leaver).statusCode()).isEqualTo(204);

        assertThat(members.role(group, id(leaver))).isEmpty();
        HttpResponse<String> archivedList = get("/api/groups/archived", leaver.idToken());
        assertThat(archivedList.statusCode()).isEqualTo(200);
        assertThat(archivedList.body()).doesNotContain(group.toString());
    }

    @Test
    @Tag("FR-007-07")
    void ownerCannotLeaveNotEvenAnArchivedGroup() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn viewer = registeredUser("Bralec");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        join(group, viewer, "VIEWER");

        HttpResponse<String> active = leave(group, owner);
        assertThat(active.statusCode()).isEqualTo(409);
        assertThat(json(active.body())).isEqualTo(Map.of("code", "OWNER_CANNOT_LEAVE"));
        groups.archive(group);
        HttpResponse<String> archived = leave(group, owner);
        assertThat(archived.statusCode()).isEqualTo(409);
        assertThat(json(archived.body())).isEqualTo(Map.of("code", "OWNER_CANNOT_LEAVE"));

        assertThat(members.role(group, id(owner))).contains("OWNER");
    }

    @Test
    @Tag("FR-007-07")
    void theOnlyMemberWhoIsOwnerCannotLeaveEither() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Sama");

        HttpResponse<String> response = leave(group, owner);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "OWNER_CANNOT_LEAVE"));
        assertThat(groups.exists(group)).isTrue();
    }

    @Test
    @Tag("FR-007-08")
    void lastMemberOfAPermanentlyArchivedGroupCannotLeaveButCanDeleteIt() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn last = registeredUser("Zadnji");
        UUID group = groups.createGroup(id(owner), "Trajna");
        join(group, last, "VIEWER");
        groups.makePermanentlyArchived(group);

        HttpResponse<String> response = leave(group, last);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "LAST_MEMBER_CANNOT_LEAVE"));
        assertThat(members.role(group, id(last))).contains("VIEWER");
        assertThat(groups.exists(group)).isTrue();
        assertThat(delete("/api/groups/" + group, last).statusCode()).isEqualTo(204);
        assertThat(groups.exists(group)).isFalse();
    }

    @Test
    @Tag("FR-007-08")
    void withTwoMembersOneLeavesAndTheOtherIsThenTheLastOne() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn first = registeredUser("Prvi");
        SignedIn second = registeredUser("Drugi");
        UUID group = groups.createGroup(id(owner), "Trajna");
        join(group, first, "ADMIN");
        join(group, second, "VIEWER");
        groups.makePermanentlyArchived(group);

        assertThat(leave(group, first).statusCode()).isEqualTo(204);
        HttpResponse<String> response = leave(group, second);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "LAST_MEMBER_CANNOT_LEAVE"));
        assertThat(members.count(group)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-08")
    void lastMemberRuleDoesNotApplyToActiveOrMerelyArchivedGroups() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Admin");
        UUID group = groups.createGroup(id(owner), "Arhivirana");
        join(group, admin, "ADMIN");
        groups.archive(group);

        assertThat(leave(group, admin).statusCode()).isEqualTo(204);
        assertThat(members.count(group)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-06")
    void nonMembersFormerMembersAndUnknownGroupsGet404() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn stranger = registeredUser("Tujec");
        SignedIn former = registeredUser("Bivši");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        join(group, former, "VIEWER");
        assertThat(leave(group, former).statusCode()).isEqualTo(204);

        for (SignedIn caller : List.of(stranger, former)) {
            HttpResponse<String> response = leave(group, caller);
            assertThat(response.statusCode()).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
        assertThat(leave(UUID.randomUUID(), stranger).statusCode()).isEqualTo(404);
        assertThat(leave("ni-uuid", stranger).statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-007-06")
    void aFormerOwnerWhoTransferredOwnershipCanLeave() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn heir = registeredUser("Dedič");
        UUID group = groups.createGroup(id(owner), "Prenos");
        UUID heirId = join(group, heir, "VIEWER");
        assertThat(transfer(group, owner, transferBody(heirId)).statusCode()).isEqualTo(200);

        assertThat(leave(group, owner).statusCode()).isEqualTo(204);
        assertThat(members.role(group, id(heir))).contains("OWNER");
    }

    @Test
    @Tag("FR-007-06")
    @Tag("FR-007-12")
    void leavingKeepsContactsAndTheLeaversAuditEntries() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn editor = registeredUser("Cene Urednik");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        join(group, editor, "EDITOR");
        assertThat(createContact(group, editor, "Janez")).isEqualTo(201);

        assertThat(leave(group, editor).statusCode()).isEqualTo(204);

        assertThat(auditActorNames(group, owner)).contains("Cene Urednik");
        assertThat(get("/api/groups/" + group + "/contacts", owner.idToken()).body())
                .contains("Janez");
    }

    private HttpResponse<String> delete(String path, SignedIn as) throws Exception {
        return si.contactmanager.support.Http.send(
                "DELETE", url(path), si.contactmanager.support.Http.bearer(as.idToken()));
    }
}

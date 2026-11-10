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

/** Odstranitev člana {@code DELETE /api/groups/{groupId}/members/{memberId}} (FR-007-05, FR-007-10). */
class MemberRemoveIT extends MemberApiTest {

    private SignedIn owner;
    private SignedIn admin;
    private SignedIn editor;
    private SignedIn viewer;
    private UUID group;
    private UUID ownerId;
    private UUID adminId;
    private UUID editorId;
    private UUID viewerId;

    private void setUp() throws Exception {
        owner = registeredUser("Ana Novak");
        admin = registeredUser("Bojan Kos");
        editor = registeredUser("Cene Urednik");
        viewer = registeredUser("Dana Bralec");
        group = groups.createGroup(id(owner), "Projekt FERI");
        ownerId = members.memberId(group, id(owner));
        adminId = join(group, admin, "ADMIN");
        editorId = join(group, editor, "EDITOR");
        viewerId = join(group, viewer, "VIEWER");
    }

    @ParameterizedTest(name = "admin odstrani {0}")
    @ValueSource(strings = {"EDITOR", "VIEWER"})
    @Tag("FR-007-05")
    void adminRemovesLowerMembersAndTheyLoseAccessImmediately(String role) throws Exception {
        setUp();
        SignedIn target = role.equals("EDITOR") ? editor : viewer;
        UUID targetId = role.equals("EDITOR") ? editorId : viewerId;
        assertThat(get("/api/groups/" + group, target.idToken()).statusCode()).isEqualTo(200);
        assertThat(get("/api/groups", target.idToken()).body()).contains(group.toString());

        HttpResponse<String> response = remove(group, admin, targetId);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
        assertThat(members.role(group, id(target))).isEmpty();
        assertThat(get("/api/groups/" + group, target.idToken()).statusCode()).isEqualTo(404);
        assertThat(get("/api/groups/" + group + "/contacts", target.idToken()).statusCode())
                .isEqualTo(404);
        assertThat(get("/api/groups/" + group + "/members", target.idToken()).statusCode())
                .isEqualTo(404);
        assertThat(get("/api/groups/" + group + "/audit", target.idToken()).statusCode())
                .isEqualTo(404);
        HttpResponse<String> overview = get("/api/groups", target.idToken());
        assertThat(overview.statusCode()).isEqualTo(200);
        assertThat(overview.body()).doesNotContain(group.toString());
    }

    @ParameterizedTest(name = "lastnik odstrani {0}")
    @ValueSource(strings = {"ADMIN", "EDITOR", "VIEWER"})
    @Tag("FR-007-05")
    void ownerRemovesAnyLowerMember(String role) throws Exception {
        setUp();
        UUID targetId = switch (role) {
            case "ADMIN" -> adminId;
            case "EDITOR" -> editorId;
            default -> viewerId;
        };

        assertThat(remove(group, owner, targetId).statusCode()).isEqualTo(204);

        assertThat(members.count(group)).isEqualTo(3);
        assertThat(members.ownerCount(group)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-05")
    void nobodyCanRemoveEqualOrHigherMembersOrThemselves() throws Exception {
        setUp();
        SignedIn second = registeredUser("Drugi Admin");
        UUID secondId = join(group, second, "ADMIN");

        for (UUID target : List.of(secondId, ownerId, adminId)) {
            HttpResponse<String> response = remove(group, admin, target);
            assertThat(response.statusCode()).as("admin → %s", target).isEqualTo(403);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        }
        assertThat(remove(group, owner, ownerId).statusCode()).isEqualTo(403);
        assertThat(members.count(group)).isEqualTo(5);
        assertThat(members.ownerCount(group)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-05")
    void editorAndViewerCannotRemoveAnyone() throws Exception {
        setUp();

        for (SignedIn caller : List.of(editor, viewer)) {
            assertThat(remove(group, caller, viewerId).statusCode()).isEqualTo(403);
            assertThat(remove(group, caller, UUID.randomUUID()).statusCode()).isEqualTo(403);
        }
        assertThat(members.count(group)).isEqualTo(4);
    }

    @Test
    @Tag("FR-007-05")
    void removingTheSameMemberTwiceIs404() throws Exception {
        setUp();

        assertThat(remove(group, admin, editorId).statusCode()).isEqualTo(204);
        HttpResponse<String> second = remove(group, owner, editorId);

        assertThat(second.statusCode()).isEqualTo(404);
        assertThat(second.body()).isEmpty();
    }

    @Test
    @Tag("FR-007-05")
    void foreignInvalidOrUnknownMemberIdIs404ForAdminAndOwner() throws Exception {
        setUp();
        SignedIn otherOwner = registeredUser("Druga Lastnica");
        UUID other = groups.createGroup(id(otherOwner), "Druga");
        join(other, registeredUser("Tuji Bralec"), "VIEWER");
        UUID foreign = members.memberId(other, id(otherOwner));

        for (Object unknown : List.of(UUID.randomUUID(), foreign, "ni-uuid")) {
            for (SignedIn caller : List.of(owner, admin)) {
                HttpResponse<String> response = remove(group, caller, unknown);
                assertThat(response.statusCode())
                        .as("%s %s", email(caller), unknown)
                        .isEqualTo(404);
                assertThat(response.body()).isEmpty();
            }
        }
        assertThat(members.count(other)).isEqualTo(2);
    }

    @Test
    @Tag("FR-007-05")
    void editorAndViewerGet403ForUnknownForeignOrInvalidMemberIdNot404() throws Exception {
        setUp();
        SignedIn otherOwner = registeredUser("Druga Lastnica");
        UUID other = groups.createGroup(id(otherOwner), "Druga");
        UUID foreign = members.memberId(other, id(otherOwner));

        for (Object unknown : List.of(UUID.randomUUID(), foreign, "ni-uuid")) {
            for (SignedIn caller : List.of(editor, viewer)) {
                HttpResponse<String> response = remove(group, caller, unknown);
                assertThat(response.statusCode())
                        .as("%s %s", email(caller), unknown)
                        .isEqualTo(403);
                assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
            }
        }
        assertThat(members.count(other)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-05")
    void aRemovedMemberCanBeInvitedAgainAndGetsANewMembership() throws Exception {
        setUp();
        assertThat(remove(group, owner, editorId).statusCode()).isEqualTo(204);

        HttpResponse<String> invitation = post(
                "/api/groups/" + group + "/invitations",
                owner.idToken(),
                "{\"email\":\"" + email(editor) + "\",\"role\":\"VIEWER\"}");
        assertThat(invitation.statusCode()).isEqualTo(201);
        String invitationId = (String) json(invitation.body()).get("id");
        assertThat(post("/api/invitations/" + invitationId + "/accept", editor.idToken(), null)
                        .statusCode())
                .isEqualTo(200);

        assertThat(members.role(group, id(editor))).contains("VIEWER");
        assertThat(members.memberId(group, id(editor))).isNotEqualTo(editorId);
    }

    @Test
    @Tag("FR-007-05")
    void pendingInvitationsSentByTheRemovedMemberStayValid() throws Exception {
        setUp();
        SignedIn invitee = registeredUser("Povabljena");
        UUID invitation = invitations.invite(group, id(invitee), id(admin), "VIEWER");

        assertThat(remove(group, owner, adminId).statusCode()).isEqualTo(204);

        assertThat(invitations.exists(invitation)).isTrue();
        assertThat(post("/api/invitations/" + invitation + "/accept", invitee.idToken(), null)
                        .statusCode())
                .isEqualTo(200);
    }

    @Test
    @Tag("FR-007-05")
    @Tag("FR-007-12")
    void auditEntriesOfARemovedMemberKeepTheirName() throws Exception {
        setUp();
        assertThat(createContact(group, editor, "Janez")).isEqualTo(201);

        assertThat(remove(group, admin, editorId).statusCode()).isEqualTo(204);

        assertThat(auditActorNames(group, owner)).contains("Cene Urednik");
    }

    @Test
    @Tag("FR-007-10")
    void archivedGroupRejectsRemovalsWith409ButRoleAndRelationComeFirst() throws Exception {
        setUp();
        groups.archive(group);

        for (SignedIn caller : List.of(owner, admin)) {
            HttpResponse<String> response = remove(group, caller, viewerId);
            assertThat(response.statusCode()).as("%s", email(caller)).isEqualTo(409);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        }
        assertThat(remove(group, editor, viewerId).statusCode()).isEqualTo(403);
        assertThat(remove(group, viewer, editorId).statusCode()).isEqualTo(403);
        assertThat(remove(group, admin, ownerId).statusCode()).isEqualTo(403);
        assertThat(remove(group, admin, adminId).statusCode()).isEqualTo(403);
        assertThat(members.count(group)).isEqualTo(4);
    }

    @Test
    @Tag("FR-007-10")
    void permanentlyArchivedGroupRejectsRemovalWith409() throws Exception {
        setUp();
        groups.makePermanentlyArchived(group);

        HttpResponse<String> response = remove(group, admin, viewerId);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        assertThat(members.count(group)).isEqualTo(3);
    }

    @Test
    @Tag("FR-007-05")
    void roleChangeOfAMemberRemovedInTheMeantimeIs404() throws Exception {
        setUp();
        assertThat(remove(group, admin, editorId).statusCode()).isEqualTo(204);

        HttpResponse<String> response = changeRole(group, owner, editorId, roleBody("VIEWER", 0));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @Test
    @Tag("FR-007-05")
    @Tag("FR-007-10")
    void aMissingTargetIs404EvenInAnArchivedGroup() throws Exception {
        setUp();
        groups.archive(group);

        for (SignedIn caller : List.of(owner, admin)) {
            HttpResponse<String> response = remove(group, caller, UUID.randomUUID());
            assertThat(response.statusCode()).as("%s", email(caller)).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
    }

    @Test
    @Tag("FR-007-06")
    void pendingInvitationsSentByAMemberWhoLeftStayValid() throws Exception {
        setUp();
        SignedIn invitee = registeredUser("Povabljena");
        UUID invitation = invitations.invite(group, id(invitee), id(admin), "VIEWER");

        assertThat(leave(group, admin).statusCode()).isEqualTo(204);

        assertThat(invitations.exists(invitation)).isTrue();
        assertThat(post("/api/invitations/" + invitation + "/accept", invitee.idToken(), null)
                        .statusCode())
                .isEqualTo(200);
    }
}

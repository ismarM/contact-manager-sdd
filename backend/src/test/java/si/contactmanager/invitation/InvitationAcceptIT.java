package si.contactmanager.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.invitation.support.InvitationApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import tools.jackson.core.type.TypeReference;

/** Sprejem povabila {@code POST /api/invitations/{invitationId}/accept} (FR-006-08, FR-006-09, FR-006-12). */
class InvitationAcceptIT extends InvitationApiTest {

    private static final TypeReference<List<Map<String, Object>>> ROWS = new TypeReference<>() {};

    @Test
    @Tag("FR-006-08")
    void acceptJoinsTheGroupWithTheOfferedRole() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");

        HttpResponse<String> response = accept(invitation, invitee);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .isEqualTo(Map.of(
                        "groupId", group.toString(), "title", "Projekt FERI", "role", "EDITOR", "archived", false));
        assertThat(invitations.memberRole(group, id(invitee))).contains("EDITOR");
        assertThat(invitations.exists(invitation)).isFalse();
        List<Map<String, Object>> sections = JSON.convertValue(
                json(get("/api/groups", invitee.idToken()).body()).get("sections"), ROWS);
        assertThat(sections).extracting(s -> s.get("role")).contains("EDITOR");
        assertThat(get("/api/groups/" + group, invitee.idToken()).statusCode()).isEqualTo(200);
    }

    @Test
    @Tag("FR-006-09")
    void acceptIntoAnArchivedGroupGivesViewOnlyAccess() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Arhivirana");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");
        groups.archive(group);

        HttpResponse<String> response = accept(invitation, invitee);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("archived", true).containsEntry("role", "EDITOR");
        assertThat(invitations.memberRole(group, id(invitee))).contains("EDITOR");
        List<Map<String, Object>> archived = JSON.convertValue(
                json(get("/api/groups/archived", invitee.idToken()).body()).get("items"), ROWS);
        assertThat(archived).extracting(g -> g.get("id")).contains(group.toString());
        HttpResponse<String> write =
                post("/api/groups/" + group + "/contacts", invitee.idToken(), "{\"firstName\":\"Janez\"}");
        assertThat(write.statusCode()).isEqualTo(409);
        assertThat(json(write.body())).containsEntry("code", "GROUP_ARCHIVED");
    }

    @Test
    @Tag("FR-006-09")
    void editorWritesAfterTheOwnerUnarchives() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Arhivirana");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");
        groups.archive(group);
        accept(invitation, invitee);

        assertThat(post("/api/groups/" + group + "/unarchive", owner.idToken(), null)
                        .statusCode())
                .isEqualTo(200);
        HttpResponse<String> write =
                post("/api/groups/" + group + "/contacts", invitee.idToken(), "{\"firstName\":\"Janez\"}");

        assertThat(write.statusCode()).isEqualTo(201);
    }

    @Test
    @Tag("FR-006-09")
    void acceptIntoAPermanentlyArchivedGroupSucceeds() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Trajna");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "VIEWER");
        groups.makePermanentlyArchived(group);

        HttpResponse<String> response = accept(invitation, invitee);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("archived", true);
        assertThat(invitations.memberRole(group, id(invitee))).contains("VIEWER");
    }

    @Test
    @Tag("FR-006-08")
    void alreadyMemberIsAConflictAndTheInvitationIsDeleted() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");
        groups.addMember(group, id(invitee), "VIEWER");

        HttpResponse<String> response = accept(invitation, invitee);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "ALREADY_MEMBER"));
        assertThat(invitations.exists(invitation)).isFalse();
        assertThat(invitations.memberRole(group, id(invitee))).contains("VIEWER");
    }

    @Test
    @Tag("FR-006-12")
    void deletedGroupMakesTheInvitationDisappear() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Za izbris");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");
        assertThat(Http.send("DELETE", url("/api/groups/" + group), Http.bearer(owner.idToken()))
                        .statusCode())
                .isEqualTo(204);

        HttpResponse<String> response = accept(invitation, invitee);

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @Test
    @Tag("FR-006-08")
    void inviterDeletedOrDemotedDoesNotInvalidateTheInvitation() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn demoted = registeredUser("Bojan Kos");
        SignedIn deleted = registeredUser("Cene Izbrisan");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(demoted), "ADMIN");
        UUID first = invitations.invite(group, id(invitee), id(demoted), "EDITOR");
        invitations.setRole(group, id(demoted), "VIEWER");

        HttpResponse<String> afterDemotion = accept(first, invitee);

        assertThat(afterDemotion.statusCode()).isEqualTo(200);
        assertThat(invitations.memberRole(group, id(invitee))).contains("EDITOR");

        UUID other = groups.createGroup(id(owner), "Druga");
        UUID second = invitations.invite(other, id(invitee), id(deleted), "VIEWER");
        invitations.deleteUser(id(deleted));

        HttpResponse<String> afterDeletion = accept(second, invitee);

        assertThat(afterDeletion.statusCode()).isEqualTo(200);
        assertThat(invitations.memberRole(other, id(invitee))).contains("VIEWER");
    }
}

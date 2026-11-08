package si.contactmanager.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.invitation.support.InvitationApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Pravila pošiljanja povabila in vrstni red preverjanj (FR-006-02, FR-006-03; plan.md – vrstni red, feature-map §2.2):
 * 401 → 404 → 403 → 409 GROUP_ARCHIVED → 400 → 409 poslovna pravila.
 */
class InvitationCreateRulesIT extends InvitationApiTest {

    private static void assertCode(HttpResponse<String> response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(json(response.body())).isEqualTo(Map.of("code", code));
    }

    @ParameterizedTest
    @ValueSource(strings = {"ADMIN", "OWNER"})
    @Tag("FR-006-02")
    void adminCannotOfferAdminOrOwner(String role) throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");

        HttpResponse<String> response = send(group, admin, email(invitee), role);

        assertCode(response, 403, "FORBIDDEN");
        assertThat(invitations.count(group)).isZero();
    }

    @Test
    @Tag("FR-006-02")
    void ownerCannotOfferOwner() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");

        assertCode(send(group, owner, email(invitee), "OWNER"), 403, "FORBIDDEN");
        assertThat(invitations.count(group)).isZero();
    }

    @Test
    @Tag("FR-006-03")
    void unregisteredEmailIsRejected() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");

        assertCode(send(group, owner, "nikoli-prijavljen@primer.si", "EDITOR"), 409, "INVITEE_NOT_REGISTERED");
        assertThat(invitations.count(group)).isZero();
    }

    @Test
    @Tag("FR-006-03")
    void existingMemberIsRejected() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn member = registeredUser("Eva Članica");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(member), "VIEWER");

        assertCode(send(group, owner, email(member), "EDITOR"), 409, "ALREADY_MEMBER");
        assertThat(invitations.count(group)).isZero();
    }

    @Test
    @Tag("FR-006-03")
    void pendingInvitationIsRejectedAndStaysUntouched() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");
        UUID existing = invitations.invite(group, id(invitee), id(owner), "VIEWER");
        Map<String, Object> before = invitations.row(existing);

        assertCode(send(group, admin, email(invitee), "EDITOR"), 409, "INVITATION_ALREADY_PENDING");

        assertThat(invitations.count(group)).isEqualTo(1);
        assertThat(invitations.row(existing)).isEqualTo(before);
    }

    @Test
    @Tag("FR-006-03")
    void invitingYourselfIsRejectedEvenWithDifferentCase() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");

        assertCode(send(group, owner, email(owner).toUpperCase(), "EDITOR"), 409, "CANNOT_INVITE_SELF");
        assertThat(invitations.count(group)).isZero();
    }

    @Test
    @Tag("FR-006-03")
    void invalidDataIsReportedPerField() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");

        HttpResponse<String> response =
                post("/api/groups/" + group + "/invitations", owner.idToken(), "{\"email\":\"ana@\"}");

        assertThat(response.statusCode()).isEqualTo(400);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "VALIDATION_FAILED");
        assertThat(body.get("errors"))
                .isEqualTo(List.of(
                        Map.of("field", "email", "code", "INVALID_VALUE"),
                        Map.of("field", "role", "code", "REQUIRED")));
        assertThat(invitations.count(group)).isZero();
    }

    @Test
    @Tag("FR-006-03")
    void adminOfferingOwnerInAnArchivedGroupGetsForbiddenBeforeConflict() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");
        groups.archive(group);

        assertCode(send(group, admin, email(invitee), "OWNER"), 403, "FORBIDDEN");
    }

    @Test
    @Tag("FR-006-03")
    void archivedConflictComesBeforeValidation() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.archive(group);

        HttpResponse<String> response = post(
                "/api/groups/" + group + "/invitations", owner.idToken(), "{\"email\":\"ana@\",\"role\":\"EDITOR\"}");

        assertCode(response, 409, "GROUP_ARCHIVED");
        assertThat(invitations.count(group)).isZero();
    }

    @Test
    @Tag("FR-006-03")
    void archivedAndPermanentlyArchivedGroupsRejectNewInvitations() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID archived = groups.createGroup(id(owner), "Arhivirana");
        groups.archive(archived);
        UUID permanent = groups.createGroup(id(owner), "Trajna");
        groups.addMember(permanent, id(admin), "ADMIN");
        groups.makePermanentlyArchived(permanent);

        assertCode(send(archived, owner, email(invitee), "EDITOR"), 409, "GROUP_ARCHIVED");
        assertCode(send(permanent, admin, email(invitee), "EDITOR"), 409, "GROUP_ARCHIVED");
        assertThat(invitations.count(archived) + invitations.count(permanent)).isZero();
    }

    @Test
    @Tag("FR-006-02")
    void malformedBodyDoesNotRevealTheGroupToANonMember() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn stranger = registeredUser("Tujec");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");

        HttpResponse<String> notMember =
                post("/api/groups/" + group + "/invitations", stranger.idToken(), "{ pokvarjeno");
        HttpResponse<String> missing =
                post("/api/groups/" + UUID.randomUUID() + "/invitations", stranger.idToken(), "{ pokvarjeno");

        assertThat(notMember.statusCode()).isEqualTo(404);
        assertThat(notMember.body()).isEmpty();
        assertThat(missing.statusCode()).isEqualTo(404);
        assertThat(missing.body()).isEmpty();
    }

    @Test
    @Tag("FR-006-02")
    void editorWithAMalformedBodyGetsForbidden() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn editor = registeredUser("Eva Urednik");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(editor), "EDITOR");

        assertCode(post("/api/groups/" + group + "/invitations", editor.idToken(), "{ pokvarjeno"), 403, "FORBIDDEN");
    }

    @Test
    @Tag("FR-006-03")
    void invalidEmailAndMissingRoleAreBothReported() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");

        HttpResponse<String> response =
                post("/api/groups/" + group + "/invitations", owner.idToken(), "{\"email\":\"ana primer.si\"}");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat((List<?>) json(response.body()).get("errors")).hasSize(2);
    }

    @Test
    @Tag("FR-006-03")
    void invitingYourselfWinsOverAlreadyMember() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");

        assertCode(send(group, owner, email(owner), "VIEWER"), 409, "CANNOT_INVITE_SELF");
    }

    @Test
    @Tag("FR-006-03")
    void memberWithAPendingInvitationIsAlreadyMemberNotPending() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn member = registeredUser("Eva Članica");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(member), "VIEWER");
        invitations.invite(group, id(member), id(owner), "EDITOR");

        assertCode(send(group, owner, email(member), "EDITOR"), 409, "ALREADY_MEMBER");
    }

    @Test
    @Tag("FR-006-03")
    void everyRejectionLeavesTheInvitationsOfTheGroupUnchanged() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn other = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        invitations.invite(group, id(other), id(owner), "VIEWER");

        assertCode(send(group, owner, email(owner), "VIEWER"), 409, "CANNOT_INVITE_SELF");
        assertCode(send(group, owner, "neznan@primer.si", "VIEWER"), 409, "INVITEE_NOT_REGISTERED");
        assertCode(send(group, owner, email(other), "VIEWER"), 409, "INVITATION_ALREADY_PENDING");
        HttpResponse<String> invalid = post("/api/groups/" + group + "/invitations", owner.idToken(), "{}");
        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(json(invalid.body())).containsEntry("code", "VALIDATION_FAILED");

        assertThat(invitations.count(group)).isEqualTo(1);
    }
}

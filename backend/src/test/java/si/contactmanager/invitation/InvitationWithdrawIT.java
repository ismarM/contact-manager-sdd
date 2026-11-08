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

/** Umik povabila {@code DELETE /api/groups/{groupId}/invitations/{invitationId}} (FR-006-14, FR-006-15, FR-006-16). */
class InvitationWithdrawIT extends InvitationApiTest {

    @ParameterizedTest
    @ValueSource(strings = {"ADMIN", "EDITOR", "VIEWER"})
    @Tag("FR-006-14")
    void ownerWithdrawsAnyInvitation(String role) throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), role);

        HttpResponse<String> response = withdraw(group, owner, invitation);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
        assertThat(invitations.exists(invitation)).isFalse();
        assertThat(json(get("/api/invitations/count", invitee.idToken()).body()))
                .containsEntry("count", 0);
        assertThat(invitations.countFor(id(invitee))).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"EDITOR", "VIEWER"})
    @Tag("FR-006-14")
    void adminWithdrawsEditorAndViewerInvitationsEvenIfTheOwnerSentThem(String role) throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), role);

        assertThat(withdraw(group, admin, invitation).statusCode()).isEqualTo(204);
        assertThat(invitations.exists(invitation)).isFalse();
    }

    @Test
    @Tag("FR-006-14")
    void adminCannotWithdrawAnAdminInvitation() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");
        UUID invitation = invitations.invite(group, id(invitee), id(admin), "ADMIN");

        HttpResponse<String> response = withdraw(group, admin, invitation);

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
        assertThat(invitations.exists(invitation)).isTrue();
    }

    @Test
    @Tag("FR-006-14")
    void withdrawingIsAllowedInAnArchivedGroup() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        SignedIn other = registeredUser("Drug Povabljen");
        UUID group = groups.createGroup(id(owner), "Arhivirana");
        groups.addMember(group, id(admin), "ADMIN");
        UUID first = invitations.invite(group, id(invitee), id(owner), "EDITOR");
        UUID second = invitations.invite(group, id(other), id(owner), "VIEWER");
        groups.archive(group);

        assertThat(withdraw(group, owner, first).statusCode()).isEqualTo(204);
        assertThat(withdraw(group, admin, second).statusCode()).isEqualTo(204);
    }

    @Test
    @Tag("FR-006-14")
    void permanentlyArchivedGroupAdminWithdrawsEditorButNotAdminInvitations() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editorInvitee = registeredUser("Eva Povabljena");
        SignedIn adminInvitee = registeredUser("Drug Povabljen");
        UUID group = groups.createGroup(id(owner), "Trajna");
        groups.addMember(group, id(admin), "ADMIN");
        UUID editor = invitations.invite(group, id(editorInvitee), id(owner), "EDITOR");
        UUID adminRole = invitations.invite(group, id(adminInvitee), id(owner), "ADMIN");
        groups.makePermanentlyArchived(group);

        assertThat(withdraw(group, admin, editor).statusCode()).isEqualTo(204);
        assertThat(withdraw(group, admin, adminRole).statusCode()).isEqualTo(403);
        assertThat(invitations.exists(adminRole)).isTrue();
    }

    @Test
    @Tag("FR-006-16")
    void invitationOfAnotherGroupIs404() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID mine = groups.createGroup(id(owner), "Moja");
        UUID other = groups.createGroup(id(owner), "Druga");
        UUID invitation = invitations.invite(other, id(invitee), id(owner), "VIEWER");

        HttpResponse<String> response = withdraw(mine, owner, invitation);

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertThat(invitations.exists(invitation)).isTrue();
    }

    @Test
    @Tag("FR-006-16")
    void editorGets403BeforeAdminGets404ForUnknownInvitations() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editor = registeredUser("Eva Urednik");
        SignedIn invitee = registeredUser("Povabljen");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");
        groups.addMember(group, id(editor), "EDITOR");
        UUID other = groups.createGroup(id(owner), "Druga");
        UUID foreignAdminInvitation = invitations.invite(other, id(invitee), id(owner), "ADMIN");

        for (Object unknown : List.of(UUID.randomUUID(), foreignAdminInvitation, "ni-uuid")) {
            assertThat(withdraw(group, editor, unknown).statusCode())
                    .as("urednik %s", unknown)
                    .isEqualTo(403);
            HttpResponse<String> asAdmin = withdraw(group, admin, unknown);
            assertThat(asAdmin.statusCode()).as("admin %s", unknown).isEqualTo(404);
            assertThat(asAdmin.body()).isEmpty();
        }
        assertThat(invitations.exists(foreignAdminInvitation)).isTrue();
    }

    @Test
    @Tag("FR-006-16")
    void missingProcessedOrMalformedInvitationIs404() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn accepting = registeredUser("Prva Povabljena");
        SignedIn declining = registeredUser("Druga Povabljena");
        SignedIn withdrawn = registeredUser("Tretja Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID accepted = invitations.invite(group, id(accepting), id(owner), "VIEWER");
        UUID declined = invitations.invite(group, id(declining), id(owner), "VIEWER");
        UUID gone = invitations.invite(group, id(withdrawn), id(owner), "VIEWER");
        accept(accepted, accepting);
        decline(declined, declining);
        withdraw(group, owner, gone);

        for (Object invitation : List.of(UUID.randomUUID(), accepted, declined, gone, "ni-uuid")) {
            HttpResponse<String> response = withdraw(group, owner, invitation);
            assertThat(response.statusCode()).as("%s", invitation).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
    }

    @Test
    @Tag("FR-006-11")
    void acceptAndDeclineAfterWithdrawAre404AndTheUserIsNotAMember() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");
        assertThat(withdraw(group, owner, invitation).statusCode()).isEqualTo(204);

        assertThat(accept(invitation, invitee).statusCode()).isEqualTo(404);
        assertThat(decline(invitation, invitee).statusCode()).isEqualTo(404);
        assertThat(invitations.memberRole(group, id(invitee))).isEmpty();
    }

    @Test
    @Tag("FR-006-15")
    void theSameUserCanBeInvitedAgainAfterWithdrawing() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");
        withdraw(group, owner, invitation);

        assertThat(send(group, owner, email(invitee), "EDITOR").statusCode()).isEqualTo(201);
    }
}

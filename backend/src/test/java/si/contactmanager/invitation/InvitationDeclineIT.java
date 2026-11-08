package si.contactmanager.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.invitation.support.InvitationApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/** Zavrnitev povabila {@code POST /api/invitations/{invitationId}/decline} (FR-006-10). */
@Tag("FR-006-10")
class InvitationDeclineIT extends InvitationApiTest {

    @Test
    void declineDeletesTheInvitationAndDoesNotAddAMember() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");

        HttpResponse<String> response = decline(invitation, invitee);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
        assertThat(invitations.exists(invitation)).isFalse();
        assertThat(invitations.memberRole(group, id(invitee))).isEmpty();
    }

    @Test
    void theSameUserCanBeInvitedAgainAfterDeclining() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");
        decline(invitation, invitee);

        HttpResponse<String> again = send(group, admin, email(invitee), "VIEWER");

        assertThat(again.statusCode()).isEqualTo(201);
    }

    @Test
    void declineWorksForArchivedAndPermanentlyArchivedGroups() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID archived = groups.createGroup(id(owner), "Arhivirana");
        UUID permanent = groups.createGroup(id(owner), "Trajna");
        UUID first = invitations.invite(archived, id(invitee), id(owner), "VIEWER");
        UUID second = invitations.invite(permanent, id(invitee), id(owner), "VIEWER");
        groups.archive(archived);
        groups.makePermanentlyArchived(permanent);

        assertThat(decline(first, invitee).statusCode()).isEqualTo(204);
        assertThat(decline(second, invitee).statusCode()).isEqualTo(204);
        assertThat(invitations.countFor(id(invitee))).isZero();
    }
}

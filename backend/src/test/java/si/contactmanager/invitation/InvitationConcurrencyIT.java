package si.contactmanager.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Tag;
import si.contactmanager.invitation.support.InvitationApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/**
 * Sočasni zahtevki nad povabili (FR-006-03, FR-006-08, FR-006-11, FR-006-16, SC-004; research R-04, R-05): vsak par
 * zahtevkov se zažene hkrati; končno stanje mora biti skladno z odgovori.
 */
class InvitationConcurrencyIT extends InvitationApiTest {

    private static List<HttpResponse<String>> race(
            Callable<HttpResponse<String>> first, Callable<HttpResponse<String>> second) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<HttpResponse<String>> a = pool.submit(() -> {
                start.await();
                return first.call();
            });
            Future<HttpResponse<String>> b = pool.submit(() -> {
                start.await();
                return second.call();
            });
            start.countDown();
            return List.of(a.get(), b.get());
        }
    }

    private static List<Integer> statuses(List<HttpResponse<String>> responses) {
        return responses.stream().map(HttpResponse::statusCode).toList();
    }

    @RepeatedTest(10)
    @Tag("FR-006-11")
    void acceptAndDeclineOfTheSameInvitationExactlyOneSucceeds() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");

        List<HttpResponse<String>> responses =
                race(() -> accept(invitation, invitee), () -> decline(invitation, invitee));

        int accepted = responses.get(0).statusCode();
        int declined = responses.get(1).statusCode();
        assertThat(accepted == 200 ^ declined == 204).isTrue();
        assertThat(accepted == 200 ? declined : accepted).isEqualTo(404);
        assertThat(invitations.memberRole(group, id(invitee)).isPresent()).isEqualTo(accepted == 200);
        assertThat(invitations.exists(invitation)).isFalse();
    }

    @RepeatedTest(10)
    @Tag("FR-006-16")
    void acceptAndWithdrawOfTheSameInvitationExactlyOneSucceeds() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");

        List<HttpResponse<String>> responses =
                race(() -> accept(invitation, invitee), () -> withdraw(group, owner, invitation));

        int accepted = responses.get(0).statusCode();
        int withdrawn = responses.get(1).statusCode();
        assertThat(accepted == 200 ^ withdrawn == 204).isTrue();
        assertThat(accepted == 200 ? withdrawn : accepted).isEqualTo(404);
        assertThat(invitations.memberRole(group, id(invitee)).isPresent()).isEqualTo(accepted == 200);
    }

    @RepeatedTest(10)
    @Tag("FR-006-08")
    void twoAcceptsGiveOneMembershipAndOne404() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");

        List<HttpResponse<String>> responses =
                race(() -> accept(invitation, invitee), () -> accept(invitation, invitee));

        assertThat(statuses(responses)).containsExactlyInAnyOrder(200, 404);
        assertThat(groups.memberCount(group)).isEqualTo(2);
    }

    @RepeatedTest(10)
    @Tag("FR-006-03")
    void ownerAndAdminInvitingTheSameUserGiveOneInvitationAndOneConflict() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        groups.addMember(group, id(admin), "ADMIN");

        List<HttpResponse<String>> responses = race(
                () -> send(group, owner, email(invitee), "EDITOR"), () -> send(group, admin, email(invitee), "VIEWER"));

        assertThat(statuses(responses)).containsExactlyInAnyOrder(201, 409);
        assertThat(responses.stream()
                        .filter(r -> r.statusCode() == 409)
                        .findFirst()
                        .orElseThrow()
                        .body())
                .contains("INVITATION_ALREADY_PENDING");
        assertThat(invitations.count(group)).isEqualTo(1);
    }

    @RepeatedTest(10)
    @Tag("FR-006-09")
    void acceptSucceedsRegardlessOfAConcurrentArchive() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");

        List<HttpResponse<String>> responses = race(
                () -> accept(invitation, invitee),
                () -> post("/api/groups/" + group + "/archive", owner.idToken(), null));

        assertThat(responses.get(0).statusCode()).isEqualTo(200);
        assertThat(responses.get(1).statusCode()).isEqualTo(200);
        assertThat(invitations.memberRole(group, id(invitee))).contains("EDITOR");
    }

    @RepeatedTest(10)
    @Tag("FR-006-08")
    void acceptAndDeleteOfAGroupWithASingleMemberStayConsistent() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Za izbris");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");

        List<HttpResponse<String>> responses = race(
                () -> accept(invitation, invitee),
                () -> Http.send("DELETE", url("/api/groups/" + group), Http.bearer(owner.idToken())));

        int accepted = responses.get(0).statusCode();
        int deleted = responses.get(1).statusCode();
        if (deleted == 204) {
            assertThat(accepted).isEqualTo(404);
            assertThat(groups.exists(group)).isFalse();
        } else {
            assertThat(accepted).isEqualTo(200);
            assertThat(deleted).isEqualTo(409);
            assertThat(responses.get(1).body()).contains("GROUP_HAS_OTHER_MEMBERS");
            assertThat(invitations.memberRole(group, id(invitee))).contains("EDITOR");
        }
    }

    @RepeatedTest(10)
    @Tag("FR-006-03")
    void sendingAndArchivingNeverLeaveAnInvitationInAnArchivedGroup() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");

        List<HttpResponse<String>> responses = race(
                () -> send(group, owner, email(invitee), "EDITOR"),
                () -> post("/api/groups/" + group + "/archive", owner.idToken(), null));

        int sent = responses.get(0).statusCode();
        assertThat(responses.get(1).statusCode()).isEqualTo(200);
        assertThat(sent).isIn(201, 409);
        if (sent == 409) {
            assertThat(responses.get(0).body()).contains("GROUP_ARCHIVED");
            assertThat(invitations.count(group)).isZero();
        } else {
            assertThat(invitations.count(group)).isEqualTo(1);
        }
    }
}

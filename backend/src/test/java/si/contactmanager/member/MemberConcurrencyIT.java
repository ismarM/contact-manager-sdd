package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Tag;
import si.contactmanager.member.support.MemberApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Stresni dodatek k {@link MemberLockingIT} (SC-002, SC-003): sočasni zahtevki, sproženi hkrati (zapah), vsak scenarij
 * 10-krat. Dokaz uporabe zaklepa je deterministični test; tu se preverjajo končna stanja in invarianta enega lastnika.
 */
class MemberConcurrencyIT extends MemberApiTest {

    private static final int REPETITIONS = 10;

    private List<HttpResponse<String>> concurrently(List<Callable<HttpResponse<String>>> requests) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(requests.size());
        try {
            CountDownLatch ready = new CountDownLatch(requests.size());
            CountDownLatch go = new CountDownLatch(1);
            List<Future<HttpResponse<String>>> futures = new ArrayList<>();
            for (Callable<HttpResponse<String>> request : requests) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return request.call();
                }));
            }
            ready.await();
            go.countDown();
            List<HttpResponse<String>> responses = new ArrayList<>();
            for (Future<HttpResponse<String>> future : futures) {
                responses.add(future.get(60, TimeUnit.SECONDS));
            }
            return responses;
        } finally {
            pool.shutdownNow();
        }
    }

    private static List<Integer> statuses(List<HttpResponse<String>> responses) {
        return responses.stream().map(HttpResponse::statusCode).sorted().toList();
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-08")
    void concurrentLeavingOfAPermanentlyArchivedGroupKeepsExactlyOneMember() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn first = registeredUser("Prvi");
        SignedIn second = registeredUser("Drugi");
        UUID group = groups.createGroup(id(owner), "Trajna");
        join(group, first, "ADMIN");
        join(group, second, "VIEWER");
        groups.makePermanentlyArchived(group);

        List<HttpResponse<String>> responses =
                concurrently(List.of(() -> leave(group, first), () -> leave(group, second)));

        assertThat(statuses(responses)).containsExactly(204, 409);
        assertThat(members.count(group)).isEqualTo(1);
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-08")
    void threeConcurrentLeaversOfAPermanentlyArchivedGroupLeaveOneMember() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        List<SignedIn> users = List.of(registeredUser("Prvi"), registeredUser("Drugi"), registeredUser("Tretji"));
        UUID group = groups.createGroup(id(owner), "Trajna");
        users.forEach(user -> groups.addMember(group, id(user), "VIEWER"));
        groups.makePermanentlyArchived(group);

        List<HttpResponse<String>> responses = concurrently(users.stream()
                .<Callable<HttpResponse<String>>>map(user -> () -> leave(group, user))
                .toList());

        assertThat(statuses(responses)).containsExactly(204, 204, 409);
        assertThat(members.count(group)).isEqualTo(1);
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-04")
    void concurrentRoleChangesWithTheSameVersionKeepExactlyOne() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editor = registeredUser("Cene Urednik");
        UUID group = groups.createGroup(id(owner), "Vloge");
        join(group, admin, "ADMIN");
        UUID editorId = join(group, editor, "EDITOR");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> changeRole(group, owner, editorId, roleBody("VIEWER", 0)),
                () -> changeRole(group, admin, editorId, roleBody("VIEWER", 0))));

        // enaka dodeljena vloga, dovoljena obema: poraženec vedno dobi VERSION_CONFLICT (ne 403 zaradi vrstnega reda)
        assertThat(statuses(responses)).containsExactly(200, 409);
        assertThat(members.version(group, id(editor))).isEqualTo(1);
        assertThat(members.role(group, id(editor))).contains("VIEWER");
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-09")
    void concurrentTransfersLeaveExactlyOneOwner() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn first = registeredUser("Prvi");
        SignedIn second = registeredUser("Drugi");
        UUID group = groups.createGroup(id(owner), "Prenos");
        UUID firstId = join(group, first, "VIEWER");
        UUID secondId = join(group, second, "ADMIN");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> transfer(group, owner, transferBody(firstId)),
                () -> transfer(group, owner, transferBody(secondId))));

        assertThat(statuses(responses)).containsExactly(200, 403);
        assertThat(members.ownerCount(group)).isEqualTo(1);
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-09")
    void transferWhileTheTargetLeavesIsConsistent() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn target = registeredUser("Cilj");
        UUID group = groups.createGroup(id(owner), "Prenos in odhod");
        UUID targetId = join(group, target, "VIEWER");

        List<HttpResponse<String>> responses =
                concurrently(List.of(() -> transfer(group, owner, transferBody(targetId)), () -> leave(group, target)));

        // prenos, nato zapustitev novega lastnika (200, 409) ali zapustitev, nato prenos (204, 409)
        assertThat(statuses(responses)).isIn(List.of(200, 409), List.of(204, 409));
        assertThat(members.ownerCount(group)).isEqualTo(1);
        // (200, 409): prenos uspel, novi lastnik ne more zapustiti → 2 člana; (204, 409): cilj je odšel, prenos
        // zavrnjen → 1 član
        assertThat(members.count(group)).isEqualTo(statuses(responses).contains(200) ? 2 : 1);
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-10")
    void roleChangeWhileArchivingNeverChangesAnArchivedGroup() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editor = registeredUser("Cene Urednik");
        UUID group = groups.createGroup(id(owner), "Arhiviranje");
        join(group, admin, "ADMIN");
        UUID editorId = join(group, editor, "EDITOR");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> post("/api/groups/" + group + "/archive", owner.idToken(), null),
                () -> changeRole(group, admin, editorId, roleBody("VIEWER", 0))));

        assertThat(responses.get(0).statusCode()).isEqualTo(200);
        assertThat(responses.get(1).statusCode()).isIn(200, 409);
        String role = members.role(group, id(editor)).orElseThrow();
        assertThat(role).isEqualTo(responses.get(1).statusCode() == 200 ? "VIEWER" : "EDITOR");
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-05")
    void removalAndRoleChangeOfTheSameMemberLeaveAConsistentState() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editor = registeredUser("Cene Urednik");
        UUID group = groups.createGroup(id(owner), "Odstranitev");
        join(group, admin, "ADMIN");
        UUID editorId = join(group, editor, "EDITOR");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> remove(group, owner, editorId), () -> changeRole(group, admin, editorId, roleBody("VIEWER", 0))));

        assertThat(responses.get(0).statusCode()).isEqualTo(204);
        assertThat(responses.get(1).statusCode()).isIn(200, 404);
        assertThat(members.role(group, id(editor))).isEmpty();
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-05")
    void invitationAcceptedWhileTheInviterIsRemovedStillAddsTheMember() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn invitee = registeredUser("Povabljena");
        UUID group = groups.createGroup(id(owner), "Povabilo");
        UUID adminId = join(group, admin, "ADMIN");
        UUID invitation = invitations.invite(group, id(invitee), id(admin), "VIEWER");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> remove(group, owner, adminId),
                () -> post("/api/invitations/" + invitation + "/accept", invitee.idToken(), null)));

        assertThat(statuses(responses)).containsExactly(200, 204);
        assertThat(members.count(group)).isEqualTo(2);
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-10")
    void transferWhileArchivingEitherTransfersBeforeOrIsRejectedAsArchived() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn target = registeredUser("Cilj");
        UUID group = groups.createGroup(id(owner), "Prenos in arhiv");
        UUID targetId = join(group, target, "ADMIN");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> transfer(group, owner, transferBody(targetId)),
                () -> post("/api/groups/" + group + "/archive", owner.idToken(), null)));

        int transfer = responses.get(0).statusCode();
        int archive = responses.get(1).statusCode();
        // prenos pred arhiviranjem: arhiviranje izvede že bivši lastnik → 403; arhiviranje pred prenosom: 409
        assertThat(List.of(transfer, archive)).isIn(List.of(200, 403), List.of(409, 200));
        assertThat(members.ownerCount(group)).isEqualTo(1);
        assertThat(members.role(group, id(target))).contains(transfer == 200 ? "OWNER" : "ADMIN");
        assertThat(members.role(group, id(owner))).contains(transfer == 200 ? "ADMIN" : "OWNER");
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-09")
    void transferWhileTheTargetsRoleChangesLeavesExactlyOneOwner() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn target = registeredUser("Cilj");
        UUID group = groups.createGroup(id(owner), "Prenos in vloga");
        join(group, admin, "ADMIN");
        UUID targetId = join(group, target, "VIEWER");

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> transfer(group, owner, transferBody(targetId)),
                () -> changeRole(group, admin, targetId, roleBody("EDITOR", 0))));

        // sprememba vloge pred prenosom (200, 200) ali prenos pred spremembo: cilj je že lastnik (200, 403)
        assertThat(responses.get(0).statusCode()).isEqualTo(200);
        assertThat(responses.get(1).statusCode()).isIn(200, 403);
        assertThat(members.ownerCount(group)).isEqualTo(1);
        assertThat(members.role(group, id(target))).contains("OWNER");
    }

    @RepeatedTest(REPETITIONS)
    @Tag("FR-007-08")
    void leavingWhileThePermanentlyArchivedGroupIsDeletedDoesNotFail() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn last = registeredUser("Zadnji");
        UUID group = groups.createGroup(id(owner), "Trajna in izbris");
        join(group, last, "VIEWER");
        groups.makePermanentlyArchived(group);

        List<HttpResponse<String>> responses = concurrently(List.of(
                () -> leave(group, last),
                () -> si.contactmanager.support.Http.send(
                        "DELETE", url("/api/groups/" + group), si.contactmanager.support.Http.bearer(last.idToken()))));

        // zadnji član ne more zapustiti (409), če izbris še ni tekel; po izbrisu skupine ni več (404)
        assertThat(responses.get(0).statusCode()).isIn(404, 409);
        assertThat(responses.get(1).statusCode()).isEqualTo(204);
        assertThat(groups.exists(group)).isFalse();
    }
}

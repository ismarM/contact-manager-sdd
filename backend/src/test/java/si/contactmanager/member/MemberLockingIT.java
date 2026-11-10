package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.member.support.MemberApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Deterministična sočasnost (research R-11, SC-002, SC-003): test na ločeni povezavi zadrži {@code SELECT … FOR UPDATE}
 * na vrstici skupine, pošlje zahtevke, preveri, da čakajo na zaklep (še nimajo odgovora, {@code pg_stat_activity}), nato
 * zaklep sprosti in preveri izide. Brez zaklepa v kodi bi zahteve vrnile odgovor med zadrževanjem in test bi padel.
 */
class MemberLockingIT extends MemberApiTest {

    private final ExecutorService pool = Executors.newFixedThreadPool(6);

    @AfterEach
    void closePool() {
        pool.shutdownNow();
    }

    /** Sproži zahtevke med zadržanim zaklepom skupine in vrne njihove odgovore po sprostitvi. */
    private List<HttpResponse<String>> underHeldLock(UUID group, List<Callable<HttpResponse<String>>> requests)
            throws Exception {
        try (Connection holder = jdbc.getDataSource().getConnection()) {
            holder.setAutoCommit(false);
            try (PreparedStatement lock =
                    holder.prepareStatement("select 1 from contact_group where id = ? for update")) {
                lock.setObject(1, group);
                lock.executeQuery();
            }
            List<CompletableFuture<HttpResponse<String>>> futures = new ArrayList<>();
            for (Callable<HttpResponse<String>> request : requests) {
                futures.add(CompletableFuture.supplyAsync(
                        () -> {
                            try {
                                return request.call();
                            } catch (Exception e) {
                                throw new IllegalStateException(e);
                            }
                        },
                        pool));
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while (waitingOnLocks() < requests.size() && System.nanoTime() < deadline) {
                Thread.sleep(50);
            }
            Thread.sleep(500);
            assertThat(futures).as("zahtevki morajo čakati na zaklep skupine").noneMatch(CompletableFuture::isDone);
            assertThat(waitingOnLocks())
                    .as("transakcije čakajo na zaklep vrstice")
                    .isGreaterThanOrEqualTo(requests.size());
            holder.commit();
            List<HttpResponse<String>> responses = new ArrayList<>();
            for (CompletableFuture<HttpResponse<String>> future : futures) {
                responses.add(future.get(30, TimeUnit.SECONDS));
            }
            return responses;
        }
    }

    private int waitingOnLocks() {
        Integer count = jdbc.queryForObject(
                "select count(*) from pg_stat_activity where datname = current_database()"
                        + " and wait_event_type = 'Lock' and state = 'active'",
                Integer.class);
        return count == null ? 0 : count;
    }

    private static List<Integer> statuses(List<HttpResponse<String>> responses) {
        return responses.stream().map(HttpResponse::statusCode).sorted().toList();
    }

    @Test
    @Tag("FR-007-08")
    void twoLeaversOfAPermanentlyArchivedGroupAreSerializedAndExactlyOneRemains() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn first = registeredUser("Prvi");
        SignedIn second = registeredUser("Drugi");
        UUID group = groups.createGroup(id(owner), "Trajna");
        join(group, first, "ADMIN");
        join(group, second, "VIEWER");
        groups.makePermanentlyArchived(group);

        List<HttpResponse<String>> responses =
                underHeldLock(group, List.of(() -> leave(group, first), () -> leave(group, second)));

        assertThat(statuses(responses)).containsExactly(204, 409);
        HttpResponse<String> rejected = responses.stream()
                .filter(r -> r.statusCode() == 409)
                .findFirst()
                .orElseThrow();
        assertThat(json(rejected.body())).isEqualTo(Map.of("code", "LAST_MEMBER_CANNOT_LEAVE"));
        assertThat(members.count(group)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-09")
    void twoOwnershipTransfersAreSerializedSecondOneIs403AndThereIsOneOwner() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn first = registeredUser("Prvi");
        SignedIn second = registeredUser("Drugi");
        UUID group = groups.createGroup(id(owner), "Prenos");
        UUID firstId = join(group, first, "VIEWER");
        UUID secondId = join(group, second, "EDITOR");

        List<HttpResponse<String>> responses = underHeldLock(
                group,
                List.of(
                        () -> transfer(group, owner, transferBody(firstId)),
                        () -> transfer(group, owner, transferBody(secondId))));

        assertThat(statuses(responses)).containsExactly(200, 403);
        assertThat(members.ownerCount(group)).isEqualTo(1);
        assertThat(members.role(group, id(owner))).contains("ADMIN");
    }

    @Test
    @Tag("FR-007-04")
    void twoRoleChangesWithTheSameVersionOneWinsAndOneGetsAConflict() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editor = registeredUser("Cene Urednik");
        UUID group = groups.createGroup(id(owner), "Vloge");
        join(group, admin, "ADMIN");
        UUID editorId = join(group, editor, "EDITOR");

        List<HttpResponse<String>> responses = underHeldLock(
                group,
                List.of(
                        () -> changeRole(group, owner, editorId, roleBody("VIEWER", 0)),
                        () -> changeRole(group, admin, editorId, roleBody("VIEWER", 0))));

        // oba klicatelja smeta dodeliti VIEWER (strogo nižja vloga), zato poraženec ne glede na vrstni red dobi
        // 409 VERSION_CONFLICT (zastarela verzija je pred 400 UNCHANGED), ne 403
        assertThat(statuses(responses)).containsExactly(200, 409);
        HttpResponse<String> conflict = responses.stream()
                .filter(r -> r.statusCode() == 409)
                .findFirst()
                .orElseThrow();
        assertThat(json(conflict.body()))
                .containsEntry("code", "VERSION_CONFLICT")
                .containsKey("current");
        assertThat(members.version(group, id(editor))).isEqualTo(1);
        assertThat(members.role(group, id(editor))).contains("VIEWER");
    }

    @Test
    @Tag("FR-007-05")
    void removalAndRoleChangeOfTheSameMemberAreSerialized() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn admin = registeredUser("Bojan Kos");
        SignedIn editor = registeredUser("Cene Urednik");
        UUID group = groups.createGroup(id(owner), "Odstranitev");
        join(group, admin, "ADMIN");
        UUID editorId = join(group, editor, "EDITOR");

        List<HttpResponse<String>> responses = underHeldLock(
                group,
                List.of(
                        () -> remove(group, owner, editorId),
                        () -> changeRole(group, admin, editorId, roleBody("VIEWER", 0))));

        assertThat(responses.get(0).statusCode()).isEqualTo(204);
        assertThat(responses.get(1).statusCode()).isIn(200, 404);
        assertThat(members.role(group, id(editor))).isEmpty();
    }

    @Test
    @Tag("FR-007-09")
    void transferAndLeaveOfTheTargetAreSerialized() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn target = registeredUser("Cilj");
        UUID group = groups.createGroup(id(owner), "Prenos in odhod");
        UUID targetId = join(group, target, "VIEWER");

        List<HttpResponse<String>> responses = underHeldLock(
                group, List.of(() -> transfer(group, owner, transferBody(targetId)), () -> leave(group, target)));

        // vrstni red po zaklepu ni določen: prenos, nato zapustitev novega lastnika (200, 409) ali zapustitev, nato
        // prenos (204, 409)
        assertThat(members.ownerCount(group)).isEqualTo(1);
        assertThat(statuses(responses)).isIn(List.of(200, 409), List.of(204, 409));
        assertThat(members.count(group)).isEqualTo(statuses(responses).contains(200) ? 2 : 1);
    }

    @Test
    @Tag("FR-007-10")
    void transferAndArchiveAreSerializedAndNeverTransferInAnArchivedGroup() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn target = registeredUser("Cilj");
        UUID group = groups.createGroup(id(owner), "Prenos in arhiv");
        UUID targetId = join(group, target, "ADMIN");

        List<HttpResponse<String>> responses = underHeldLock(
                group,
                List.of(
                        () -> transfer(group, owner, transferBody(targetId)),
                        () -> post("/api/groups/" + group + "/archive", owner.idToken(), null)));

        // vrstni red po zaklepu ni določen: prenos, nato arhiviranje s strani bivšega lastnika (200, 403) ali
        // arhiviranje, nato zavrnjen prenos (409, 200)
        assertThat(List.of(responses.get(0).statusCode(), responses.get(1).statusCode()))
                .isIn(List.of(200, 403), List.of(409, 200));
        assertThat(members.ownerCount(group)).isEqualTo(1);
    }

    @Test
    @Tag("FR-007-10")
    void requestsRejectedBeforeTheTransactionAreNotBlockedByTheGroupLock() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn viewer = registeredUser("Bralec");
        SignedIn stranger = registeredUser("Tujec");
        UUID group = groups.createGroup(id(owner), "Zaklep");
        join(group, viewer, "VIEWER");

        try (Connection holder = jdbc.getDataSource().getConnection()) {
            holder.setAutoCommit(false);
            try (PreparedStatement lock =
                    holder.prepareStatement("select 1 from contact_group where id = ? for update")) {
                lock.setObject(1, group);
                lock.executeQuery();
            }
            CompletableFuture<List<Integer>> early = CompletableFuture.supplyAsync(
                    () -> {
                        try {
                            return List.of(
                                    changeRole(group, viewer, UUID.randomUUID(), roleBody("EDITOR", 0))
                                            .statusCode(),
                                    remove(group, stranger, UUID.randomUUID()).statusCode(),
                                    transfer(group, viewer, transferBody(UUID.randomUUID()))
                                            .statusCode());
                        } catch (Exception e) {
                            throw new IllegalStateException(e);
                        }
                    },
                    pool);
            List<Integer> statuses = early.get(10, TimeUnit.SECONDS);
            holder.commit();

            assertThat(statuses).containsExactly(403, 404, 403);
        }
    }
}

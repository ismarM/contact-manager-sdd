package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import tools.jackson.databind.JsonNode;

/**
 * Deterministična sočasnost izbrisa računa (R-04, FR-012-06, -13, -15; analiza H1): test na ločeni povezavi zadrži
 * {@code SELECT … FOR UPDATE} na vrstici skupine, spremeni stanje, pošlje zahtevke in preveri, da izbris odloča na
 * novem stanju pod zaklepom. Dvojni izbris istega uporabnika deluje tudi brez skupin.
 */
@Tag("FR-012-06")
@Tag("FR-012-13")
@Tag("FR-012-15")
class AccountDeletionLockingIT extends AccountApiTest {

    private final ExecutorService pool = Executors.newFixedThreadPool(6);

    @AfterEach
    void closePool() {
        pool.shutdownNow();
    }

    /** Spremeni stanje v transakciji, ki drži zaklep skupine. */
    @FunctionalInterface
    private interface HeldChange {
        void apply(Connection holder) throws SQLException;
    }

    private List<HttpResponse<String>> underHeldLock(
            UUID group, HeldChange change, List<Callable<HttpResponse<String>>> requests) throws Exception {
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
            Thread.sleep(300);
            assertThat(futures).as("zahtevki morajo čakati na zaklep skupine").noneMatch(CompletableFuture::isDone);
            change.apply(holder);
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

    private static void update(Connection connection, String sql, Object... params) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                statement.setObject(i + 1, params[i]);
            }
            statement.executeUpdate();
        }
    }

    @Test
    void ownershipTransferredToTheUserWhileTheDeletionWaitsGives409AndNothingIsDeleted() throws Exception {
        SignedIn ana = registeredUser("Ana Lastnica");
        SignedIn x = registeredUser("Iks Prevzame");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(x), "ADMIN");

        List<HttpResponse<String>> responses = underHeldLock(
                group,
                holder -> {
                    update(
                            holder,
                            "update group_member set role = 'ADMIN' where group_id = ? and user_id = ?",
                            group,
                            id(ana));
                    update(
                            holder,
                            "update group_member set role = 'OWNER' where group_id = ? and user_id = ?",
                            group,
                            id(x));
                },
                List.of(() -> deleteAccount(x)));

        HttpResponse<String> response = responses.getFirst();
        assertThat(response.statusCode()).isEqualTo(409);
        JsonNode body = JSON.readTree(response.body());
        assertThat(body.get("code").asString()).isEqualTo("OWNS_ACTIVE_GROUPS");
        assertThat(body.get("groups").get(0).get("title").asString()).isEqualTo("Skupina");
        assertThat(body.get("groups").get(0).get("id").asString()).isEqualTo(group.toString());
        assertThat(account.appUserExists(x.uid())).isTrue();
        assertThat(members.role(group, id(x))).contains("OWNER");
        assertThat(account.tombstone(x.uid())).isEmpty();
        account.assertNoActiveGroupWithoutOwner(group);
    }

    @Test
    void groupUnarchivedWhileTheDeletionWaitsGives409() throws Exception {
        SignedIn x = registeredUser("Iks Odarhivira");
        SignedIn ana = registeredUser("Ana Clan");
        UUID group = archivedGroup(x, "Arhivirana");
        groups.addMember(group, id(ana), "EDITOR");

        List<HttpResponse<String>> responses = underHeldLock(
                group,
                holder -> update(holder, "update contact_group set archived_at = null where id = ?", group),
                List.of(() -> deleteAccount(x)));

        assertThat(responses.getFirst().statusCode()).isEqualTo(409);
        assertThat(JSON.readTree(responses.getFirst().body()).get("code").asString())
                .isEqualTo("OWNS_ACTIVE_GROUPS");
        assertThat(account.appUserExists(x.uid())).isTrue();
        assertThat(groups.archivedAt(group)).isNull();
    }

    @Test
    void membershipRemovedWhileTheDeletionWaitsLetsTheDeletionSucceedWithoutThatGroup() throws Exception {
        SignedIn ana = registeredUser("Ana Odstrani");
        SignedIn x = registeredUser("Iks Odstranjen");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(x), "ADMIN");

        List<HttpResponse<String>> responses = underHeldLock(
                group,
                holder -> update(holder, "delete from group_member where group_id = ? and user_id = ?", group, id(x)),
                List.of(() -> deleteAccount(x)));

        assertThat(responses.getFirst().statusCode()).isIn(204, 202);
        assertThat(groups.exists(group)).isTrue();
        assertThat(members.role(group, id(ana))).contains("OWNER");
        assertThat(account.appUserExists(x.uid())).isFalse();
    }

    @Test
    void twoConcurrentDeletionsOfTheSameUserGiveExactlyOneSuccessAndOne401WithOrWithoutGroups() throws Exception {
        for (int round = 0; round < 12; round++) {
            boolean withGroups = round % 2 == 0;
            SignedIn x = registeredUser("Iks Dvojni " + round);
            if (withGroups) {
                SignedIn ana = registeredUser("Ana Dvojni " + round);
                groups.addMember(activeGroup(ana, "A" + round), id(x), "EDITOR");
                groups.addMember(activeGroup(ana, "B" + round), id(x), "VIEWER");
            }

            CompletableFuture<HttpResponse<String>> first =
                    CompletableFuture.supplyAsync(() -> call(() -> deleteAccount(x)), pool);
            CompletableFuture<HttpResponse<String>> second =
                    CompletableFuture.supplyAsync(() -> call(() -> deleteAccount(x)), pool);
            List<Integer> statuses = List.of(
                    first.get(30, TimeUnit.SECONDS).statusCode(),
                    second.get(30, TimeUnit.SECONDS).statusCode());

            assertThat(statuses.stream().filter(s -> s == 204 || s == 202).count())
                    .as("krog %d (skupine: %s): %s", round, withGroups, statuses)
                    .isEqualTo(1);
            assertThat(statuses.stream().filter(s -> s == 401).count())
                    .as("krog %d: %s", round, statuses)
                    .isEqualTo(1);
            assertThat(account.tombstoneCount(x.uid()))
                    .as("nadgrobnik v krogu %d", round)
                    .isEqualTo(1);
            assertThat(account.appUserExists(x.uid())).isFalse();
        }
    }

    @Test
    void lockingGroupsInIdOrderNeverDeadlocksWithAConcurrentOperationInTheEarlierGroup() throws Exception {
        SignedIn ana = registeredUser("Ana Vrstni red");
        SignedIn x = registeredUser("Iks Vrstni red");
        SignedIn y = registeredUser("Ipsilon Vrstni red");
        UUID first = activeGroup(ana, "Prva");
        UUID second = activeGroup(ana, "Druga");
        groups.addMember(first, id(x), "EDITOR");
        groups.addMember(second, id(x), "EDITOR");
        groups.addMember(first, id(y), "VIEWER");
        assertThat(first.compareTo(second))
                .as("uuidv7 po vrstnem redu nastanka")
                .isNegative();

        // Imetnik drži NIŽJO skupino; ko izbris čaka, poskusi zakleniti VIŠJO. Pri naraščajočem vrstnem redu izbris
        // ne drži nobene skupine, zato imetnik takoj dobi višjo; pri padajočem bi izbris držal višjo in čakal na nižjo
        // → mrtvi objem (SQLSTATE 40P01), ki ga PostgreSQL prekine in test pade.
        List<HttpResponse<String>> responses = underHeldLock(
                first,
                holder -> {
                    try (PreparedStatement lock =
                            holder.prepareStatement("select 1 from contact_group where id = ? for update")) {
                        lock.setObject(1, second);
                        lock.executeQuery();
                    }
                },
                List.of(() -> deleteAccount(x)));

        assertThat(responses.get(0).statusCode()).isIn(204, 202);
        assertThat(post("/api/groups/" + first + "/leave", y.idToken(), null).statusCode())
                .isEqualTo(204);
        assertThat(account.appUserExists(x.uid())).isFalse();
        assertThat(groups.exists(first)).isTrue();
        assertThat(groups.exists(second)).isTrue();
    }

    private interface Call {
        HttpResponse<String> run() throws Exception;
    }

    private static HttpResponse<String> call(Call call) {
        try {
            return call.run();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}

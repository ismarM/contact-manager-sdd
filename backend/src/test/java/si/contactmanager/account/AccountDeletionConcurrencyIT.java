package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * SC-006: sočasni izbris računa in prenos lastništva (ali odarhiviranje) na istega uporabnika; po vsaki ponovitvi velja
 * natanko eno od dveh doslednih stanj, nikoli nearhivirana skupina brez lastnika ali delno izbrisano stanje.
 */
@Tag("FR-012-13")
class AccountDeletionConcurrencyIT extends AccountApiTest {

    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    @AfterEach
    void closePool() {
        pool.shutdownNow();
    }

    private interface Call {
        HttpResponse<String> run() throws Exception;
    }

    @Test
    void deletionRacingAnOwnershipTransferOntoTheSameUserNeverLeavesAnOwnerlessActiveGroup() throws Exception {
        for (int round = 0; round < 100; round++) {
            SignedIn ana = registeredUser("Ana Tek " + round);
            SignedIn x = registeredUser("Iks Tek " + round);
            UUID group = activeGroup(ana, "Skupina " + round);
            UUID xMember = join(group, x, "ADMIN");

            CompletableFuture<HttpResponse<String>> deleting =
                    CompletableFuture.supplyAsync(() -> call(() -> deleteAccount(x)), pool);
            CompletableFuture<HttpResponse<String>> transferring = CompletableFuture.supplyAsync(
                    () -> call(() -> post(
                            "/api/groups/" + group + "/ownership-transfer",
                            ana.idToken(),
                            "{\"memberId\":\"" + xMember + "\"}")),
                    pool);
            HttpResponse<String> deletion = deleting.get(60, TimeUnit.SECONDS);
            HttpResponse<String> transfer = transferring.get(60, TimeUnit.SECONDS);

            account.assertNoActiveGroupWithoutOwner(group);
            if (deletion.statusCode() == 409) {
                assertThat(transfer.statusCode())
                        .as("krog %d: prenos je uspel prvi", round)
                        .isEqualTo(200);
                assertThat(account.appUserExists(x.uid())).isTrue();
                assertThat(members.role(group, id(x))).contains("OWNER");
                assertThat(account.tombstone(x.uid())).isEmpty();
            } else {
                assertThat(deletion.statusCode()).as("krog %d", round).isIn(204, 202);
                assertThat(transfer.statusCode())
                        .as("krog %d: izbris je uspel prvi", round)
                        .isIn(409, 404);
                assertThat(account.appUserExists(x.uid())).isFalse();
                assertThat(account.tombstoneCount(x.uid())).isEqualTo(1);
                assertThat(jdbc.queryForObject(
                                "select count(*) from group_member where group_id = ?", Integer.class, group))
                        .isEqualTo(1);
                assertThat(members.role(group, id(ana))).contains("OWNER");
            }
        }
    }

    @Test
    void deletionRacingUnarchivingOfTheOwnedGroupIsConsistent() throws Exception {
        for (int round = 0; round < 20; round++) {
            SignedIn x = registeredUser("Iks Odarhivira " + round);
            SignedIn b = registeredUser("Bojan Clan " + round);
            UUID group = archivedGroup(x, "Arhivirana " + round);
            groups.addMember(group, id(b), "EDITOR");

            CompletableFuture<HttpResponse<String>> deleting =
                    CompletableFuture.supplyAsync(() -> call(() -> deleteAccount(x)), pool);
            CompletableFuture<HttpResponse<String>> unarchiving = CompletableFuture.supplyAsync(
                    () -> call(() -> post("/api/groups/" + group + "/unarchive", x.idToken(), null)), pool);
            HttpResponse<String> deletion = deleting.get(60, TimeUnit.SECONDS);
            HttpResponse<String> unarchive = unarchiving.get(60, TimeUnit.SECONDS);

            account.assertNoActiveGroupWithoutOwner(group);
            if (deletion.statusCode() == 409) {
                assertThat(unarchive.statusCode()).as("krog %d", round).isEqualTo(200);
                assertThat(account.appUserExists(x.uid())).isTrue();
                assertThat(groups.archivedAt(group)).isNull();
            } else {
                assertThat(deletion.statusCode()).as("krog %d", round).isIn(204, 202);
                assertThat(unarchive.statusCode()).as("krog %d", round).isIn(401, 404, 409);
                assertThat(account.appUserExists(x.uid())).isFalse();
                assertThat(groups.archivedAt(group)).isNotNull();
                assertThat(members.ownerCount(group)).isZero();
            }
        }
    }

    private static HttpResponse<String> call(Call call) {
        try {
            return call.run();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private UUID join(UUID group, SignedIn user, String role) {
        groups.addMember(group, id(user), role);
        return members.memberId(group, id(user));
    }
}

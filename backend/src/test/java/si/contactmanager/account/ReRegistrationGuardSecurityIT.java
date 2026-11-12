package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.http.HttpResponse;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Lokalni račun z UID-jem izbrisane identitete se ne sme znova ustvariti, dokler je nadgrobnik (FR-012-14, -18; R-03):
 * tekma prijava/izbris, neposredno vstavljanje in potek pri izpadu ponudnika.
 */
@Tag("FR-012-14")
@Tag("FR-012-18")
@Import(SwitchableAccessTokens.class)
class ReRegistrationGuardSecurityIT extends AccountApiTest {

    @Autowired
    private IdentityDeletionJob job;

    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    @BeforeEach
    void noForeignOpenTombstones() {
        jdbc.update("delete from deleted_identity where provider_deleted_at is null");
    }

    @AfterEach
    void closePool() {
        SwitchableAccessTokens.reset();
        pool.shutdownNow();
    }

    @Test
    void aSignInRacingTheDeletionNeverRecreatesTheAccount() throws Exception {
        for (int round = 0; round < 100; round++) {
            SignedIn x = registeredUser("Iks Tekma " + round);
            CompletableFuture<HttpResponse<String>> deleting =
                    CompletableFuture.supplyAsync(() -> call(() -> deleteAccount(x)), pool);
            CompletableFuture<List<Integer>> signingIn = CompletableFuture.supplyAsync(
                    () -> {
                        List<Integer> statuses = new ArrayList<>();
                        for (int i = 0; i < 6; i++) {
                            statuses.add(call(() -> put("/api/me", x.idToken(), null))
                                    .statusCode());
                        }
                        return statuses;
                    },
                    pool);

            HttpResponse<String> deletion = deleting.get(60, TimeUnit.SECONDS);
            List<Integer> signIns = signingIn.get(60, TimeUnit.SECONDS);

            assertThat(deletion.statusCode()).as("krog %d", round).isIn(204, 202);
            assertThat(signIns)
                    .as("krog %d: prijave %s", round, signIns)
                    .allMatch(s -> s == 200 || s == 201 || s == 401);
            assertThat(account.appUserExists(x.uid()))
                    .as("račun po izbrisu v krogu %d", round)
                    .isFalse();
            assertThat(account.tombstoneCount(x.uid())).isEqualTo(1);
        }
    }

    @Test
    void directInsertWithATombstonedUidIsRejectedByTheDatabase() {
        String uid = "uid-izbrisan-" + UUID.randomUUID();
        account.insertTombstone(uid, null, 0, java.time.OffsetDateTime.now().plusHours(1));

        assertThatThrownBy(() -> jdbc.update(
                        "insert into app_user (firebase_uid, name, email) values (?, 'Nov', ?)", uid, uniqueEmail()))
                .isInstanceOf(DataAccessException.class)
                .satisfies(error -> {
                    Throwable cause = error;
                    while (cause != null && !(cause instanceof SQLException)) {
                        cause = cause.getCause();
                    }
                    assertThat(cause).isInstanceOf(SQLException.class);
                    assertThat(((SQLException) cause).getSQLState()).isEqualTo("CM401");
                });
        assertThat(account.appUserExists(uid)).isFalse();
    }

    @Test
    void duringPendingDeletionSignInIsRefusedAndAfterSuccessItCreatesAnEmptyNewAccount() throws Exception {
        String sub = "google-" + UUID.randomUUID();
        String email = uniqueEmail();
        SignedIn first = emulator().signInWithGoogle(sub, email, "Pia Ponovno");
        assertThat(put("/api/me", first.idToken(), null).statusCode()).isEqualTo(201);
        int[] status = new int[1];

        // D-77: stanje čakanja z neveljavnimi poverilnicami (resnični 401 emulatorja): identiteta zanesljivo ostane.
        SwitchableAccessTokens.useInvalidCredentials();
        status[0] =
                post("/api/me/deletion", first.idToken(), deletionBody(email)).statusCode();

        assertThat(status[0]).isEqualTo(202);
        assertThat(put("/api/me", first.idToken(), null).statusCode()).isEqualTo(401);
        SignedIn again = emulator().signInWithGoogle(sub, email, "Pia Ponovno");
        assertThat(again.uid()).as("identiteta pri ponudniku še obstaja").isEqualTo(first.uid());
        assertThat(put("/api/me", again.idToken(), null).statusCode()).isEqualTo(401);
        assertThat(account.appUserExists(first.uid())).isFalse();

        SwitchableAccessTokens.reset();
        account.makeDue(first.uid());
        job.runOnce();

        assertThat(account.tombstone(first.uid()).getFirst().get("provider_deleted_at"))
                .isNotNull();
        SignedIn fresh = emulator().signInWithGoogle(sub, email, "Pia Ponovno");
        assertThat(fresh.uid()).as("po uspešnem brisanju nova identiteta").isNotEqualTo(first.uid());
        assertThat(put("/api/me", fresh.idToken(), null).statusCode()).isEqualTo(201);
        assertThat(jdbc.queryForObject("select count(*) from group_member where user_id = ?", Integer.class, id(fresh)))
                .isZero();
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

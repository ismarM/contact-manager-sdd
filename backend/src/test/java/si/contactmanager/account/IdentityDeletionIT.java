package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import si.contactmanager.account.support.AccountApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/**
 * Ponavljanje brisanja identitete in čiščenje nadgrobnikov (FR-012-14, -17, -18; R-07): {@code runOnce()} neposredno
 * (planer je izklopljen), pravi emulator in pravi izpad ({@code pause}).
 */
@Tag("FR-012-14")
@Tag("FR-012-17")
@Tag("FR-012-18")
@Import(SwitchableAccessTokens.class)
class IdentityDeletionIT extends AccountApiTest {

    @Autowired
    private IdentityDeletionJob job;

    private final ExecutorService pool = Executors.newSingleThreadExecutor();

    /** Odprti nadgrobniki drugih testov bi lahko zasedli paket opravila in rušili vrstni red (stabilnost). */
    @BeforeEach
    void noForeignOpenTombstones() {
        jdbc.update("delete from deleted_identity where provider_deleted_at is null");
    }

    @AfterEach
    void closePool() {
        pool.shutdownNow();
        SwitchableAccessTokens.reset();
    }

    private static OffsetDateTime ago(long minutes) {
        return OffsetDateTime.now().minusMinutes(minutes);
    }

    private SignedIn identityOnly(String name) throws Exception {
        return emulator().signInWithGoogle(uniqueEmail(), name);
    }

    @Test
    void dueOpenTombstoneIsCompletedAndTheIdentityIsDeletedAtTheProvider() throws Exception {
        SignedIn identity = identityOnly("Ponovi Uspeh");
        account.insertTombstone(identity.uid(), null, 0, ago(1));

        job.runOnce();

        assertThat(account.tombstone(identity.uid()).getFirst().get("provider_deleted_at"))
                .isNotNull();
        assertThat(emulator().identityExists(identity.uid())).isFalse();
    }

    @Test
    void secondRunIsANoOpAndAnAlreadyDeletedIdentityCountsAsSuccess() throws Exception {
        SignedIn identity = identityOnly("Ponovi Dvakrat");
        account.insertTombstone(identity.uid(), null, 0, ago(1));
        job.runOnce();
        Object closedAt = account.tombstone(identity.uid()).getFirst().get("provider_deleted_at");

        job.runOnce();

        Map<String, Object> row = account.tombstone(identity.uid()).getFirst();
        assertThat(row.get("provider_deleted_at")).isEqualTo(closedAt);
        assertThat(row.get("attempts")).isEqualTo(0);

        String ghost = "uid-ne-obstaja-" + UUID.randomUUID();
        account.insertTombstone(ghost, null, 2, ago(1));

        job.runOnce();

        assertThat(account.tombstone(ghost).getFirst().get("provider_deleted_at"))
                .as("USER_NOT_FOUND = uspeh")
                .isNotNull();
        assertThat(account.tombstone(ghost).getFirst().get("last_error")).isNull();
    }

    @Test
    void providerOutageKeepsTheTombstoneOpenWithBackoffAndNoTransactionIsHeldDuringTheCall() throws Exception {
        SignedIn identity = identityOnly("Ponovi Izpad");
        account.insertTombstone(identity.uid(), null, 0, ago(1));
        SignedIn leased = identityOnly("Ponovi Zakup");
        account.insertTombstone(leased.uid(), null, 0, OffsetDateTime.now().plusSeconds(30));

        Future<?> running;
        emulator().pause();
        try {
            running = pool.submit(() -> job.runOnce());
            Thread.sleep(1500);
            assertThat(account.idleInTransaction())
                    .as("zunanji klic ni znotraj transakcije")
                    .isZero();
            running.get(30, TimeUnit.SECONDS);
        } finally {
            emulator().unpause();
        }

        Map<String, Object> row = account.tombstone(identity.uid()).getFirst();
        assertThat(row.get("provider_deleted_at")).isNull();
        assertThat((Integer) row.get("attempts")).isEqualTo(1);
        assertThat((String) row.get("last_error")).isNotBlank().doesNotContain(identity.uid());
        assertThat(jdbc.queryForObject(
                        "select next_attempt_at > now() + interval '20 seconds' from deleted_identity where firebase_uid = ?",
                        Boolean.class,
                        identity.uid()))
                .as("odmik 30 s po prvem neuspehu")
                .isTrue();
        // D-77: identitete po odmrznitvi ne preverjamo (emulator obdela vmesnjeni zahtevek); stanje v čakanju določa
        // nadgrobnik.
        Map<String, Object> leasedRow = account.tombstone(leased.uid()).getFirst();
        assertThat(leasedRow.get("attempts")).as("zakup: vrstica še ni zapadla").isEqualTo(0);
        assertThat(emulator().identityExists(leased.uid())).isTrue();
    }

    @Test
    void backoffGrowsWithAttemptsAndIsCappedAtOneHour() throws Exception {
        SignedIn five = identityOnly("Odmik Pet");
        SignedIn twenty = identityOnly("Odmik Dvajset");
        account.insertTombstone(five.uid(), null, 5, ago(1));
        account.insertTombstone(twenty.uid(), null, 20, ago(1));

        emulator().paused(job::runOnce);

        assertThat(account.tombstone(five.uid()).getFirst().get("attempts")).isEqualTo(6);
        assertThat(secondsUntilNextAttempt(five.uid())).as("30 s · 2^5 = 960 s").isBetween(900L, 1000L);
        assertThat(account.tombstone(twenty.uid()).getFirst().get("attempts")).isEqualTo(21);
        assertThat(secondsUntilNextAttempt(twenty.uid())).as("največ 1 h").isBetween(3540L, 3610L);
    }

    private long secondsUntilNextAttempt(String uid) {
        Long seconds = jdbc.queryForObject(
                "select extract(epoch from (next_attempt_at - now()))::bigint from deleted_identity where firebase_uid = ?",
                Long.class,
                uid);
        return seconds == null ? -1 : seconds;
    }

    @Test
    void rejectedCredentialsGive202KeepTheTombstoneOpenWithAnErrorCodeAndBackOffWithoutLeaking() throws Exception {
        // Neveljavne poverilnice emulator resnično zavrne z 401 (neodvisno od aplikacije).
        HttpResponse<String> raw = Http.send(
                "POST",
                emulator().baseUrl() + "/identitytoolkit.googleapis.com/v1/projects/"
                        + FirebaseEmulatorContainer.PROJECT_ID + "/accounts:delete",
                Map.of("Authorization", "Bearer nonsense"),
                "{\"localId\":\"nic\"}");
        assertThat(raw.statusCode()).as("emulator zavrne poverilnice").isEqualTo(401);

        SignedIn pia = registeredUser("Pia Poverilnice");
        SignedIn ana = registeredUser("Ana Poverilnice");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(pia), "EDITOR");
        String piaEmail = email(pia);
        SwitchableAccessTokens.useInvalidCredentials();

        HttpResponse<String> response = deleteAccount(pia);

        assertThat(response.statusCode()).isEqualTo(202);
        assertThat(JSON.readTree(response.body()).get("code").asString()).isEqualTo("IDENTITY_DELETION_PENDING");
        assertThat(account.appUserExists(pia.uid()))
                .as("lokalni račun je izbrisan")
                .isFalse();
        assertThat(jdbc.queryForObject(
                        "select count(*) from group_member where group_id = ? and user_id <> ?",
                        Integer.class,
                        group,
                        id(ana)))
                .isZero();
        Map<String, Object> first = account.tombstone(pia.uid()).getFirst();
        assertThat(first.get("provider_deleted_at"))
                .as("brisanje pri ponudniku še čaka")
                .isNull();
        assertThat(first.get("attempts")).isEqualTo(1);
        assertThat(first.get("last_error")).isEqualTo("HTTP_401");
        assertThat(emulator().identityExists(pia.uid()))
                .as("identiteta ostane (401 je bil resničen)")
                .isTrue();

        account.makeDue(pia.uid());
        job.runOnce();

        Map<String, Object> second = account.tombstone(pia.uid()).getFirst();
        assertThat(second.get("attempts"))
                .as("naslednji obhod poveča število poskusov")
                .isEqualTo(2);
        assertThat(second.get("provider_deleted_at")).isNull();
        assertThat(second.get("last_error")).isEqualTo("HTTP_401");
        assertThat(secondsUntilNextAttempt(pia.uid()))
                .as("odmik = delay(attempts pred povečanjem = 1) = 60 s")
                .isBetween(50L, 70L);
        for (Object error : new Object[] {first.get("last_error"), second.get("last_error")}) {
            assertThat((String) error)
                    .doesNotContain(pia.uid())
                    .doesNotContain(piaEmail)
                    .doesNotContain("Pia Poverilnice")
                    .doesNotContain("nonsense")
                    .doesNotContain("Bearer");
        }
        assertThat(emulator().identityExists(pia.uid())).isTrue();

        // Po popravku poverilnic naslednji zapadli obhod uspe.
        SwitchableAccessTokens.reset();
        account.makeDue(pia.uid());
        job.runOnce();

        assertThat(account.tombstone(pia.uid()).getFirst().get("provider_deleted_at"))
                .isNotNull();
        assertThat(emulator().identityExists(pia.uid())).isFalse();
    }

    @Test
    void afterTheProviderRecoversTheNextDueRunSucceeds() throws Exception {
        SignedIn identity = identityOnly("Ponovi Okrevanje");
        account.insertTombstone(identity.uid(), null, 0, ago(1));
        emulator().paused(job::runOnce);
        assertThat(account.tombstone(identity.uid()).getFirst().get("provider_deleted_at"))
                .isNull();

        account.makeDue(identity.uid());
        job.runOnce();

        assertThat(account.tombstone(identity.uid()).getFirst().get("provider_deleted_at"))
                .isNotNull();
        assertThat(emulator().identityExists(identity.uid())).isFalse();
    }

    @Test
    void purgeRemovesOnlyClosedTombstonesOlderThanTwoHoursAndNeverAnOpenOne() throws Exception {
        String old = "uid-star-" + UUID.randomUUID();
        String young = "uid-mlad-" + UUID.randomUUID();
        String open = "uid-odprt-" + UUID.randomUUID();
        account.insertTombstone(old, ago(121), 0, ago(300));
        account.insertTombstone(young, ago(119), 0, ago(300));
        account.insertTombstone(open, null, 5, OffsetDateTime.now().plusHours(1));
        jdbc.update("update deleted_identity set deleted_at = now() - interval '5 hours' where firebase_uid = ?", open);

        job.runOnce();

        assertThat(account.tombstone(old)).as("zaprt, starejši od 2 h").isEmpty();
        assertThat(account.tombstone(young)).as("zaprt, mlajši od 2 h").hasSize(1);
        assertThat(account.tombstone(open)).as("odprt ostane za vedno").hasSize(1);
    }

    @Test
    void signingInAgainWithTheSameGoogleAccountAfterDeletionCreatesANewEmptyAccount() throws Exception {
        String sub = "google-" + UUID.randomUUID();
        String email = uniqueEmail();
        SignedIn first = emulator().signInWithGoogle(sub, email, "Pia Znova");
        assertThat(put("/api/me", first.idToken(), null).statusCode()).isEqualTo(201);
        SignedIn ana = registeredUser("Ana Stara Sled");
        UUID group = activeGroup(ana, "Skupina");
        groups.addMember(group, id(first), "EDITOR");
        assertThat(createContact(group, first, "Staro")).isEqualTo(201);

        HttpResponse<String> deleted = post("/api/me/deletion", first.idToken(), deletionBody(email));
        assertThat(deleted.statusCode()).isEqualTo(204);

        SignedIn second = emulator().signInWithGoogle(sub, email, "Pia Znova");
        assertThat(second.uid()).as("nova identiteta, drug UID").isNotEqualTo(first.uid());
        assertThat(put("/api/me", second.idToken(), null).statusCode()).isEqualTo(201);
        assertThat(JSON.readTree(get("/api/groups", second.idToken()).body()).toString())
                .doesNotContain("Skupina");
        assertThat(jdbc.queryForObject(
                        "select count(*) from group_member where user_id = ?", Integer.class, id(second)))
                .isZero();
        assertThat(auditActorNames(group, ana))
                .as("stari vnosi sledi ostanejo »izbrisan uporabnik«")
                .isNotEmpty()
                .containsOnlyNulls();
    }
}

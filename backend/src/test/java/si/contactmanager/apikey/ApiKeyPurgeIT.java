package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;
import si.contactmanager.support.ApiKeys;
import si.contactmanager.support.ApiKeys.Key;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Čiščenje po 90 dneh (019, FR-019-21, research R-07): preklican ali potekel ključ starejši od 90 dni se izbriše s
 * statistiko, mlajši ostane; urni števci starejši od 90 dni se izbrišejo; aktiven ključ ostane. Seznam stare skrije tudi
 * pred čiščenjem.
 */
@Tag("FR-019-21")
class ApiKeyPurgeIT extends ApiTest {

    private static final Scope ALL = Scope.allGroups(Permission.READ);

    @Autowired
    ApiKeyTokens tokens;

    @Autowired
    ApiKeyPurgeJob job;

    private ApiKeys keys;
    private SignedIn ana;
    private long anaId;

    @BeforeEach
    void ana() throws Exception {
        keys = new ApiKeys(tokens, jdbc);
        ana = registeredUser("Ana Čiščenje");
        anaId = keys.userId(ana.uid());
    }

    private void usage(UUID key, Instant hour) {
        jdbc.update(
                "insert into api_key_usage (key_id, hour, read_ok) values (?, ?, 1)",
                key,
                Timestamp.from(hour.truncatedTo(ChronoUnit.HOURS)));
    }

    private boolean exists(UUID key) {
        return jdbc.queryForObject("select count(*) from api_key where id = ?", Integer.class, key) > 0;
    }

    private int usageRows(UUID key) {
        return jdbc.queryForObject("select count(*) from api_key_usage where key_id = ?", Integer.class, key);
    }

    private Key revokedAgo(Duration ago) {
        Key key = keys.create(anaId, "Preklican", ALL);
        jdbc.update(
                "update api_key set revoked_at = ? where id = ?",
                Timestamp.from(Instant.now().minus(ago)),
                key.id());
        usage(key.id(), Instant.now().minus(ago).minus(Duration.ofHours(3)));
        return key;
    }

    @Test
    void revokedOrExpiredOlderThan90DaysIsDeletedWithItsStatistics() {
        Key revoked = revokedAgo(Duration.ofDays(91));
        Key expired = keys.expired(anaId, ALL);
        jdbc.update(
                "update api_key set expires_at = ? where id = ?",
                Timestamp.from(Instant.now().minus(Duration.ofDays(95))),
                expired.id());
        usage(expired.id(), Instant.now().minus(Duration.ofDays(96)));

        ApiKeyPurgeJob.Result result = job.purge(Instant.now());

        assertThat(exists(revoked.id())).isFalse();
        assertThat(exists(expired.id())).isFalse();
        assertThat(usageRows(revoked.id())).isZero();
        assertThat(usageRows(expired.id())).isZero();
        assertThat(result.keys()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void revokedOrExpiredWithin90DaysRemainsWithItsStatistics() {
        Key revoked = revokedAgo(Duration.ofDays(89));
        Key expired = keys.expired(anaId, ALL);
        usage(expired.id(), Instant.now().minus(Duration.ofDays(10)));

        job.purge(Instant.now());

        assertThat(exists(revoked.id())).isTrue();
        assertThat(exists(expired.id())).isTrue();
        assertThat(usageRows(revoked.id())).isEqualTo(1);
        assertThat(usageRows(expired.id())).isEqualTo(1);
    }

    @Test
    void anHourOlderThan90DaysIsDeletedButTheActiveKeyStays() {
        Key active = keys.create(anaId, "Aktiven", ALL);
        usage(active.id(), Instant.now().minus(Duration.ofDays(91)));
        usage(active.id(), Instant.now().minus(Duration.ofDays(89)));
        usage(active.id(), Instant.now());

        ApiKeyPurgeJob.Result result = job.purge(Instant.now());

        assertThat(exists(active.id())).isTrue();
        assertThat(usageRows(active.id())).isEqualTo(2);
        assertThat(result.hours()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void theListHidesOldKeysEvenBeforeThePurgeRuns() throws Exception {
        Key old = revokedAgo(Duration.ofDays(91));
        Key recent = revokedAgo(Duration.ofDays(5));

        String body = get("/api/me/api-keys", ana.idToken()).body();

        assertThat(body)
                .contains(recent.id().toString())
                .doesNotContain(old.id().toString());
    }

    @Test
    void purgeUsesTheGivenClock() {
        Key revoked = revokedAgo(Duration.ofDays(5));

        job.purge(Instant.now().plus(Duration.ofDays(100)));

        assertThat(exists(revoked.id())).isFalse();
    }
}

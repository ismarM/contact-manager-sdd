package si.contactmanager.apikey;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Čiščenje po 90 dneh (019, FR-019-21, research R-07): izbriše ključe, preklicane ali potekle pred več kot 90 dnevi
 * (kaskadno s statistiko), in urne števce starejše od 90 dni. Aktivni ključi ostanejo. Seznam ključev stare skrije
 * tudi, če čiščenje še ni teklo.
 */
@Component
class ApiKeyPurgeJob {

    /** Hramba preklicanih, potekle ključev in statistike (FR-019-21). */
    static final Duration RETENTION = Duration.ofDays(90);

    private static final Logger LOG = LoggerFactory.getLogger(ApiKeyPurgeJob.class);

    /** Število izbrisanih ključev in ur statistike. */
    record Result(int keys, int hours) {}

    private final JdbcClient jdbc;
    private final Clock clock;

    ApiKeyPurgeJob(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${api-keys.purge-interval}", initialDelayString = "${api-keys.purge-interval}")
    void run() {
        try {
            Result result = purge(clock.instant());
            if (result.keys() > 0 || result.hours() > 0) {
                LOG.info("API key purge: keys={}, usage hours={}", result.keys(), result.hours());
            }
        } catch (RuntimeException e) {
            LOG.warn("API key purge failed ({})", e.getClass().getSimpleName());
        }
    }

    Result purge(Instant now) {
        Timestamp limit = Timestamp.from(now.minus(RETENTION));
        int hours = jdbc.sql("DELETE FROM api_key_usage WHERE hour < :limit")
                .param("limit", limit)
                .update();
        int keys = jdbc.sql("DELETE FROM api_key WHERE least(revoked_at, expires_at) < :limit")
                .param("limit", limit)
                .update();
        return new Result(keys, hours);
    }
}

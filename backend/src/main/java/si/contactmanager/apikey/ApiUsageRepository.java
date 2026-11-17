package si.contactmanager.apikey;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;

/** Tabela {@code api_key_usage} (019 data-model.md): števci po uri in izidu, vezani na ključ. */
@Repository
class ApiUsageRepository {

    /** Števci ene ure (začetek ure, UTC). */
    record HourRow(Instant hour, int readOk, int writeOk, int errors, int rateLimited) {}

    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;

    ApiUsageRepository(JdbcClient jdbc, DataSource dataSource) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    /**
     * Prišteje zahtevo uri {@code now} in posodobi {@code last_used_at}: en upsert in ena posodobitev v kratki
     * transakciji, ločeni od zahteve. Izbrisan ključ (vrstica ne obstaja) se tiho preskoči.
     */
    void record(UUID key, UsageOutcome outcome, Instant now) {
        Timestamp hour = Timestamp.from(now.truncatedTo(ChronoUnit.HOURS));
        int read = outcome == UsageOutcome.READ_OK ? 1 : 0;
        int write = outcome == UsageOutcome.WRITE_OK ? 1 : 0;
        int errors = outcome == UsageOutcome.ERROR ? 1 : 0;
        int limited = outcome == UsageOutcome.RATE_LIMITED ? 1 : 0;
        transaction.executeWithoutResult(status -> {
            int touched = jdbc.sql("UPDATE api_key SET last_used_at = :now WHERE id = :key")
                    .param("now", Timestamp.from(now))
                    .param("key", key)
                    .update();
            if (touched == 0) {
                return;
            }
            jdbc.sql("INSERT INTO api_key_usage (key_id, hour, read_ok, write_ok, errors, rate_limited)"
                            + " VALUES (:key, :hour, :read, :write, :errors, :limited)"
                            + " ON CONFLICT (key_id, hour) DO UPDATE SET"
                            + " read_ok = api_key_usage.read_ok + EXCLUDED.read_ok,"
                            + " write_ok = api_key_usage.write_ok + EXCLUDED.write_ok,"
                            + " errors = api_key_usage.errors + EXCLUDED.errors,"
                            + " rate_limited = api_key_usage.rate_limited + EXCLUDED.rate_limited")
                    .param("key", key)
                    .param("hour", hour)
                    .param("read", read)
                    .param("write", write)
                    .param("errors", errors)
                    .param("limited", limited)
                    .update();
        });
    }

    /** Števci ur od {@code from} naprej (vključno), po času. */
    List<HourRow> hours(UUID key, Instant from) {
        return jdbc.sql("SELECT hour, read_ok, write_ok, errors, rate_limited FROM api_key_usage"
                        + " WHERE key_id = :key AND hour >= :from ORDER BY hour")
                .param("key", key)
                .param("from", Timestamp.from(from))
                .query((rs, n) -> new HourRow(
                        rs.getTimestamp("hour").toInstant(),
                        rs.getInt("read_ok"),
                        rs.getInt("write_ok"),
                        rs.getInt("errors"),
                        rs.getInt("rate_limited")))
                .list();
    }
}

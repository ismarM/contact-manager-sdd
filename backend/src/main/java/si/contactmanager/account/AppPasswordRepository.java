package si.contactmanager.account;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Tabeli {@code app_password} in {@code dav_login_state} (014 data-model.md); vsaka poizvedba ima {@code user_id}. */
@Repository
class AppPasswordRepository {

    /** Geslo za seznam in izvoz: nikoli zgoščena vrednost. */
    record Listed(UUID id, String name, Instant createdAt, Instant lastUsedAt) {}

    record Stored(UUID id, byte[] hash, Instant lastUsedAt) {}

    /** Račun za prijavo CardDAV: id, e-naslov in shranjeni jezik. */
    record Account(long id, String email, String language) {}

    private final JdbcClient jdbc;

    AppPasswordRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    List<Listed> list(long user) {
        return jdbc.sql("SELECT id, name, created_at, last_used_at FROM app_password WHERE user_id = :user"
                        + " ORDER BY created_at, id")
                .param("user", user)
                .query((rs, row) -> new Listed(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        rs.getTimestamp("created_at").toInstant(),
                        instant(rs.getTimestamp("last_used_at"))))
                .list();
    }

    /** Zaklene vrstico uporabnika (meja 10 brez dirke) in vrne število gesel. */
    int lockAndCount(long user) {
        jdbc.sql("SELECT id FROM app_user WHERE id = :user FOR UPDATE")
                .param("user", user)
                .query(Long.class)
                .optional();
        return jdbc.sql("SELECT count(*) FROM app_password WHERE user_id = :user")
                .param("user", user)
                .query(Integer.class)
                .single();
    }

    Listed insert(long user, String name, byte[] hash) {
        return jdbc.sql("INSERT INTO app_password (user_id, name, secret_hash) VALUES (:user, :name, :hash)"
                        + " RETURNING id, name, created_at, last_used_at")
                .param("user", user)
                .param("name", name)
                .param("hash", hash)
                .query((rs, row) -> new Listed(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        rs.getTimestamp("created_at").toInstant(),
                        null))
                .single();
    }

    boolean delete(long user, UUID id) {
        return jdbc.sql("DELETE FROM app_password WHERE user_id = :user AND id = :id")
                        .param("user", user)
                        .param("id", id)
                        .update()
                > 0;
    }

    String email(long user) {
        return jdbc.sql("SELECT email FROM app_user WHERE id = :user")
                .param("user", user)
                .query(String.class)
                .single();
    }

    Optional<Account> accountByEmail(String email) {
        return jdbc.sql("SELECT id, email, language FROM app_user WHERE lower(email) = lower(:email)")
                .param("email", email)
                .query((rs, row) -> new Account(rs.getLong("id"), rs.getString("email"), rs.getString("language")))
                .optional();
    }

    List<Stored> stored(long user) {
        return jdbc.sql("SELECT id, secret_hash, last_used_at FROM app_password WHERE user_id = :user")
                .param("user", user)
                .query((rs, row) -> new Stored(
                        rs.getObject("id", UUID.class),
                        rs.getBytes("secret_hash"),
                        instant(rs.getTimestamp("last_used_at"))))
                .list();
    }

    /** Zadnja uporaba največ enkrat na minuto (research R-09). */
    void touch(UUID id) {
        jdbc.sql("UPDATE app_password SET last_used_at = now() WHERE id = :id"
                        + " AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')")
                .param("id", id)
                .update();
    }

    boolean locked(long user) {
        return jdbc.sql("SELECT count(*) FROM dav_login_state WHERE user_id = :user AND locked_until > now()")
                        .param("user", user)
                        .query(Integer.class)
                        .single()
                > 0;
    }

    /**
     * Neuspela prijava (FR-014-26): v 15-minutnem oknu se šteje, deseta zaklene prijavo za 15 minut in začne novo
     * štetje.
     */
    void recordFailure(long user, int limit) {
        int count = jdbc.sql("INSERT INTO dav_login_state AS s (user_id, failed_count, window_started_at)"
                        + " VALUES (:user, 1, now()) ON CONFLICT (user_id) DO UPDATE SET"
                        + " failed_count = CASE WHEN s.window_started_at IS NULL"
                        + " OR s.window_started_at < now() - interval '15 minutes' THEN 1 ELSE s.failed_count + 1 END,"
                        + " window_started_at = CASE WHEN s.window_started_at IS NULL"
                        + " OR s.window_started_at < now() - interval '15 minutes' THEN now()"
                        + " ELSE s.window_started_at END"
                        + " RETURNING failed_count")
                .param("user", user)
                .query(Integer.class)
                .single();
        if (count >= limit) {
            jdbc.sql("UPDATE dav_login_state SET locked_until = now() + interval '15 minutes', failed_count = 0,"
                            + " window_started_at = NULL WHERE user_id = :user")
                    .param("user", user)
                    .update();
        }
    }

    void recordSuccess(long user) {
        jdbc.sql("DELETE FROM dav_login_state WHERE user_id = :user")
                .param("user", user)
                .update();
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}

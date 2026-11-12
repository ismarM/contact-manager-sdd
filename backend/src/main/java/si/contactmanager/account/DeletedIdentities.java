package si.contactmanager.account;

import java.time.Duration;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import si.contactmanager.shared.security.RevokedIdentities;

/**
 * Nadgrobniki izbrisanih identitet ({@code deleted_identity}, data-model.md; D-72). Vsaka metoda je en stavek (v klicu
 * znotraj transakcije izbrisa sodeluje z njo, sicer je kratka lastna transakcija); stanje je v bazi, ne v pomnilniku,
 * zato preživi ponovni zagon. Vsi časi so iz {@code now()} baze.
 */
@Component
class DeletedIdentities implements RevokedIdentities {

    /** Prevzeta vrstica: UID in število poskusov do zdaj. */
    record Leased(String uid, int attempts) {}

    private final JdbcClient jdbc;

    DeletedIdentities(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Vstavi nadgrobnik z zakupom (opravilo ga ne vzame, dokler zahtevek poskuša brisanje); podvojen zapis ni napaka. */
    void insert(String uid, Duration lease) {
        jdbc.sql("INSERT INTO deleted_identity (firebase_uid, next_attempt_at)"
                        + " VALUES (:uid, now() + make_interval(secs => :secs)) ON CONFLICT (firebase_uid) DO NOTHING")
                .param("uid", uid)
                .param("secs", seconds(lease))
                .update();
    }

    @Override
    public boolean contains(String uid) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM deleted_identity WHERE firebase_uid = :uid)")
                .param("uid", uid)
                .query(Boolean.class)
                .single();
    }

    /** Prevzame do {@code limit} zapadlih odprtih vrstic in jim podaljša zakup – en stavek, brez zadrževanja transakcije. */
    List<Leased> lease(int limit, Duration lease) {
        return jdbc.sql("UPDATE deleted_identity SET next_attempt_at = now() + make_interval(secs => :secs)"
                        + " WHERE firebase_uid IN (SELECT firebase_uid FROM deleted_identity"
                        + " WHERE provider_deleted_at IS NULL AND next_attempt_at <= now()"
                        + " ORDER BY next_attempt_at LIMIT :limit FOR UPDATE SKIP LOCKED)"
                        + " RETURNING firebase_uid, attempts")
                .param("secs", seconds(lease))
                .param("limit", limit)
                .query((rs, row) -> new Leased(rs.getString("firebase_uid"), rs.getInt("attempts")))
                .list();
    }

    void markDeleted(String uid) {
        jdbc.sql("UPDATE deleted_identity SET provider_deleted_at = now(), last_error = NULL WHERE firebase_uid = :uid")
                .param("uid", uid)
                .update();
    }

    /** Neuspeh: {@code attempts + 1}, kratka koda napake (brez osebnih podatkov), naslednji poskus čez {@code retryIn}. */
    void markFailed(String uid, String error, Duration retryIn) {
        jdbc.sql("UPDATE deleted_identity SET attempts = attempts + 1, last_error = :error,"
                        + " next_attempt_at = now() + make_interval(secs => :secs) WHERE firebase_uid = :uid")
                .param("uid", uid)
                .param("error", error == null ? null : error.substring(0, Math.min(error.length(), 40)))
                .param("secs", seconds(retryIn))
                .update();
    }

    /** Izbriše zaprte nadgrobnike, starejše od {@code retention}; odprte nikoli. */
    int purge(Duration retention) {
        return jdbc.sql("DELETE FROM deleted_identity WHERE provider_deleted_at IS NOT NULL"
                        + " AND provider_deleted_at < now() - make_interval(secs => :secs)")
                .param("secs", seconds(retention))
                .update();
    }

    private static double seconds(Duration duration) {
        return duration.toMillis() / 1000.0;
    }
}

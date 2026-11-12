package si.contactmanager.account.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Priprava in branje stanja za teste funkcionalnosti 012 neposredno v testni bazi (nadgrobniki, iskanje besedila). */
public final class AccountFixtures {

    /** Tabele s podatki skupine (kontakti in njihove spremembe): iskanje osebnih podatkov jih izpusti (SC-004). */
    private static final List<String> CONTACT_TABLES =
            List.of("contact", "contact_attribute", "contact_tag", "audit_change", "flyway_schema_history");

    private final JdbcTemplate jdbc;

    public AccountFixtures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Vrstica nadgrobnika za UID ali prazen seznam. */
    public List<Map<String, Object>> tombstone(String uid) {
        return jdbc.queryForList("select * from deleted_identity where firebase_uid = ?", uid);
    }

    public int tombstoneCount(String uid) {
        return tombstone(uid).size();
    }

    /**
     * Ročno vstavljen nadgrobnik; {@code providerDeletedAt} = {@code null} pomeni odprt, {@code nextAttemptAt} je čas
     * naslednjega poskusa (zakup).
     */
    public void insertTombstone(
            String uid, OffsetDateTime providerDeletedAt, int attempts, OffsetDateTime nextAttemptAt) {
        jdbc.update(
                "insert into deleted_identity (firebase_uid, provider_deleted_at, attempts, next_attempt_at)"
                        + " values (?, ?, ?, ?)",
                uid,
                providerDeletedAt,
                attempts,
                nextAttemptAt);
    }

    /** Naredi nadgrobnik takoj zapadel (opravilo ga bo vzelo). */
    public void makeDue(String uid) {
        jdbc.update(
                "update deleted_identity set next_attempt_at = now() - interval '1 second' where firebase_uid = ?",
                uid);
    }

    public boolean appUserExists(String uid) {
        Integer count = jdbc.queryForObject("select count(*) from app_user where firebase_uid = ?", Integer.class, uid);
        return count != null && count > 0;
    }

    /**
     * Vsa mesta ({@code tabela.stolpec}) v bazi, kjer se v besedilnem stolpcu pojavi {@code needle} (brez velikosti
     * črk), **razen** tabel s podatki kontaktov (SC-004).
     */
    public List<String> findText(String needle) {
        List<Map<String, Object>> columns = jdbc.queryForList(
                "select table_name, column_name from information_schema.columns where table_schema = 'public'"
                        + " and data_type in ('text', 'character varying', 'character', 'jsonb', 'json')");
        List<String> hits = new ArrayList<>();
        for (Map<String, Object> column : columns) {
            String table = (String) column.get("table_name");
            String name = (String) column.get("column_name");
            if (CONTACT_TABLES.contains(table)) {
                continue;
            }
            Integer count = jdbc.queryForObject(
                    "select count(*) from \"" + table + "\" where \"" + name + "\"::text ilike ?",
                    Integer.class,
                    "%" + needle + "%");
            if (count != null && count > 0) {
                hits.add(table + "." + name);
            }
        }
        return hits;
    }

    /** V nobeni od danih skupin ni nearhivirane skupine brez lastnika (FR-012-13, SC-006). */
    public void assertNoActiveGroupWithoutOwner(UUID... groups) {
        for (UUID group : groups) {
            Integer orphan = jdbc.queryForObject(
                    "select count(*) from contact_group g where g.id = ? and g.archived_at is null"
                            + " and not exists (select 1 from group_member m where m.group_id = g.id and m.role = 'OWNER')",
                    Integer.class,
                    group);
            assertThat(orphan)
                    .as("nearhivirana skupina %s brez lastnika", group)
                    .isZero();
        }
    }

    public int groupCount(UUID... groups) {
        int total = 0;
        for (UUID group : groups) {
            Integer count =
                    jdbc.queryForObject("select count(*) from contact_group where id = ?", Integer.class, group);
            total += count == null ? 0 : count;
        }
        return total;
    }

    /** Število povezav v stanju »idle in transaction« (zunanji klic ne sme biti znotraj transakcije, R-07). */
    public int idleInTransaction() {
        Integer count = jdbc.queryForObject(
                "select count(*) from pg_stat_activity where datname = current_database()"
                        + " and state like 'idle in transaction%' and pid <> pg_backend_pid()",
                Integer.class);
        return count == null ? 0 : count;
    }
}

package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import si.contactmanager.support.ApiTest;

/**
 * Migracija 019 (FR-019-01, -12, -20, -21; data-model.md): omejitve tabel API ključev, kaskade ob izbrisu uporabnika
 * in skupine ter nespremenljivost sledi z novim stolpcem {@code api_key_name}.
 */
@Tag("FR-019-01")
@Tag("FR-019-12")
@Tag("FR-019-20")
@Tag("FR-019-21")
class ApiKeyMigrationIT extends ApiTest {

    private long user() {
        String uid = "uid-" + UUID.randomUUID();
        Long id = jdbc.queryForObject(
                "insert into app_user (firebase_uid, email) values (?, ?) returning id",
                Long.class,
                uid,
                uniqueEmail());
        return id == null ? -1 : id;
    }

    private UUID group(long owner) {
        UUID id = jdbc.queryForObject("insert into contact_group (title) values ('Klub') returning id", UUID.class);
        jdbc.update("insert into group_member (group_id, user_id, role) values (?, ?, 'OWNER')", id, owner);
        return id;
    }

    private UUID key(long user, String name, String hint, boolean allGroups, String permission) {
        return jdbc.queryForObject(
                "insert into api_key (user_id, name, hint, all_groups, all_groups_permission) values (?, ?, ?, ?, ?)"
                        + " returning id",
                UUID.class,
                user,
                name,
                hint,
                allGroups,
                permission);
    }

    private UUID key(long user) {
        return key(user, "Nočni izvoz", "abcdef", false, null);
    }

    private int count(String sql, Object... args) {
        Integer count = jdbc.queryForObject(sql, Integer.class, args);
        return count == null ? 0 : count;
    }

    @Test
    void nameMustHave1To50CharactersAndHintExactly6() {
        long user = user();

        assertThat(key(user, "x".repeat(50), "abcdef", false, null)).isNotNull();
        assertThatThrownBy(() -> key(user, "", "abcdef", false, null)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> key(user, "x".repeat(51), "abcdef", false, null))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> key(user, "Ime", "abcde", false, null)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> key(user, "Ime", "abcdefg", false, null)).isInstanceOf(DataAccessException.class);
    }

    @Test
    void allGroupsPermissionIsSetExactlyWhenAllGroups() {
        long user = user();

        assertThat(key(user, "Vse", "abcdef", true, "WRITE")).isNotNull();
        assertThat(key(user, "Izbrane", "abcdef", false, null)).isNotNull();
        assertThatThrownBy(() -> key(user, "Vse", "abcdef", true, null)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> key(user, "Izbrane", "abcdef", false, "READ")).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> key(user, "Vse", "abcdef", true, "ADMIN")).isInstanceOf(DataAccessException.class);
    }

    @Test
    void groupPermissionAndUsageCountersAreChecked() {
        long user = user();
        UUID group = group(user);
        UUID key = key(user);

        assertThatThrownBy(() -> jdbc.update(
                        "insert into api_key_group (key_id, group_id, permission) values (?, ?, 'ADMIN')", key, group))
                .isInstanceOf(DataAccessException.class);
        for (String counter : new String[] {"read_ok", "write_ok", "errors", "rate_limited"}) {
            assertThatThrownBy(() -> jdbc.update(
                            "insert into api_key_usage (key_id, hour, " + counter + ") values (?, now(), -1)", key))
                    .as(counter)
                    .isInstanceOf(DataAccessException.class);
        }
        jdbc.update("insert into api_key_usage (key_id, hour) values (?, date_trunc('hour', now()))", key);
        Map<String, Object> usage = jdbc.queryForMap(
                "select read_ok, write_ok, errors, rate_limited from api_key_usage where key_id = ?", key);
        assertThat(usage)
                .containsOnly(
                        Map.entry("read_ok", 0),
                        Map.entry("write_ok", 0),
                        Map.entry("errors", 0),
                        Map.entry("rate_limited", 0));
    }

    @Test
    void deletingUserDeletesKeysGroupsAndUsage() {
        long user = user();
        UUID group = group(user());
        UUID key = key(user);
        jdbc.update("insert into api_key_group (key_id, group_id, permission) values (?, ?, 'READ')", key, group);
        jdbc.update("insert into api_key_usage (key_id, hour, read_ok) values (?, date_trunc('hour', now()), 3)", key);

        jdbc.update("delete from app_user where id = ?", user);

        assertThat(count("select count(*) from api_key where id = ?", key)).isZero();
        assertThat(count("select count(*) from api_key_group where key_id = ?", key))
                .isZero();
        assertThat(count("select count(*) from api_key_usage where key_id = ?", key))
                .isZero();
        assertThat(count("select count(*) from contact_group where id = ?", group))
                .isOne();
    }

    @Test
    void deletingGroupRemovesItFromKeyScopeOnly() {
        long user = user();
        UUID group = group(user);
        UUID key = key(user);
        jdbc.update("insert into api_key_group (key_id, group_id, permission) values (?, ?, 'WRITE')", key, group);

        jdbc.update("delete from contact_group where id = ?", group);

        assertThat(count("select count(*) from api_key_group where key_id = ?", key))
                .isZero();
        assertThat(count("select count(*) from api_key where id = ?", key)).isOne();
    }

    private UUID auditEntry(UUID group, long actor, String apiKeyName) {
        return jdbc.queryForObject(
                "insert into audit_entry (group_id, seq, actor_id, action, contact_count, contact_name, api_key_name)"
                        + " values (?, (select coalesce(max(seq), 0) + 1 from audit_entry where group_id = ?), ?,"
                        + " 'CREATE', 1, 'Ana', ?) returning id",
                UUID.class,
                group,
                group,
                actor,
                apiKeyName);
    }

    @Test
    void auditApiKeyNameIsLimitedTo50Characters() {
        long user = user();
        UUID group = group(user);

        assertThat(auditEntry(group, user, "x".repeat(50))).isNotNull();
        assertThat(auditEntry(group, user, null)).isNotNull();
        assertThatThrownBy(() -> auditEntry(group, user, "")).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> auditEntry(group, user, "x".repeat(51))).isInstanceOf(DataAccessException.class);
    }

    @Test
    void auditApiKeyNameCannotBeUpdatedAndOtherUpdatesStayRejected() {
        long user = user();
        UUID group = group(user);
        UUID entry = auditEntry(group, user, "Nočni izvoz");

        assertThatThrownBy(() -> jdbc.update("update audit_entry set api_key_name = 'Drug' where id = ?", entry))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("update audit_entry set api_key_name = null where id = ?", entry))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("update audit_entry set contact_name = 'Bojan' where id = ?", entry))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update(
                        "update audit_entry set actor_id = null, contact_name = 'Bojan' where id = ?", entry))
                .isInstanceOf(DataAccessException.class);
        assertThat(jdbc.queryForObject("select api_key_name from audit_entry where id = ?", String.class, entry))
                .isEqualTo("Nočni izvoz");
    }

    @Test
    void deletingActorClearsActorAndApiKeyName() {
        long actor = user();
        long owner = user();
        UUID group = group(owner);
        UUID viaApi = auditEntry(group, actor, "Nočni izvoz");
        UUID viaWeb = auditEntry(group, actor, null);

        jdbc.update("delete from app_user where id = ?", actor);

        for (UUID entry : new UUID[] {viaApi, viaWeb}) {
            Map<String, Object> row = jdbc.queryForMap(
                    "select actor_id, api_key_name, contact_name from audit_entry where id = ?", entry);
            assertThat(row.get("actor_id")).isNull();
            assertThat(row.get("api_key_name")).isNull();
            assertThat(row.get("contact_name")).isEqualTo("Ana");
        }
    }
}

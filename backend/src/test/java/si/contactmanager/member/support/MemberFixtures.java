package si.contactmanager.member.support;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Priprava in branje članstev neposredno v testni bazi (kot {@code GroupFixtures}, D-27). Tabela {@code group_member}
 * ima od V7 opaken {@code id} (memberId v API-ju) in sled zadnje spremembe vloge.
 */
public final class MemberFixtures {

    private final JdbcTemplate jdbc;

    public MemberFixtures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void addMember(UUID groupId, long userId, String role) {
        jdbc.update("insert into group_member (group_id, user_id, role) values (?, ?, ?)", groupId, userId, role);
    }

    /** Opaken identifikator člana (memberId) iz API-ja. */
    public UUID memberId(UUID groupId, long userId) {
        return jdbc.queryForObject(
                "select id from group_member where group_id = ? and user_id = ?", UUID.class, groupId, userId);
    }

    public Optional<String> role(UUID groupId, long userId) {
        return jdbc
                .queryForList(
                        "select role from group_member where group_id = ? and user_id = ?",
                        String.class,
                        groupId,
                        userId)
                .stream()
                .findFirst();
    }

    public long version(UUID groupId, long userId) {
        Long version = jdbc.queryForObject(
                "select version from group_member where group_id = ? and user_id = ?", Long.class, groupId, userId);
        return version == null ? -1 : version;
    }

    /** Izvajalec zadnje spremembe vloge ({@code null} = nikoli ali izbrisan uporabnik). */
    public Long updatedBy(UUID groupId, long userId) {
        return jdbc.queryForObject(
                "select updated_by from group_member where group_id = ? and user_id = ?", Long.class, groupId, userId);
    }

    public int count(UUID groupId) {
        Integer count =
                jdbc.queryForObject("select count(*) from group_member where group_id = ?", Integer.class, groupId);
        return count == null ? 0 : count;
    }

    public int ownerCount(UUID groupId) {
        Integer count = jdbc.queryForObject(
                "select count(*) from group_member where group_id = ? and role = 'OWNER'", Integer.class, groupId);
        return count == null ? 0 : count;
    }

    public void removeMember(UUID groupId, long userId) {
        jdbc.update("delete from group_member where group_id = ? and user_id = ?", groupId, userId);
    }

    /** Skupine, katerih član je uporabnik. */
    public List<UUID> groupsOf(long userId) {
        return jdbc.queryForList("select group_id from group_member where user_id = ?", UUID.class, userId);
    }

    public int auditEntryCount(UUID groupId) {
        Integer count =
                jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Integer.class, groupId);
        return count == null ? 0 : count;
    }

    /** Celotna vsebina revizijske sledi skupine (za primerjavo pred/po). */
    public List<Map<String, Object>> auditSnapshot(UUID groupId) {
        return jdbc.queryForList(
                "select id, seq, actor_id, action, contact_count, contact_name from audit_entry where group_id = ? order by seq",
                groupId);
    }

    /** Vrstica članstva (role, version, updated_by) – za preverjanje, da se ni spremenila. */
    public Map<String, Object> row(UUID groupId, long userId) {
        return jdbc.queryForMap(
                "select role, version, updated_by from group_member where group_id = ? and user_id = ?",
                groupId,
                userId);
    }
}

package si.contactmanager.member;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contactmanager.group.Role;
import si.contactmanager.group.UserRef;

/** Članstva v tabeli {@code group_member} (data-model.md); vse poizvedbe imajo {@code group_id}. */
@Repository
class MemberRepository {

    /** Članstvo za presojo pravil pod zaklepom. */
    record Row(UUID id, long userId, Role role, long version) {}

    private static final String ROLE_ORDER =
            "CASE gm.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'EDITOR' THEN 2 ELSE 3 END";

    private static final String SELECT = "SELECT gm.id, u.name, u.email, gm.role, gm.version,"
            + " gm.user_id = :caller AS self, gm.updated_at, ub.name AS by_name, ub.email AS by_email"
            + " FROM group_member gm JOIN app_user u ON u.id = gm.user_id"
            + " LEFT JOIN app_user ub ON ub.id = gm.updated_by WHERE gm.group_id = :group";

    private final JdbcClient jdbc;

    MemberRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Zaklene vrstico skupine do konca transakcije; vrne, ali je arhivirana (prazno: skupine ni). */
    Optional<Boolean> lockGroup(UUID groupId) {
        return jdbc.sql("SELECT archived_at IS NOT NULL FROM contact_group WHERE id = :id FOR UPDATE")
                .param("id", groupId)
                .query(Boolean.class)
                .optional();
    }

    Optional<Row> findById(UUID groupId, UUID memberId) {
        return jdbc.sql("SELECT id, user_id, role, version FROM group_member WHERE group_id = :group AND id = :id")
                .param("group", groupId)
                .param("id", memberId)
                .query(MemberRepository::row)
                .optional();
    }

    Optional<Row> findByUser(UUID groupId, long userId) {
        return jdbc.sql("SELECT id, user_id, role, version FROM group_member"
                        + " WHERE group_id = :group AND user_id = :user")
                .param("group", groupId)
                .param("user", userId)
                .query(MemberRepository::row)
                .optional();
    }

    long count(UUID groupId) {
        return jdbc.sql("SELECT count(*) FROM group_member WHERE group_id = :group")
                .param("group", groupId)
                .query(Long.class)
                .single();
    }

    boolean hasOwner(UUID groupId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM group_member WHERE group_id = :group AND role = 'OWNER')")
                .param("group", groupId)
                .query(Boolean.class)
                .single();
    }

    List<MemberView> page(UUID groupId, long caller, String collation, int size, int page) {
        return jdbc.sql(SELECT + " ORDER BY " + ROLE_ORDER + ", coalesce(nullif(u.name, ''), u.email) COLLATE "
                        + collation + ", gm.id LIMIT :size OFFSET :offset")
                .param("group", groupId)
                .param("caller", caller)
                .param("size", size)
                .param("offset", (long) page * size)
                .query(MemberRepository::view)
                .list();
    }

    Optional<MemberView> view(UUID groupId, UUID memberId, long caller) {
        return jdbc.sql(SELECT + " AND gm.id = :id")
                .param("group", groupId)
                .param("caller", caller)
                .param("id", memberId)
                .query(MemberRepository::view)
                .optional();
    }

    int updateRole(UUID groupId, UUID memberId, Role role, long expectedVersion, long actor) {
        return jdbc.sql("UPDATE group_member SET role = :role, version = version + 1, updated_at = now(),"
                        + " updated_by = :actor WHERE group_id = :group AND id = :id AND version = :version")
                .param("role", role.name())
                .param("actor", actor)
                .param("group", groupId)
                .param("id", memberId)
                .param("version", expectedVersion)
                .update();
    }

    int delete(UUID groupId, UUID memberId) {
        return jdbc.sql("DELETE FROM group_member WHERE group_id = :group AND id = :id")
                .param("group", groupId)
                .param("id", memberId)
                .update();
    }

    int deleteByUser(UUID groupId, long userId) {
        return jdbc.sql("DELETE FROM group_member WHERE group_id = :group AND user_id = :user")
                .param("group", groupId)
                .param("user", userId)
                .update();
    }

    /** Prejšnji lastnik postane ADMIN (pred {@link #promote}, da indeks enega lastnika ni nikoli kršen). */
    void demoteOwner(UUID groupId, UUID memberId, long actor) {
        setRole(groupId, memberId, Role.ADMIN, actor);
    }

    void promote(UUID groupId, UUID memberId, long actor) {
        setRole(groupId, memberId, Role.OWNER, actor);
    }

    private void setRole(UUID groupId, UUID memberId, Role role, long actor) {
        jdbc.sql("UPDATE group_member SET role = :role, version = version + 1, updated_at = now(),"
                        + " updated_by = :actor WHERE group_id = :group AND id = :id")
                .param("role", role.name())
                .param("actor", actor)
                .param("group", groupId)
                .param("id", memberId)
                .update();
    }

    private static Row row(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new Row(
                rs.getObject("id", UUID.class),
                rs.getLong("user_id"),
                Role.valueOf(rs.getString("role")),
                rs.getLong("version"));
    }

    private static MemberView view(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        String byEmail = rs.getString("by_email");
        java.sql.Timestamp updatedAt = rs.getTimestamp("updated_at");
        return new MemberView(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getString("email"),
                Role.valueOf(rs.getString("role")),
                rs.getLong("version"),
                rs.getBoolean("self"),
                byEmail == null ? null : new UserRef(rs.getString("by_name"), byEmail),
                updatedAt == null ? null : updatedAt.toInstant());
    }

    /** Vrstica brez izračuna {@code canManage} (ga doda servis z {@link MemberRules}). */
    record MemberView(
            UUID id,
            String name,
            String email,
            Role role,
            long version,
            boolean self,
            UserRef updatedBy,
            Instant updatedAt) {

        Member toMember(Role caller, boolean archived) {
            return new Member(
                    id,
                    name,
                    email,
                    role,
                    version,
                    self,
                    MemberRules.canManage(caller, role, archived),
                    updatedBy,
                    updatedAt);
        }
    }
}

package si.contactmanager.invitation.support;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Priprava povabil neposredno v testni bazi (kot {@code GroupFixtures}, D-27). Povabil ne ustvarja noben endpoint
 * zunaj testiranega.
 */
public final class InvitationFixtures {

    private final JdbcTemplate jdbc;

    public InvitationFixtures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public UUID invite(UUID groupId, long inviteeId, long inviterId, String role) {
        return jdbc.queryForObject(
                "insert into invitation (group_id, invitee_id, inviter_id, role) values (?, ?, ?, ?) returning id",
                UUID.class,
                groupId,
                inviteeId,
                inviterId,
                role);
    }

    /** Povabilo z določenim časom nastanka (za razvrščanje). */
    public UUID invite(UUID groupId, long inviteeId, long inviterId, String role, OffsetDateTime createdAt) {
        return jdbc.queryForObject(
                "insert into invitation (group_id, invitee_id, inviter_id, role, created_at) values (?, ?, ?, ?, ?)"
                        + " returning id",
                UUID.class,
                groupId,
                inviteeId,
                inviterId,
                role,
                createdAt);
    }

    public boolean exists(UUID invitationId) {
        Integer count =
                jdbc.queryForObject("select count(*) from invitation where id = ?", Integer.class, invitationId);
        return count != null && count > 0;
    }

    public int count(UUID groupId) {
        Integer count =
                jdbc.queryForObject("select count(*) from invitation where group_id = ?", Integer.class, groupId);
        return count == null ? 0 : count;
    }

    public int countFor(long inviteeId) {
        Integer count =
                jdbc.queryForObject("select count(*) from invitation where invitee_id = ?", Integer.class, inviteeId);
        return count == null ? 0 : count;
    }

    /** Izbris računa (012): kaskada povabljenega, {@code SET NULL} povabitelja. */
    public void deleteUser(long userId) {
        jdbc.update("delete from app_user where id = ?", userId);
    }

    public Optional<String> memberRole(UUID groupId, long userId) {
        return jdbc
                .queryForList(
                        "select role from group_member where group_id = ? and user_id = ?",
                        String.class,
                        groupId,
                        userId)
                .stream()
                .findFirst();
    }

    public void removeMember(UUID groupId, long userId) {
        jdbc.update("delete from group_member where group_id = ? and user_id = ?", groupId, userId);
    }

    public void setRole(UUID groupId, long userId, String role) {
        jdbc.update("update group_member set role = ? where group_id = ? and user_id = ?", role, groupId, userId);
    }

    public int auditEntryCount(UUID groupId) {
        Integer count =
                jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Integer.class, groupId);
        return count == null ? 0 : count;
    }

    /** Vrstica povabila (role, inviter_id, created_at) – za preverjanje, da se ni spremenila. */
    public java.util.Map<String, Object> row(UUID invitationId) {
        return jdbc.queryForMap("select role, inviter_id, created_at from invitation where id = ?", invitationId);
    }
}

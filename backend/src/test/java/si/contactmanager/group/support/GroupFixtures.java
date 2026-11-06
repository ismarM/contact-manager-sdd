package si.contactmanager.group.support;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Priprava skupin in članstev neposredno v testni bazi (D-27, research R-13): druge vloge nastanejo šele s povabili
 * (006, 007), arhiviranje pa je 003. Produkcijskih endpointov samo za teste ni.
 */
public final class GroupFixtures {

    private final JdbcTemplate jdbc;

    public GroupFixtures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Notranji id profila ({@code app_user.id}) za Firebase UID; profil mora obstajati ({@code PUT /api/me}). */
    public long userId(String firebaseUid) {
        Long id = jdbc.queryForObject("select id from app_user where firebase_uid = ?", Long.class, firebaseUid);
        if (id == null) {
            throw new IllegalStateException("profil ne obstaja: " + firebaseUid);
        }
        return id;
    }

    /** E-naslov profila za Firebase UID. */
    public String email(String firebaseUid) {
        return jdbc.queryForObject("select email from app_user where firebase_uid = ?", String.class, firebaseUid);
    }

    /** Skupina z lastnikom {@code ownerUserId} (izvajalec zadnje spremembe je lastnik). */
    public UUID createGroup(long ownerUserId, String title, String description, String color) {
        UUID id = jdbc.queryForObject(
                "insert into contact_group (title, description, color, updated_by) values (?, ?, ?, ?) returning id",
                UUID.class,
                title,
                description,
                color,
                ownerUserId);
        addMember(id, ownerUserId, "OWNER");
        return id;
    }

    public UUID createGroup(long ownerUserId, String title) {
        return createGroup(ownerUserId, title, null, "tinta");
    }

    public void addMember(UUID groupId, long userId, String role) {
        jdbc.update("insert into group_member (group_id, user_id, role) values (?, ?, ?)", groupId, userId, role);
    }

    /** Arhivirana skupina (do 003 samo za teste). */
    public void archive(UUID groupId) {
        jdbc.update("update contact_group set archived_at = now() where id = ?", groupId);
    }

    public void setUpdatedBy(UUID groupId, long userId) {
        jdbc.update("update contact_group set updated_by = ? where id = ?", userId, groupId);
    }

    public long version(UUID groupId) {
        Long version = jdbc.queryForObject("select version from contact_group where id = ?", Long.class, groupId);
        return version == null ? -1 : version;
    }

    /** Vrstica skupine (title, description, color, version, updated_by, updated_at) – za preverjanje, da se ni spremenila. */
    public Map<String, Object> row(UUID groupId) {
        return jdbc.queryForMap(
                "select title, description, color, version, updated_by, updated_at from contact_group where id = ?",
                groupId);
    }

    public int groupCount() {
        Integer count = jdbc.queryForObject("select count(*) from contact_group", Integer.class);
        return count == null ? 0 : count;
    }

    public int memberCount(UUID groupId) {
        Integer count =
                jdbc.queryForObject("select count(*) from group_member where group_id = ?", Integer.class, groupId);
        return count == null ? 0 : count;
    }
}

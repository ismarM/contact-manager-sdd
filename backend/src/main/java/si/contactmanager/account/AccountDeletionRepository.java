package si.contactmanager.account;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Poizvedbe za izbris računa (012, research R-04, R-05). Zaklep vseh skupin uporabnika v naraščajočem vrstnem redu
 * {@code id}; vrstice {@code app_user} se ne zaklepa vnaprej (vrstni red skupina → uporabnik, D-58).
 */
@Repository
class AccountDeletionRepository {

    /** Uporabnik: notranji id (ne zapusti zaledja), Firebase UID in e-naslov. */
    record UserRow(long id, String uid, String email) {}

    private final JdbcClient jdbc;

    AccountDeletionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Id in e-naslov po Firebase UID (brez zaklepa). */
    Optional<UserRow> findByUid(String firebaseUid) {
        return jdbc.sql("SELECT id, firebase_uid, email FROM app_user WHERE firebase_uid = :uid")
                .param("uid", firebaseUid)
                .query((rs, row) -> new UserRow(rs.getLong("id"), rs.getString("firebase_uid"), rs.getString("email")))
                .optional();
    }

    Optional<UserRow> findById(long user) {
        return jdbc.sql("SELECT id, firebase_uid, email FROM app_user WHERE id = :user")
                .param("user", user)
                .query((rs, row) -> new UserRow(rs.getLong("id"), rs.getString("firebase_uid"), rs.getString("email")))
                .optional();
    }

    /** Zaklene vse skupine uporabnika v naraščajočem vrstnem redu {@code id} do konca transakcije. */
    List<UUID> lockGroups(long user) {
        return jdbc.sql("SELECT g.id FROM contact_group g JOIN group_member m ON m.group_id = g.id"
                        + " WHERE m.user_id = :user ORDER BY g.id FOR UPDATE OF g")
                .param("user", user)
                .query(UUID.class)
                .list();
    }

    List<UUID> memberGroupIds(long user) {
        return jdbc.sql("SELECT group_id FROM group_member WHERE user_id = :user ORDER BY group_id")
                .param("user", user)
                .query(UUID.class)
                .list();
    }

    /** Nearhivirane skupine, katerih lastnik je uporabnik (FR-012-06); isti seznam za {@code 409} in blokade. */
    List<BlockingGroup> blockingGroups(long user) {
        return jdbc.sql("SELECT g.id, g.title FROM contact_group g JOIN group_member m ON m.group_id = g.id"
                        + " WHERE m.user_id = :user AND m.role = 'OWNER' AND g.archived_at IS NULL"
                        + " ORDER BY g.title COLLATE title_sl, g.id")
                .param("user", user)
                .query((rs, row) -> new BlockingGroup(rs.getObject("id", UUID.class), rs.getString("title")))
                .list();
    }

    /** Arhivirane skupine, v katerih je uporabnik edini član (FR-012-09, FR-012-10). */
    List<UUID> groupsToDelete(long user) {
        return jdbc.sql("SELECT g.id FROM contact_group g JOIN group_member m ON m.group_id = g.id"
                        + " WHERE m.user_id = :user AND g.archived_at IS NOT NULL"
                        + " AND (SELECT count(*) FROM group_member c WHERE c.group_id = g.id) = 1")
                .param("user", user)
                .query(UUID.class)
                .list();
    }

    void deleteGroups(List<UUID> ids) {
        if (ids.isEmpty()) {
            return;
        }
        jdbc.sql("DELETE FROM contact_group WHERE id IN (:ids)")
                .param("ids", ids)
                .update();
    }

    /** Število izbrisanih vrstic; 0 = sočasni zahtevek je uporabnika že izbrisal. */
    int deleteUser(long user) {
        return jdbc.sql("DELETE FROM app_user WHERE id = :user")
                .param("user", user)
                .update();
    }
}

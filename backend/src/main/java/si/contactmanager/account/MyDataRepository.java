package si.contactmanager.account;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contactmanager.account.ExportAssembler.MembershipRow;
import si.contactmanager.account.ExportAssembler.OwnedRow;
import si.contactmanager.account.ExportAssembler.ProfileRow;
import si.contactmanager.account.ExportAssembler.ReceivedRow;
import si.contactmanager.account.ExportAssembler.SentRow;

/**
 * Poizvedbe za izvoz mojih podatkov (012, data-model.md *Izvoz*). Kličejo se v eni transakciji {@code REPEATABLE READ}
 * (posnetek); brez kontaktov, sledi, notranjih id-jev in e-naslova pošiljatelja (FR-012-03).
 */
@Repository
class MyDataRepository {

    /** Profil z notranjim id-jem (id ne zapusti zaledja). */
    record ProfileWithId(long id, ProfileRow profile) {}

    private final JdbcClient jdbc;

    MyDataRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<ProfileWithId> profile(String firebaseUid) {
        return jdbc.sql("SELECT id, name, email, created_at, language, theme FROM app_user WHERE firebase_uid = :uid")
                .param("uid", firebaseUid)
                .query((rs, row) -> new ProfileWithId(
                        rs.getLong("id"),
                        new ProfileRow(
                                rs.getString("name"),
                                rs.getString("email"),
                                instant(rs, "created_at"),
                                rs.getString("language"),
                                rs.getString("theme"))))
                .optional();
    }

    List<MembershipRow> memberships(long user) {
        return jdbc.sql("SELECT g.title, m.role, m.created_at, g.archived_at IS NOT NULL AS archived,"
                        + " EXISTS (SELECT 1 FROM group_member o WHERE o.group_id = g.id AND o.role = 'OWNER') AS has_owner"
                        + " FROM group_member m JOIN contact_group g ON g.id = m.group_id WHERE m.user_id = :user")
                .param("user", user)
                .query((rs, row) -> new MembershipRow(
                        rs.getString("title"),
                        rs.getString("role"),
                        instant(rs, "created_at"),
                        rs.getBoolean("archived"),
                        rs.getBoolean("has_owner")))
                .list();
    }

    List<ReceivedRow> receivedInvitations(long user) {
        return jdbc.sql(
                        "SELECT g.title, i.role, i.created_at, s.name AS sender_name, i.inviter_id IS NULL AS sender_deleted"
                                + " FROM invitation i JOIN contact_group g ON g.id = i.group_id"
                                + " LEFT JOIN app_user s ON s.id = i.inviter_id WHERE i.invitee_id = :user")
                .param("user", user)
                .query((rs, row) -> new ReceivedRow(
                        rs.getString("title"),
                        rs.getString("role"),
                        rs.getString("sender_name"),
                        rs.getBoolean("sender_deleted"),
                        instant(rs, "created_at")))
                .list();
    }

    /** Poslana čakajoča povabila: po {@code inviter_id}, neodvisno od trenutne vloge ali članstva (FR-012-02 (d)). */
    List<SentRow> sentInvitations(long user) {
        return jdbc.sql("SELECT g.title, i.role, i.created_at, u.email AS invitee_email"
                        + " FROM invitation i JOIN contact_group g ON g.id = i.group_id"
                        + " JOIN app_user u ON u.id = i.invitee_id WHERE i.inviter_id = :user")
                .param("user", user)
                .query((rs, row) -> new SentRow(
                        rs.getString("title"),
                        rs.getString("role"),
                        rs.getString("invitee_email"),
                        instant(rs, "created_at")))
                .list();
    }

    List<OwnedRow> ownedGroups(long user) {
        return jdbc.sql("SELECT g.title, g.description, g.color, g.archived_at IS NOT NULL AS archived, g.created_at"
                        + " FROM contact_group g JOIN group_member m ON m.group_id = g.id"
                        + " WHERE m.user_id = :user AND m.role = 'OWNER'")
                .param("user", user)
                .query((rs, row) -> new OwnedRow(
                        rs.getString("title"),
                        rs.getString("description"),
                        rs.getString("color"),
                        rs.getBoolean("archived"),
                        instant(rs, "created_at")))
                .list();
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class).toInstant();
    }
}

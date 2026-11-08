package si.contactmanager.invitation;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contactmanager.group.UserRef;

/** Čakajoča povabila v tabeli {@code invitation} (data-model.md); vse poizvedbe uporabnika imajo {@code invitee_id}. */
@Repository
class InvitationRepository {

    /** Vstavljeno povabilo: id in čas nastanka. */
    record Inserted(UUID id, Instant createdAt) {}

    /** Prevzeto povabilo: skupina in ponujena vloga. */
    record Claimed(UUID groupId, String role) {}

    private final JdbcClient jdbc;

    InvitationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Zaklene vrstico skupine do konca transakcije; vrne, ali je arhivirana (prazno: skupine ni). */
    Optional<Boolean> lockGroup(UUID groupId) {
        return jdbc.sql("SELECT archived_at IS NOT NULL FROM contact_group WHERE id = :id FOR UPDATE")
                .param("id", groupId)
                .query(Boolean.class)
                .optional();
    }

    String callerEmail(long userId) {
        return jdbc.sql("SELECT email FROM app_user WHERE id = :id")
                .param("id", userId)
                .query(String.class)
                .single();
    }

    Optional<Long> findUserByEmail(String email) {
        return jdbc.sql("SELECT id FROM app_user WHERE lower(email) = lower(:email)")
                .param("email", email)
                .query(Long.class)
                .optional();
    }

    boolean isMember(UUID groupId, long userId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM group_member WHERE group_id = :group AND user_id = :user)")
                .param("group", groupId)
                .param("user", userId)
                .query(Boolean.class)
                .single();
    }

    boolean hasPending(UUID groupId, long inviteeId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM invitation WHERE group_id = :group AND invitee_id = :user)")
                .param("group", groupId)
                .param("user", inviteeId)
                .query(Boolean.class)
                .single();
    }

    Inserted insert(UUID groupId, long inviteeId, long inviterId, String role) {
        return jdbc.sql("INSERT INTO invitation (group_id, invitee_id, inviter_id, role)"
                        + " VALUES (:group, :invitee, :inviter, :role) RETURNING id, created_at")
                .param("group", groupId)
                .param("invitee", inviteeId)
                .param("inviter", inviterId)
                .param("role", role)
                .query((rs, row) -> new Inserted(
                        rs.getObject("id", UUID.class),
                        rs.getTimestamp("created_at").toInstant()))
                .single();
    }

    /** Profil kot odgovor API ({@code null} ime je dovoljeno). */
    UserRef userRef(long userId) {
        return jdbc.sql("SELECT name, email FROM app_user WHERE id = :id")
                .param("id", userId)
                .query((rs, row) -> new UserRef(rs.getString("name"), rs.getString("email")))
                .single();
    }

    // --- povabila skupine ------------------------------------------------------------------------------------------

    List<OutgoingRow> pageOutgoing(UUID groupId, int page, int size) {
        return jdbc.sql("SELECT i.id, i.role, i.created_at, u.email AS invitee_email,"
                        + " p.name AS inviter_name, p.email AS inviter_email"
                        + " FROM invitation i JOIN app_user u ON u.id = i.invitee_id"
                        + " LEFT JOIN app_user p ON p.id = i.inviter_id"
                        + " WHERE i.group_id = :group ORDER BY i.created_at DESC, i.id DESC"
                        + " LIMIT :size OFFSET :offset")
                .param("group", groupId)
                .param("size", size)
                .param("offset", (long) page * size)
                .query((rs, row) -> new OutgoingRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("invitee_email"),
                        rs.getString("role"),
                        userOrNull(rs.getString("inviter_name"), rs.getString("inviter_email")),
                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    /** Vrstica seznama poslanih povabil pred izračunom {@code canWithdraw}. */
    record OutgoingRow(UUID id, String inviteeEmail, String role, UserRef invitedBy, Instant createdAt) {}

    int countOutgoing(UUID groupId) {
        return jdbc.sql("SELECT count(*) FROM invitation WHERE group_id = :group")
                .param("group", groupId)
                .query(Integer.class)
                .single();
    }

    /** Ponujena vloga povabila v tej skupini (prazno: povabila v tej skupini ni). */
    Optional<String> roleOf(UUID invitationId, UUID groupId) {
        return jdbc.sql("SELECT role FROM invitation WHERE id = :id AND group_id = :group")
                .param("id", invitationId)
                .param("group", groupId)
                .query(String.class)
                .optional();
    }

    boolean withdraw(UUID invitationId, UUID groupId) {
        return jdbc.sql("DELETE FROM invitation WHERE id = :id AND group_id = :group")
                        .param("id", invitationId)
                        .param("group", groupId)
                        .update()
                > 0;
    }

    // --- povabila uporabnika (vedno z invitee_id) --------------------------------------------------------------------

    List<ReceivedInvitation> pageReceived(long userId, int page, int size) {
        return jdbc.sql("SELECT i.id, i.role, i.created_at, g.id AS group_id, g.title, g.color,"
                        + " g.archived_at IS NOT NULL AS archived, p.name AS inviter_name, p.email AS inviter_email"
                        + " FROM invitation i JOIN contact_group g ON g.id = i.group_id"
                        + " LEFT JOIN app_user p ON p.id = i.inviter_id"
                        + " WHERE i.invitee_id = :user ORDER BY i.created_at DESC, i.id DESC"
                        + " LIMIT :size OFFSET :offset")
                .param("user", userId)
                .param("size", size)
                .param("offset", (long) page * size)
                .query((rs, row) -> new ReceivedInvitation(
                        rs.getObject("id", UUID.class),
                        new InvitationGroup(
                                rs.getObject("group_id", UUID.class),
                                rs.getString("title"),
                                rs.getString("color"),
                                rs.getBoolean("archived")),
                        rs.getString("role"),
                        userOrNull(rs.getString("inviter_name"), rs.getString("inviter_email")),
                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    int countReceived(long userId) {
        return jdbc.sql("SELECT count(*) FROM invitation WHERE invitee_id = :user")
                .param("user", userId)
                .query(Integer.class)
                .single();
    }

    Optional<UUID> findGroupOf(UUID invitationId, long inviteeId) {
        return jdbc.sql("SELECT group_id FROM invitation WHERE id = :id AND invitee_id = :user")
                .param("id", invitationId)
                .param("user", inviteeId)
                .query(UUID.class)
                .optional();
    }

    /** Prevzame (izbriše) povabilo uporabnika; prazno, če ga ni (že obdelano, umaknjeno ali tuje). */
    Optional<Claimed> claim(UUID invitationId, long inviteeId) {
        return jdbc.sql("DELETE FROM invitation WHERE id = :id AND invitee_id = :user RETURNING group_id, role")
                .param("id", invitationId)
                .param("user", inviteeId)
                .query((rs, row) -> new Claimed(rs.getObject("group_id", UUID.class), rs.getString("role")))
                .optional();
    }

    /** Doda člana; vrne število dodanih vrstic (0 = že član). */
    int addMember(UUID groupId, long userId, String role) {
        return jdbc.sql("INSERT INTO group_member (group_id, user_id, role) VALUES (:group, :user, :role)"
                        + " ON CONFLICT DO NOTHING")
                .param("group", groupId)
                .param("user", userId)
                .param("role", role)
                .update();
    }

    /** Naslov in arhiviranost skupine za odgovor sprejema. */
    Optional<GroupHeading> heading(UUID groupId) {
        return jdbc.sql("SELECT title, archived_at IS NOT NULL AS archived FROM contact_group WHERE id = :id")
                .param("id", groupId)
                .query((rs, row) -> new GroupHeading(rs.getString("title"), rs.getBoolean("archived")))
                .optional();
    }

    record GroupHeading(String title, boolean archived) {}

    boolean decline(UUID invitationId, long inviteeId) {
        return jdbc.sql("DELETE FROM invitation WHERE id = :id AND invitee_id = :user")
                        .param("id", invitationId)
                        .param("user", inviteeId)
                        .update()
                > 0;
    }

    private static UserRef userOrNull(String name, String email) {
        return email == null ? null : new UserRef(name, email);
    }
}

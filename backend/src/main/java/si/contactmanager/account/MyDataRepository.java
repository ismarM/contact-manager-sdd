package si.contactmanager.account;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contactmanager.account.DisplayFormat.AddressFormat;
import si.contactmanager.account.DisplayFormat.DateFormat;
import si.contactmanager.account.DisplayFormat.PhoneFormat;
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
    private final String statsZone;

    MyDataRepository(JdbcClient jdbc, @Value("${api-keys.stats-zone}") ZoneId statsZone) {
        this.jdbc = jdbc;
        this.statsZone = statsZone.getId();
    }

    Optional<ProfileWithId> profile(String firebaseUid) {
        return jdbc.sql("SELECT id, name, email, created_at, language, theme, phone_format, date_format, address_format"
                        + " FROM app_user WHERE firebase_uid = :uid")
                .param("uid", firebaseUid)
                .query((rs, row) -> new ProfileWithId(
                        rs.getLong("id"),
                        new ProfileRow(
                                rs.getString("name"),
                                rs.getString("email"),
                                instant(rs, "created_at"),
                                rs.getString("language"),
                                rs.getString("theme"),
                                known(PhoneFormat.class, rs.getString("phone_format")),
                                known(DateFormat.class, rs.getString("date_format")),
                                known(AddressFormat.class, rs.getString("address_format")))))
                .optional();
    }

    /** Neznana vrednost v bazi se izvozi kot privzeta ({@code null}), enako kot v profilu. */
    private static <E extends Enum<E>> String known(Class<E> type, String name) {
        E value = DisplayFormat.read(type, name);
        return value == null ? null : value.name();
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

    /** Gesla za aplikacijo (014, FR-014-25): samo ime in časi. */
    List<ExportAssembler.AppPasswordRow> appPasswords(long user) {
        return jdbc.sql("SELECT name, created_at, last_used_at FROM app_password WHERE user_id = :user")
                .param("user", user)
                .query((rs, row) -> new ExportAssembler.AppPasswordRow(
                        rs.getString("name"),
                        instant(rs, "created_at"),
                        rs.getObject("last_used_at") == null ? null : instant(rs, "last_used_at")))
                .list();
    }

    /**
     * API ključi (019, FR-019-05, -21): ime, obseg, časi in dnevni povzetki statistike v časovnem pasu statistike; brez
     * ključa in prepoznavnega dela.
     */
    List<ExportAssembler.ApiKeyRow> apiKeys(long user) {
        Map<UUID, List<MyData.ApiKeyGroup>> groups = new HashMap<>();
        jdbc.sql("SELECT kg.key_id, g.title, kg.permission FROM api_key_group kg"
                        + " JOIN api_key k ON k.id = kg.key_id JOIN contact_group g ON g.id = kg.group_id"
                        + " WHERE k.user_id = :user")
                .param("user", user)
                .query((rs, row) -> {
                    groups.computeIfAbsent(rs.getObject("key_id", UUID.class), k -> new ArrayList<>())
                            .add(new MyData.ApiKeyGroup(rs.getString("title"), rs.getString("permission")));
                    return null;
                })
                .list();
        Map<UUID, List<MyData.ApiKeyUsageDay>> usage = new HashMap<>();
        jdbc.sql("SELECT u.key_id, (u.hour AT TIME ZONE :zone)::date AS day, sum(u.read_ok) AS read_ok,"
                        + " sum(u.write_ok) AS write_ok, sum(u.errors) AS errors, sum(u.rate_limited) AS rate_limited"
                        + " FROM api_key_usage u JOIN api_key k ON k.id = u.key_id WHERE k.user_id = :user"
                        + " GROUP BY u.key_id, day")
                .param("user", user)
                .param("zone", statsZone)
                .query((rs, row) -> {
                    usage.computeIfAbsent(rs.getObject("key_id", UUID.class), k -> new ArrayList<>())
                            .add(new MyData.ApiKeyUsageDay(
                                    rs.getObject("day", LocalDate.class),
                                    rs.getInt("read_ok"),
                                    rs.getInt("write_ok"),
                                    rs.getInt("errors"),
                                    rs.getInt("rate_limited")));
                    return null;
                })
                .list();
        return jdbc.sql("SELECT id, name, all_groups_permission, created_at, expires_at, last_used_at, revoked_at"
                        + " FROM api_key WHERE user_id = :user")
                .param("user", user)
                .query((rs, row) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    return new ExportAssembler.ApiKeyRow(
                            rs.getString("name"),
                            rs.getString("all_groups_permission"),
                            groups.getOrDefault(id, List.of()),
                            instant(rs, "created_at"),
                            nullableInstant(rs, "expires_at"),
                            nullableInstant(rs, "last_used_at"),
                            nullableInstant(rs, "revoked_at"),
                            usage.getOrDefault(id, List.of()));
                })
                .list();
    }

    private static Instant nullableInstant(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column) == null ? null : instant(rs, column);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class).toInstant();
    }
}

package si.contactmanager.apikey;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;

/** Tabeli {@code api_key} in {@code api_key_group} (019 data-model.md); vsaka poizvedba je vezana na lastnika. */
@Repository
class ApiKeyRepository {

    /** Vrstica ključa za seznam (brez žetona). */
    record Row(
            UUID id,
            String name,
            String hint,
            Permission allGroupsPermission,
            Instant createdAt,
            Instant expiresAt,
            Instant lastUsedAt,
            Instant revokedAt,
            int requestsLast24h) {}

    /** Skupina v prikaznem obsegu ključa (naslov iz skupine). */
    record GroupRow(UUID keyId, UUID groupId, String title, Permission permission) {}

    private final JdbcClient jdbc;

    ApiKeyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Ime veljavnega ključa za prijavo na {@code /v1}: vrstica obstaja, pripada uporabniku {@code user} in ni preklicana.
     * Rok preveri že podpis žetona ({@code exp}).
     */
    Optional<String> activeKeyName(UUID keyId, long user) {
        return jdbc.sql("SELECT name FROM api_key WHERE id = :id AND user_id = :user AND revoked_at IS NULL")
                .param("id", keyId)
                .param("user", user)
                .query(String.class)
                .optional();
    }

    /**
     * Ključi uporabnika, novejši prvi; preklicani in potekli samo še 90 dni od preklica oziroma poteka (FR-019-21).
     * {@code requestsLast24h} je vsota statistike zadnjih 24 ur.
     */
    List<Row> list(long user) {
        return jdbc.sql("SELECT k.id, k.name, k.hint, k.all_groups_permission, k.created_at, k.expires_at,"
                        + " k.last_used_at, k.revoked_at,"
                        + " (SELECT coalesce(sum(u.read_ok + u.write_ok + u.errors + u.rate_limited), 0)"
                        + "    FROM api_key_usage u WHERE u.key_id = k.id AND u.hour > now() - interval '24 hours')"
                        + "   AS requests"
                        + " FROM api_key k WHERE k.user_id = :user"
                        + " AND (least(k.revoked_at, k.expires_at) IS NULL"
                        + "      OR least(k.revoked_at, k.expires_at) > now() - interval '90 days')"
                        + " ORDER BY k.created_at DESC, k.id DESC")
                .param("user", user)
                .query(ApiKeyRepository::row)
                .list();
    }

    /** Ključ obstaja, pripada uporabniku in ni končan pred več kot 90 dnevi (kot seznam; FR-019-21). */
    boolean visible(long user, UUID id) {
        return jdbc.sql("SELECT count(*) FROM api_key k WHERE k.id = :id AND k.user_id = :user"
                                + " AND (least(k.revoked_at, k.expires_at) IS NULL"
                                + "      OR least(k.revoked_at, k.expires_at) > now() - interval '90 days')")
                        .param("id", id)
                        .param("user", user)
                        .query(Integer.class)
                        .single()
                > 0;
    }

    /** Skupine ključev po id-ju ključa, razvrščene po naslovu. */
    Map<UUID, List<GroupRow>> groups(Collection<UUID> keys) {
        Map<UUID, List<GroupRow>> result = new LinkedHashMap<>();
        if (keys.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT kg.key_id, kg.group_id, g.title, kg.permission FROM api_key_group kg"
                        + " JOIN contact_group g ON g.id = kg.group_id WHERE kg.key_id IN (:keys)"
                        + " ORDER BY g.title, g.id")
                .param("keys", keys)
                .query((rs, n) -> new GroupRow(
                        rs.getObject("key_id", UUID.class),
                        rs.getObject("group_id", UUID.class),
                        rs.getString("title"),
                        Permission.valueOf(rs.getString("permission"))))
                .list()
                .forEach(row -> result.computeIfAbsent(row.keyId(), k -> new ArrayList<>())
                        .add(row));
        return result;
    }

    /** Zaklene vrstico uporabnika (meja brez dirke, research R-09) in vrne število aktivnih ključev. */
    int lockAndCountActive(long user) {
        jdbc.sql("SELECT id FROM app_user WHERE id = :user FOR UPDATE")
                .param("user", user)
                .query(Long.class)
                .optional();
        return jdbc.sql("SELECT count(*) FROM api_key WHERE user_id = :user AND revoked_at IS NULL"
                        + " AND (expires_at IS NULL OR expires_at > now())")
                .param("user", user)
                .query(Integer.class)
                .single();
    }

    /** Nov id ključa (uuidv7, enak {@code jti}). */
    UUID newId() {
        return jdbc.sql("SELECT uuidv7()").query(UUID.class).single();
    }

    void insert(
            UUID id,
            long user,
            String name,
            String hint,
            Permission allGroupsPermission,
            Instant createdAt,
            Instant expiresAt) {
        jdbc.sql("INSERT INTO api_key (id, user_id, name, hint, all_groups, all_groups_permission, created_at,"
                        + " expires_at) VALUES (:id, :user, :name, :hint, :all, :permission, :created, :expires)")
                .param("id", id)
                .param("user", user)
                .param("name", name)
                .param("hint", hint)
                .param("all", allGroupsPermission != null)
                .param("permission", allGroupsPermission == null ? null : allGroupsPermission.name())
                .param("created", Timestamp.from(createdAt))
                .param("expires", expiresAt == null ? null : Timestamp.from(expiresAt))
                .update();
    }

    void insertGroup(UUID key, UUID group, Permission permission) {
        jdbc.sql("INSERT INTO api_key_group (key_id, group_id, permission) VALUES (:key, :group, :permission)")
                .param("key", key)
                .param("group", group)
                .param("permission", permission.name())
                .update();
    }

    /** Preklic (idempotenten): {@code false}, če ključ ne obstaja ali je tuj. */
    boolean revoke(long user, UUID id) {
        jdbc.sql("UPDATE api_key SET revoked_at = now() WHERE user_id = :user AND id = :id AND revoked_at IS NULL")
                .param("user", user)
                .param("id", id)
                .update();
        return jdbc.sql("SELECT count(*) FROM api_key WHERE user_id = :user AND id = :id")
                        .param("user", user)
                        .param("id", id)
                        .query(Integer.class)
                        .single()
                > 0;
    }

    private static Row row(ResultSet rs, int n) throws SQLException {
        String permission = rs.getString("all_groups_permission");
        return new Row(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getString("hint"),
                permission == null ? null : Permission.valueOf(permission),
                instant(rs.getTimestamp("created_at")),
                instant(rs.getTimestamp("expires_at")),
                instant(rs.getTimestamp("last_used_at")),
                instant(rs.getTimestamp("revoked_at")),
                rs.getInt("requests"));
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}

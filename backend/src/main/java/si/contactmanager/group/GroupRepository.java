package si.contactmanager.group;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Skupine in članstva v tabelah {@code contact_group} in {@code group_member} (data-model.md). */
@Repository
class GroupRepository {

    /** Članstvo uporabnika v skupini: vloga in arhiviranost skupine (za {@link GroupAccess}). */
    record MemberState(Role role, boolean archived, boolean permanentlyArchived) {}

    /** Zaklenjena vrstica skupine za urejanje (research R-06). */
    record LockedGroup(String title, String description, GroupColor color, long version, boolean archived) {}

    /** Stanje zaklenjene skupine za prehode arhiviranja in izbris (research R-03). */
    record LockState(boolean archived, boolean hasOwner) {}

    private static final String NO_OWNER =
            "NOT EXISTS (SELECT 1 FROM group_member o WHERE o.group_id = g.id AND o.role = 'OWNER')";

    private static final String DETAIL = "SELECT g.id, g.title, g.description, g.color, m.role,"
            + " g.archived_at IS NOT NULL AS archived,"
            + " (g.archived_at IS NOT NULL AND " + NO_OWNER + ") AS permanent,"
            + " (SELECT count(*) FROM group_member c WHERE c.group_id = g.id) AS members,"
            + " g.version, g.updated_at,"
            + " u.name AS updated_by_name, u.email AS updated_by_email"
            + " FROM contact_group g"
            + " JOIN group_member m ON m.group_id = g.id AND m.user_id = :user"
            + " LEFT JOIN app_user u ON u.id = g.updated_by"
            + " WHERE g.id = :id";

    private final JdbcClient jdbc;

    GroupRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    UUID insertGroup(GroupInput input, long creator) {
        return jdbc.sql("INSERT INTO contact_group (title, description, color, updated_by)"
                        + " VALUES (:title, :description, :color, :creator) RETURNING id")
                .param("title", input.title())
                .param("description", input.description())
                .param("color", input.color().code())
                .param("creator", creator)
                .query(UUID.class)
                .single();
    }

    void insertMember(UUID group, long user, Role role) {
        jdbc.sql("INSERT INTO group_member (group_id, user_id, role) VALUES (:group, :user, :role)")
                .param("group", group)
                .param("user", user)
                .param("role", role.name())
                .update();
    }

    Optional<MemberState> memberState(UUID group, long user) {
        return jdbc.sql("SELECT m.role, g.archived_at IS NOT NULL AS archived,"
                        + " (g.archived_at IS NOT NULL AND " + NO_OWNER + ") AS permanent"
                        + " FROM group_member m JOIN contact_group g ON g.id = m.group_id"
                        + " WHERE m.group_id = :group AND m.user_id = :user")
                .param("group", group)
                .param("user", user)
                .query((rs, row) -> new MemberState(
                        Role.valueOf(rs.getString("role")), rs.getBoolean("archived"), rs.getBoolean("permanent")))
                .optional();
    }

    /** Skupina z vlogo uporabnika; prazno, če uporabnik ni član. */
    Optional<GroupDetail> findDetail(UUID group, long user) {
        return jdbc.sql(DETAIL)
                .param("id", group)
                .param("user", user)
                .query(GroupRepository::detail)
                .optional();
    }

    /** Vrstica skupine z zaklepom do konca transakcije ({@code SELECT … FOR UPDATE}). */
    Optional<LockedGroup> lock(UUID group) {
        return jdbc.sql("SELECT title, description, color, version, archived_at IS NOT NULL AS archived"
                        + " FROM contact_group WHERE id = :id FOR UPDATE")
                .param("id", group)
                .query((rs, row) -> new LockedGroup(
                        rs.getString("title"),
                        rs.getString("description"),
                        GroupColor.fromCode(rs.getString("color")).orElseThrow(),
                        rs.getLong("version"),
                        rs.getBoolean("archived")))
                .optional();
    }

    /** Zaklene vrstico skupine in vrne stanje arhiviranosti in lastništva (do konca transakcije). */
    Optional<LockState> lockState(UUID group) {
        return jdbc.sql("SELECT g.archived_at IS NOT NULL AS archived, NOT (" + NO_OWNER + ") AS has_owner"
                        + " FROM contact_group g WHERE g.id = :id FOR UPDATE")
                .param("id", group)
                .query((rs, row) -> new LockState(rs.getBoolean("archived"), rs.getBoolean("has_owner")))
                .optional();
    }

    /** Nastavi ali odstrani čas arhiviranja; podatki skupine in verzija ostanejo (research R-04). */
    void setArchived(UUID group, boolean archived) {
        jdbc.sql("UPDATE contact_group SET archived_at = " + (archived ? "now()" : "NULL") + " WHERE id = :id")
                .param("id", group)
                .update();
    }

    long memberCount(UUID group) {
        return jdbc.sql("SELECT count(*) FROM group_member WHERE group_id = :id")
                .param("id", group)
                .query(Long.class)
                .single();
    }

    /** Izbriše skupino; članstva (in odvisne tabele z ON DELETE CASCADE) izginejo z njo (FR-003-11). */
    void delete(UUID group) {
        jdbc.sql("DELETE FROM contact_group WHERE id = :id").param("id", group).update();
    }

    long countArchived(long user) {
        return jdbc.sql("SELECT count(*) FROM group_member m JOIN contact_group g ON g.id = m.group_id"
                        + " WHERE m.user_id = :user AND g.archived_at IS NOT NULL")
                .param("user", user)
                .query(Long.class)
                .single();
    }

    /** Stran arhiviranih skupin uporabnika, urejena po naslovu po pravilih jezika, nato po id (FR-003-07). */
    List<ArchivedGroupSummary> pageArchived(long user, Collation collation, int size, int page) {
        return jdbc.sql("SELECT g.id, g.title, g.description, g.color, m.role,"
                        + " (" + NO_OWNER + ") AS permanent,"
                        + " (SELECT count(*) FROM contact k WHERE k.group_id = g.id) AS contacts"
                        + " FROM group_member m JOIN contact_group g ON g.id = m.group_id"
                        + " WHERE m.user_id = :user AND g.archived_at IS NOT NULL"
                        + " ORDER BY g.title COLLATE " + collation.sqlName() + ", g.id"
                        + " LIMIT :size OFFSET :offset")
                .param("user", user)
                .param("size", size)
                .param("offset", (long) page * size)
                // Število kontaktov skupine (004, research R-12).
                .query((rs, row) -> new ArchivedGroupSummary(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getString("description"),
                        rs.getString("color"),
                        rs.getInt("contacts"),
                        Role.valueOf(rs.getString("role")),
                        rs.getBoolean("permanent")))
                .list();
    }

    /** Spremeni podatke, poveča verzijo ter zapiše izvajalca in čas (FR-002-11, FR-002-12). */
    void update(UUID group, GroupInput input, long editor) {
        jdbc.sql("UPDATE contact_group SET title = :title, description = :description, color = :color,"
                        + " version = version + 1, updated_by = :editor, updated_at = now() WHERE id = :id")
                .param("id", group)
                .param("title", input.title())
                .param("description", input.description())
                .param("color", input.color().code())
                .param("editor", editor)
                .update();
    }

    /** Število nearhiviranih skupin uporabnika po vlogi (FR-002-04). */
    Map<Role, Long> countByRole(long user) {
        Map<Role, Long> counts = new EnumMap<>(Role.class);
        jdbc.sql("SELECT m.role, count(*) AS total FROM group_member m"
                        + " JOIN contact_group g ON g.id = m.group_id"
                        + " WHERE m.user_id = :user AND g.archived_at IS NULL GROUP BY m.role")
                .param("user", user)
                .query((ResultSet rs) -> {
                    while (rs.next()) {
                        counts.put(Role.valueOf(rs.getString("role")), rs.getLong("total"));
                    }
                    return counts;
                });
        return counts;
    }

    /**
     * Stran razdelka, urejena po naslovu po pravilih jezika (ICU kolacija iz zaprte preslikave, D-28), nato po id za
     * stabilno paginacijo pri enakih naslovih.
     */
    List<GroupSummary> pageByRole(long user, Role role, Collation collation, int size, int page) {
        return jdbc.sql("SELECT g.id, g.title, g.description, g.color,"
                        + " (SELECT count(*) FROM contact k WHERE k.group_id = g.id) AS contacts FROM group_member m"
                        + " JOIN contact_group g ON g.id = m.group_id"
                        + " WHERE m.user_id = :user AND m.role = :role AND g.archived_at IS NULL"
                        + " ORDER BY g.title COLLATE " + collation.sqlName() + ", g.id"
                        + " LIMIT :size OFFSET :offset")
                .param("user", user)
                .param("role", role.name())
                .param("size", size)
                .param("offset", (long) page * size)
                // Število kontaktov skupine (004, research R-12).
                .query((rs, row) -> new GroupSummary(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getString("description"),
                        rs.getString("color"),
                        rs.getInt("contacts")))
                .list();
    }

    private static GroupDetail detail(ResultSet rs, int row) throws SQLException {
        String email = rs.getString("updated_by_email");
        Timestamp updatedAt = rs.getTimestamp("updated_at");
        Role role = Role.valueOf(rs.getString("role"));
        boolean permanent = rs.getBoolean("permanent");
        boolean canDelete = rs.getLong("members") == 1 && (role == Role.OWNER || permanent);
        return new GroupDetail(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getString("description"),
                rs.getString("color"),
                role,
                rs.getBoolean("archived"),
                permanent,
                canDelete,
                rs.getLong("version"),
                updatedAt.toInstant(),
                email == null ? null : new UserRef(rs.getString("updated_by_name"), email));
    }

    /** ICU kolaciji iz migracije V3 – ime v SQL je vedno iz tega zaprtega seznama. */
    enum Collation {
        SL("title_sl"),
        EN("title_en");

        private final String sqlName;

        Collation(String sqlName) {
            this.sqlName = sqlName;
        }

        String sqlName() {
            return sqlName;
        }
    }
}

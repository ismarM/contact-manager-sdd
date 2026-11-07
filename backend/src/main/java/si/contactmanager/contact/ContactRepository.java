package si.contactmanager.contact;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contactmanager.group.UserRef;

/**
 * Kontakti, atributi in značke v tabelah {@code contact}, {@code contact_attribute} in {@code contact_tag}
 * (data-model.md). Vsaka poizvedba kontakta ima pogoj {@code group_id} (izolacija skupin, konstitucija III).
 */
@Repository
class ContactRepository {

    /** Največ predlogov značk (research R-07). */
    static final int SUGGESTIONS = 20;

    private static final String DETAIL = "SELECT c.id, c.first_name, c.last_name, c.address, c.email, c.phone,"
            + " c.version, c.created_at, c.updated_at, u.name AS updated_by_name, u.email AS updated_by_email"
            + " FROM contact c LEFT JOIN app_user u ON u.id = c.updated_by"
            + " WHERE c.group_id = :group AND c.id = :id";

    private final JdbcClient jdbc;

    ContactRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Prikazno ime: ime in priimek brez manjkajočega dela (data-model.md). */
    static String displayName(String firstName, String lastName) {
        if (firstName == null) {
            return lastName;
        }
        return lastName == null ? firstName : firstName + " " + lastName;
    }

    /** Ključ razvrščanja: male črke, razvrščeno po kodnih točkah (D-38); prazno = {@code null} (na koncu). */
    private static String sortKey(String name) {
        return name == null ? null : name.toLowerCase(Locale.ROOT);
    }

    /**
     * Zaklene vrstico skupine za pisanje kontakta (research R-05): počaka na sočasno arhiviranje (ki skupino zaklene z
     * {@code FOR UPDATE}) in vrne, ali je skupina arhivirana; prazno, če skupine ni več.
     */
    Optional<Boolean> lockGroupArchived(UUID group) {
        return jdbc.sql("SELECT archived_at IS NOT NULL FROM contact_group WHERE id = :group FOR SHARE")
                .param("group", group)
                .query(Boolean.class)
                .optional();
    }

    /** Zaklene kontakt v skupini in vrne njegovo verzijo; prazno, če ga v tej skupini ni. */
    Optional<Long> lockVersion(UUID group, UUID id) {
        return jdbc.sql("SELECT version FROM contact WHERE group_id = :group AND id = :id FOR UPDATE")
                .param("group", group)
                .param("id", id)
                .query(Long.class)
                .optional();
    }

    boolean exists(UUID group, UUID id) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM contact WHERE group_id = :group AND id = :id)")
                .param("group", group)
                .param("id", id)
                .query(Boolean.class)
                .single();
    }

    Optional<ContactDetail> find(UUID group, UUID id) {
        Optional<ContactDetail> base = jdbc.sql(DETAIL)
                .param("group", group)
                .param("id", id)
                .query(ContactRepository::detail)
                .optional();
        return base.map(contact ->
                withChildren(contact, attributes(id), tags(List.of(id)).getOrDefault(id, List.of())));
    }

    long count(UUID group) {
        return jdbc.sql("SELECT count(*) FROM contact WHERE group_id = :group")
                .param("group", group)
                .query(Long.class)
                .single();
    }

    /** Stran kontaktov po priimku, nato imenu (kodne točke, prazno na koncu), nato po času nastanka in id (D-38). */
    List<ContactSummary> page(UUID group, int size, int page) {
        List<ContactSummary> rows = jdbc.sql("SELECT id, first_name, last_name, email, phone, version FROM contact"
                        + " WHERE group_id = :group"
                        + " ORDER BY sort_last NULLS LAST, sort_first NULLS LAST, created_at, id"
                        + " LIMIT :size OFFSET :offset")
                .param("group", group)
                .param("size", size)
                .param("offset", (long) page * size)
                .query((rs, row) -> {
                    String first = rs.getString("first_name");
                    String last = rs.getString("last_name");
                    return new ContactSummary(
                            rs.getObject("id", UUID.class),
                            first,
                            last,
                            displayName(first, last),
                            rs.getString("email"),
                            rs.getString("phone"),
                            List.of(),
                            rs.getLong("version"));
                })
                .list();
        if (rows.isEmpty()) {
            return rows;
        }
        Map<UUID, List<String>> tags =
                tags(rows.stream().map(ContactSummary::id).toList());
        return rows.stream()
                .map(c -> new ContactSummary(
                        c.id(),
                        c.firstName(),
                        c.lastName(),
                        c.displayName(),
                        c.email(),
                        c.phone(),
                        tags.getOrDefault(c.id(), List.of()),
                        c.version()))
                .toList();
    }

    UUID insert(UUID group, ContactInput input, long user) {
        UUID id = jdbc.sql("INSERT INTO contact (group_id, first_name, last_name, address, email, phone,"
                        + " sort_last, sort_first, updated_by)"
                        + " VALUES (:group, :first, :last, :address, :email, :phone, :sortLast, :sortFirst, :user)"
                        + " RETURNING id")
                .param("group", group)
                .param("first", input.firstName())
                .param("last", input.lastName())
                .param("address", input.address())
                .param("email", input.email())
                .param("phone", input.phone())
                .param("sortLast", sortKey(input.lastName()))
                .param("sortFirst", sortKey(input.firstName()))
                .param("user", user)
                .query(UUID.class)
                .single();
        insertChildren(id, input);
        return id;
    }

    /** Zamenja vrednosti, poveča verzijo ter zapiše izvajalca in čas (FR-004-10). */
    void update(UUID group, UUID id, ContactInput input, long user) {
        jdbc.sql("UPDATE contact SET first_name = :first, last_name = :last, address = :address, email = :email,"
                        + " phone = :phone, sort_last = :sortLast, sort_first = :sortFirst, version = version + 1,"
                        + " updated_by = :user, updated_at = now() WHERE group_id = :group AND id = :id")
                .param("group", group)
                .param("id", id)
                .param("first", input.firstName())
                .param("last", input.lastName())
                .param("address", input.address())
                .param("email", input.email())
                .param("phone", input.phone())
                .param("sortLast", sortKey(input.lastName()))
                .param("sortFirst", sortKey(input.firstName()))
                .param("user", user)
                .update();
        jdbc.sql("DELETE FROM contact_attribute WHERE contact_id = :id")
                .param("id", id)
                .update();
        jdbc.sql("DELETE FROM contact_tag WHERE contact_id = :id")
                .param("id", id)
                .update();
        insertChildren(id, input);
    }

    void delete(UUID group, UUID id) {
        jdbc.sql("DELETE FROM contact WHERE group_id = :group AND id = :id")
                .param("group", group)
                .param("id", id)
                .update();
    }

    /**
     * Do 20 različnih značk skupine (po normalizirani obliki), ki se začnejo z normaliziranim {@code prefix}; prikazana
     * je oblika najstarejšega kontakta, razvrščeno po normalizirani obliki (research R-07).
     */
    List<String> suggestTags(UUID group, String prefix) {
        return jdbc.sql("SELECT tag FROM (SELECT DISTINCT ON (t.tag_norm) t.tag_norm, t.tag FROM contact_tag t"
                        + " JOIN contact c ON c.id = t.contact_id"
                        + " WHERE c.group_id = :group AND starts_with(t.tag_norm, :prefix)"
                        + " ORDER BY t.tag_norm, c.created_at, c.id) s"
                        + " ORDER BY tag_norm COLLATE \"C\" LIMIT :limit")
                .param("group", group)
                .param("prefix", ContactInputParser.normalize(prefix))
                .param("limit", SUGGESTIONS)
                .query(String.class)
                .list();
    }

    private void insertChildren(UUID id, ContactInput input) {
        List<Attribute> attributes = input.attributes();
        for (int i = 0; i < attributes.size(); i++) {
            Attribute attribute = attributes.get(i);
            jdbc.sql("INSERT INTO contact_attribute (contact_id, position, key, key_norm, value)"
                            + " VALUES (:id, :position, :key, :norm, :value)")
                    .param("id", id)
                    .param("position", i)
                    .param("key", attribute.key())
                    .param("norm", ContactInputParser.normalize(attribute.key()))
                    .param("value", attribute.value())
                    .update();
        }
        List<String> tags = input.tags();
        for (int i = 0; i < tags.size(); i++) {
            jdbc.sql(
                            "INSERT INTO contact_tag (contact_id, position, tag, tag_norm) VALUES (:id, :position, :tag, :norm)")
                    .param("id", id)
                    .param("position", i)
                    .param("tag", tags.get(i))
                    .param("norm", ContactInputParser.normalize(tags.get(i)))
                    .update();
        }
    }

    private List<Attribute> attributes(UUID id) {
        return jdbc.sql("SELECT key, value FROM contact_attribute WHERE contact_id = :id ORDER BY position")
                .param("id", id)
                .query((rs, row) -> new Attribute(rs.getString("key"), rs.getString("value")))
                .list();
    }

    private Map<UUID, List<String>> tags(Collection<UUID> ids) {
        Map<UUID, List<String>> tags = new LinkedHashMap<>();
        jdbc.sql("SELECT contact_id, tag FROM contact_tag WHERE contact_id IN (:ids) ORDER BY contact_id, position")
                .param("ids", ids)
                .query((ResultSet rs) -> {
                    while (rs.next()) {
                        tags.computeIfAbsent(rs.getObject("contact_id", UUID.class), key -> new ArrayList<>())
                                .add(rs.getString("tag"));
                    }
                    return tags;
                });
        return tags;
    }

    private static ContactDetail withChildren(ContactDetail c, List<Attribute> attributes, List<String> tags) {
        return new ContactDetail(
                c.id(),
                c.firstName(),
                c.lastName(),
                c.displayName(),
                c.address(),
                c.email(),
                c.phone(),
                List.copyOf(attributes),
                List.copyOf(tags),
                c.version(),
                c.createdAt(),
                c.updatedAt(),
                c.updatedBy());
    }

    private static ContactDetail detail(ResultSet rs, int row) throws SQLException {
        String first = rs.getString("first_name");
        String last = rs.getString("last_name");
        String email = rs.getString("updated_by_email");
        return new ContactDetail(
                rs.getObject("id", UUID.class),
                first,
                last,
                displayName(first, last),
                rs.getString("address"),
                rs.getString("email"),
                rs.getString("phone"),
                List.of(),
                List.of(),
                rs.getLong("version"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                email == null ? null : new UserRef(rs.getString("updated_by_name"), email));
    }
}

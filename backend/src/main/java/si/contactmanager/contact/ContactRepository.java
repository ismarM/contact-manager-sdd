package si.contactmanager.contact;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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

    /** Največ identitet v enem stavku (meja parametrov PostgreSQL je 32.767). */
    private static final int CHUNK = 5000;

    private static final String DETAIL = "SELECT c.id, c.first_name, c.last_name, c.address, c.email, c.phone,"
            + " c.version, c.created_at, c.updated_at, u.name AS updated_by_name, u.email AS updated_by_email,"
            + " r.id AS rollback_id, r.created_at AS rollback_at, ru.name AS rollback_by_name,"
            + " ru.email AS rollback_by_email, r.target_initial AS rollback_initial, rt.id AS target_id,"
            + " rt.created_at AS target_at"
            + " FROM contact c LEFT JOIN app_user u ON u.id = c.updated_by"
            + " LEFT JOIN audit_entry r ON r.id = c.reverted_entry_id"
            + " LEFT JOIN app_user ru ON ru.id = r.actor_id"
            + " LEFT JOIN audit_entry rt ON rt.id = r.target_entry_id"
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

    /** Identitete vseh zadetkov poizvedbe (brez razvrščanja; »Izberi vse zadetke«, research R-09). */
    List<UUID> ids(UUID group, ContactQuery query) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        String where = ContactSearch.where(group, query, parameters);
        return jdbc.sql("SELECT c.id FROM contact c WHERE " + where)
                .params(parameters)
                .query(UUID.class)
                .list();
    }

    /** Identitete iz {@code ids}, ki so kontakti te skupine. */
    Set<UUID> existing(UUID group, Collection<UUID> ids) {
        Set<UUID> found = new LinkedHashSet<>();
        for (List<UUID> chunk : chunks(ids)) {
            found.addAll(jdbc.sql("SELECT id FROM contact WHERE group_id = :group AND id IN (:ids)")
                    .param("group", group)
                    .param("ids", chunk)
                    .query(UUID.class)
                    .list());
        }
        return found;
    }

    /**
     * Zaklene obstoječe kontakte iz {@code ids} (research R-03): po kosih in v vrstnem redu {@code id}, zato se
     * prekrivajoči operaciji ne zaklenita križno; vrne zaklenjene identitete.
     */
    Set<UUID> lockExisting(UUID group, Collection<UUID> ids) {
        List<UUID> sorted = ids.stream().sorted().toList();
        Set<UUID> locked = new LinkedHashSet<>();
        for (List<UUID> chunk : chunks(sorted)) {
            locked.addAll(jdbc.sql("SELECT id FROM contact WHERE group_id = :group AND id IN (:ids)"
                            + " ORDER BY id FOR UPDATE")
                    .param("group", group)
                    .param("ids", chunk)
                    .query(UUID.class)
                    .list());
        }
        return locked;
    }

    /** Identitete iz {@code ids}, ki se pojavijo v sledi te skupine (so bile njeni kontakti; R-02). */
    Set<UUID> knownToGroup(UUID group, Collection<UUID> ids) {
        Set<UUID> known = new LinkedHashSet<>();
        for (List<UUID> chunk : chunks(ids)) {
            known.addAll(jdbc.sql("SELECT DISTINCT ch.contact_id FROM audit_change ch"
                            + " JOIN audit_entry e ON e.id = ch.entry_id"
                            + " WHERE e.group_id = :group AND ch.contact_id IN (:ids)")
                    .param("group", group)
                    .param("ids", chunk)
                    .query(UUID.class)
                    .list());
        }
        return known;
    }

    /** Izbriše kontakte skupine (kaskada odstrani atribute in značke); vrne število izbrisanih. */
    int deleteAll(UUID group, Collection<UUID> ids) {
        int deleted = 0;
        for (List<UUID> chunk : chunks(ids)) {
            deleted += jdbc.sql("DELETE FROM contact WHERE group_id = :group AND id IN (:ids)")
                    .param("group", group)
                    .param("ids", chunk)
                    .update();
        }
        return deleted;
    }

    private static List<List<UUID>> chunks(Collection<UUID> ids) {
        List<UUID> all = ids instanceof List<UUID> list ? list : new ArrayList<>(ids);
        List<List<UUID>> chunks = new ArrayList<>();
        for (int from = 0; from < all.size(); from += CHUNK) {
            chunks.add(all.subList(from, Math.min(all.size(), from + CHUNK)));
        }
        return chunks;
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

    long count(UUID group, ContactQuery query) {
        ContactSearch.Sql sql = ContactSearch.count(group, query);
        return jdbc.sql(sql.text()).params(sql.parameters()).query(Long.class).single();
    }

    /**
     * Stran zadetkov poizvedbe (iskanje, pogoji, značke, razvrščanje po slovenski abecedi, D-63); besedilo SQL gradi
     * {@link ContactSearch}, vse vrednosti so imenovani parametri.
     */
    List<ContactSummary> page(UUID group, ContactQuery query) {
        ContactSearch.Sql sql = ContactSearch.page(group, query);
        List<ContactSummary> rows = jdbc.sql(sql.text())
                .params(sql.parameters())
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
                            rs.getLong("version"),
                            rs.getBoolean("reverted"));
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
                        c.version(),
                        c.reverted()))
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
                        + " updated_by = :user, updated_at = now(), reverted_entry_id = NULL"
                        + " WHERE group_id = :group AND id = :id")
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

    /** Normalizirani dodatni ključi iz {@code keys}, ki jih ima vsaj en kontakt te skupine (FR-008-14, R-06). */
    java.util.Set<String> existingKeys(UUID group, Collection<String> keys) {
        java.util.Set<String> existing = new java.util.LinkedHashSet<>();
        for (String key : keys) {
            // Korelirana skalarna podizbira ima stalen načrt: kontakti skupine, za vsakega točno iskanje po indeksu
            // contact_attribute_key (key_norm, contact_id). Zapis z JOIN ali EXISTS planer združi in pri zastareli
            // statistiki (po množičnem vstavljanju, pred samodejno analizo) izbere vgnezdeno zanko z ~8 M branji
            // (D-71).
            boolean found = jdbc.sql("SELECT EXISTS (SELECT 1 FROM contact c WHERE c.group_id = :group AND"
                            + " (SELECT 1 FROM contact_attribute a WHERE a.contact_id = c.id AND a.key_norm = :key"
                            + " LIMIT 1) IS NOT NULL)")
                    .param("group", group)
                    .param("key", key)
                    .query(Boolean.class)
                    .single();
            if (found) {
                existing.add(key);
            }
        }
        return existing;
    }

    /**
     * Možnosti filtrov skupine (FR-008-06): različni ključi in značke, vsak v obliki najstarejšega kontakta, po
     * slovenski abecedi (research R-08).
     */
    ContactFilterOptions filterOptions(UUID group) {
        List<String> keys = jdbc.sql("SELECT key FROM (SELECT DISTINCT ON (a.key_norm) a.key_norm, a.key"
                        + " FROM contact_attribute a JOIN contact c ON c.id = a.contact_id WHERE c.group_id = :group"
                        + " ORDER BY a.key_norm, c.created_at, c.id) s ORDER BY key_norm COLLATE sort_sl, key_norm")
                .param("group", group)
                .query(String.class)
                .list();
        List<String> tags = jdbc.sql("SELECT tag FROM (SELECT DISTINCT ON (t.tag_norm) t.tag_norm, t.tag"
                        + " FROM contact_tag t JOIN contact c ON c.id = t.contact_id WHERE c.group_id = :group"
                        + " ORDER BY t.tag_norm, c.created_at, c.id) s ORDER BY tag_norm COLLATE sort_sl, tag_norm")
                .param("group", group)
                .query(String.class)
                .list();
        return new ContactFilterOptions(keys, tags);
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
                c.updatedBy(),
                c.reverted());
    }

    private static RevertInfo revert(ResultSet rs) throws SQLException {
        UUID rollback = rs.getObject("rollback_id", UUID.class);
        if (rollback == null) {
            return null;
        }
        String by = rs.getString("rollback_by_email");
        UUID target = rs.getObject("target_id", UUID.class);
        return new RevertInfo(
                rollback,
                rs.getTimestamp("rollback_at").toInstant(),
                by == null ? null : new UserRef(rs.getString("rollback_by_name"), by),
                target,
                target == null ? null : rs.getTimestamp("target_at").toInstant(),
                rs.getBoolean("rollback_initial"));
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
                email == null ? null : new UserRef(rs.getString("updated_by_name"), email),
                revert(rs));
    }
}

package si.contactmanager.contact;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Branje in uveljavljanje stanj več kontaktov skupine za revizijsko sled (research R-04, R-12): branje s tremi
 * stavki na skupino id-jev, uveljavljanje s paketnimi stavki; vedno s pogojem {@code group_id} (izolacija skupin).
 */
@Component
public class ContactSnapshots {

    /** Največ id-jev v enem stavku (meja parametrov PostgreSQL je 32.767). */
    private static final int CHUNK = 5000;

    /**
     * Ciljno stanje kontakta pri rollbacku: {@code state == null} odstrani kontakt, {@code exists == false} ga obnovi
     * z istim id, sicer zamenja njegove vrednosti.
     */
    public record Target(UUID contactId, ContactState state, boolean exists) {}

    private final JdbcClient jdbc;
    private final NamedParameterJdbcTemplate batch;

    ContactSnapshots(JdbcClient jdbc, NamedParameterJdbcTemplate batch) {
        this.jdbc = jdbc;
        this.batch = batch;
    }

    /** Stanja izbranih kontaktov skupine; kontakti, ki jih ni, manjkajo v odgovoru. */
    public Map<UUID, ContactState> load(UUID groupId, Collection<UUID> ids) {
        Map<UUID, ContactState> states = new LinkedHashMap<>();
        List<UUID> all = new ArrayList<>(ids);
        for (int from = 0; from < all.size(); from += CHUNK) {
            List<UUID> chunk = all.subList(from, Math.min(all.size(), from + CHUNK));
            Map<UUID, List<Attribute>> attributes = attributes(chunk);
            Map<UUID, List<String>> tags = tags(chunk);
            jdbc.sql("SELECT id, first_name, last_name, address, email, phone, version, created_at, updated_at,"
                            + " updated_by FROM contact WHERE group_id = :group AND id IN (:ids)")
                    .param("group", groupId)
                    .param("ids", chunk)
                    .query((ResultSet rs) -> {
                        while (rs.next()) {
                            UUID id = rs.getObject("id", UUID.class);
                            states.put(
                                    id,
                                    state(
                                            rs,
                                            attributes.getOrDefault(id, List.of()),
                                            tags.getOrDefault(id, List.of())));
                        }
                        return states;
                    });
        }
        return states;
    }

    /** Stanje enega kontakta skupine; {@code null}, če ga v tej skupini ni. */
    public ContactState snapshot(UUID groupId, UUID id) {
        return load(groupId, List.of(id)).get(id);
    }

    /**
     * Uveljavi ciljna stanja (research R-12): odstranitve, obnovitve z istim id in zamenjave vrednosti, vse s paketnimi
     * stavki. Spremenjeni in obnovljeni kontakti dobijo oznako {@code reverted_entry_id}; uporabnik zadnje spremembe,
     * ki ne obstaja več, postane {@code NULL}.
     */
    public void apply(UUID groupId, UUID rollbackEntry, List<Target> targets) {
        List<Target> removed = targets.stream().filter(t -> t.state() == null).toList();
        List<Target> restored =
                targets.stream().filter(t -> t.state() != null && !t.exists()).toList();
        List<Target> updated =
                targets.stream().filter(t -> t.state() != null && t.exists()).toList();

        batch.batchUpdate(
                "DELETE FROM contact WHERE group_id = :group AND id = :id",
                removed.stream()
                        .map(t -> (SqlParameterSource) new MapSqlParameterSource()
                                .addValue("group", groupId)
                                .addValue("id", t.contactId()))
                        .toArray(SqlParameterSource[]::new));
        batch.batchUpdate(
                "INSERT INTO contact (id, group_id, first_name, last_name, address, email, phone, sort_last,"
                        + " sort_first, version, created_at, updated_at, updated_by, reverted_entry_id)"
                        + " VALUES (:id, :group, :first, :last, :address, :email, :phone, :sortLast, :sortFirst,"
                        + " :version, :createdAt, :updatedAt, (SELECT id FROM app_user WHERE id = :by), :entry)",
                rows(groupId, rollbackEntry, restored));
        batch.batchUpdate(
                "UPDATE contact SET first_name = :first, last_name = :last, address = :address, email = :email,"
                        + " phone = :phone, sort_last = :sortLast, sort_first = :sortFirst, version = :version,"
                        + " created_at = :createdAt, updated_at = :updatedAt,"
                        + " updated_by = (SELECT id FROM app_user WHERE id = :by), reverted_entry_id = :entry"
                        + " WHERE group_id = :group AND id = :id",
                rows(groupId, rollbackEntry, updated));

        List<UUID> replaced = updated.stream().map(Target::contactId).toList();
        for (int from = 0; from < replaced.size(); from += CHUNK) {
            List<UUID> chunk = replaced.subList(from, Math.min(replaced.size(), from + CHUNK));
            jdbc.sql("DELETE FROM contact_attribute WHERE contact_id IN (:ids)")
                    .param("ids", chunk)
                    .update();
            jdbc.sql("DELETE FROM contact_tag WHERE contact_id IN (:ids)")
                    .param("ids", chunk)
                    .update();
        }
        List<Target> withChildren = new ArrayList<>(restored);
        withChildren.addAll(updated);
        insertChildren(withChildren);
    }

    /** Sprememba vsebine enega kontakta pri množičnem urejanju (ime se ne spreminja). */
    public record Change(UUID contactId, ContactState before, ContactState after) {}

    /**
     * Množično urejanje (research R-07): paketni {@code UPDATE contact} (vrednosti polj, {@code version + 1}, izvajalec,
     * {@code updated_at = now()}, brez oznake rollbacka); atributi in značke so zamenjani samo pri kontaktih, kjer so se
     * spremenili. Vrstice so že zaklenjene (R-03); vedno s pogojem {@code group_id}.
     */
    public void replaceContent(UUID groupId, long actor, List<Change> changes) {
        batch.batchUpdate(
                "UPDATE contact SET address = :address, email = :email, phone = :phone, version = version + 1,"
                        + " updated_by = :by, updated_at = now(), reverted_entry_id = NULL"
                        + " WHERE group_id = :group AND id = :id",
                changes.stream()
                        .map(c -> (SqlParameterSource) new MapSqlParameterSource()
                                .addValue("group", groupId)
                                .addValue("id", c.contactId())
                                .addValue("address", c.after().address())
                                .addValue("email", c.after().email())
                                .addValue("phone", c.after().phone())
                                .addValue("by", actor))
                        .toArray(SqlParameterSource[]::new));
        List<Target> withChildren = changes.stream()
                .filter(c -> !c.before().attributes().equals(c.after().attributes())
                        || !c.before().tags().equals(c.after().tags()))
                .map(c -> new Target(c.contactId(), c.after(), true))
                .toList();
        for (int from = 0; from < withChildren.size(); from += CHUNK) {
            List<UUID> chunk = withChildren.subList(from, Math.min(withChildren.size(), from + CHUNK)).stream()
                    .map(Target::contactId)
                    .toList();
            jdbc.sql("DELETE FROM contact_attribute WHERE contact_id IN (:ids)")
                    .param("ids", chunk)
                    .update();
            jdbc.sql("DELETE FROM contact_tag WHERE contact_id IN (:ids)")
                    .param("ids", chunk)
                    .update();
        }
        insertChildren(withChildren);
    }

    private static SqlParameterSource[] rows(UUID groupId, UUID entry, List<Target> targets) {
        return targets.stream()
                .map(t -> {
                    ContactState s = t.state();
                    return (SqlParameterSource) new MapSqlParameterSource()
                            .addValue("id", t.contactId())
                            .addValue("group", groupId)
                            .addValue("first", s.firstName())
                            .addValue("last", s.lastName())
                            .addValue("address", s.address())
                            .addValue("email", s.email())
                            .addValue("phone", s.phone())
                            .addValue("sortLast", sortKey(s.lastName()))
                            .addValue("sortFirst", sortKey(s.firstName()))
                            .addValue("version", s.version())
                            .addValue("createdAt", Timestamp.from(s.createdAt()))
                            .addValue("updatedAt", Timestamp.from(s.updatedAt()))
                            .addValue("by", s.updatedById())
                            .addValue("entry", entry);
                })
                .toArray(SqlParameterSource[]::new);
    }

    private void insertChildren(List<Target> targets) {
        List<SqlParameterSource> attributes = new ArrayList<>();
        List<SqlParameterSource> tags = new ArrayList<>();
        for (Target target : targets) {
            List<Attribute> attrs = target.state().attributes();
            for (int i = 0; i < attrs.size(); i++) {
                attributes.add(new MapSqlParameterSource()
                        .addValue("id", target.contactId())
                        .addValue("position", i)
                        .addValue("key", attrs.get(i).key())
                        .addValue(
                                "norm",
                                ContactInputParser.normalize(attrs.get(i).key()))
                        .addValue("value", attrs.get(i).value()));
            }
            List<String> names = target.state().tags();
            for (int i = 0; i < names.size(); i++) {
                tags.add(new MapSqlParameterSource()
                        .addValue("id", target.contactId())
                        .addValue("position", i)
                        .addValue("tag", names.get(i))
                        .addValue("norm", ContactInputParser.normalize(names.get(i))));
            }
        }
        batch.batchUpdate(
                "INSERT INTO contact_attribute (contact_id, position, key, key_norm, value)"
                        + " VALUES (:id, :position, :key, :norm, :value)",
                attributes.toArray(SqlParameterSource[]::new));
        batch.batchUpdate(
                "INSERT INTO contact_tag (contact_id, position, tag, tag_norm)"
                        + " VALUES (:id, :position, :tag, :norm)",
                tags.toArray(SqlParameterSource[]::new));
    }

    private static String sortKey(String name) {
        return name == null ? null : name.toLowerCase(Locale.ROOT);
    }

    private Map<UUID, List<Attribute>> attributes(List<UUID> ids) {
        Map<UUID, List<Attribute>> result = new LinkedHashMap<>();
        jdbc.sql("SELECT contact_id, key, value FROM contact_attribute WHERE contact_id IN (:ids)"
                        + " ORDER BY contact_id, position")
                .param("ids", ids)
                .query((ResultSet rs) -> {
                    while (rs.next()) {
                        result.computeIfAbsent(rs.getObject("contact_id", UUID.class), k -> new ArrayList<>())
                                .add(new Attribute(rs.getString("key"), rs.getString("value")));
                    }
                    return result;
                });
        return result;
    }

    private Map<UUID, List<String>> tags(List<UUID> ids) {
        Map<UUID, List<String>> result = new LinkedHashMap<>();
        jdbc.sql("SELECT contact_id, tag FROM contact_tag WHERE contact_id IN (:ids) ORDER BY contact_id, position")
                .param("ids", ids)
                .query((ResultSet rs) -> {
                    while (rs.next()) {
                        result.computeIfAbsent(rs.getObject("contact_id", UUID.class), k -> new ArrayList<>())
                                .add(rs.getString("tag"));
                    }
                    return result;
                });
        return result;
    }

    private static ContactState state(ResultSet rs, List<Attribute> attributes, List<String> tags) throws SQLException {
        return new ContactState(
                rs.getString("first_name"),
                rs.getString("last_name"),
                rs.getString("address"),
                rs.getString("email"),
                rs.getString("phone"),
                List.copyOf(attributes),
                List.copyOf(tags),
                rs.getLong("version"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getObject("updated_by", Long.class));
    }
}

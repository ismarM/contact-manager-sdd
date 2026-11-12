package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Branje za izvoz (010, research R-06): vrstice izbranih kontaktov v vrstnem redu seznama 008, njihovi atributi in
 * značke ter ključi stolpcev. Vsaka poizvedba kontakta ima pogoj {@code group_id} (konstitucija III).
 */
@Repository
class ExportRepository {

    /** Največ identitet v enem stavku pri atributih in značkah. */
    private static final int CHUNK = 5000;

    /** Kontakt iz baze brez atributov in značk. */
    record Contact(UUID id, String firstName, String lastName, String address, String email, String phone) {}

    /** Atribut kontakta z izvirnim zapisom ključa. */
    record Attribute(UUID contactId, String key, String keyNorm, String value) {}

    private final JdbcClient jdbc;

    ExportRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Obstoječi kontakti skupine iz {@code ids} v vrstnem redu {@link ContactSearch#orderBy}. */
    List<Contact> rows(UUID group, Collection<UUID> ids, ContactQuery order) {
        Map<String, Object> parameters = new LinkedHashMap<>();
        String orderBy = ContactSearch.orderBy(order, parameters);
        var statement = jdbc.sql("SELECT c.id, c.first_name, c.last_name, c.address, c.email, c.phone FROM contact c"
                        + " WHERE c.group_id = :group AND c.id IN (:ids) ORDER BY " + orderBy)
                .param("group", group)
                .param("ids", List.copyOf(ids));
        for (Map.Entry<String, Object> parameter : parameters.entrySet()) {
            statement = statement.param(parameter.getKey(), parameter.getValue());
        }
        return statement
                .query((rs, n) -> new Contact(
                        rs.getObject("id", UUID.class),
                        rs.getString("first_name"),
                        rs.getString("last_name"),
                        rs.getString("address"),
                        rs.getString("email"),
                        rs.getString("phone")))
                .list();
    }

    /** Atributi kontaktov po vrstnem redu zapisa (za prvi zapis ključa v datoteki). */
    List<Attribute> attributes(Collection<UUID> ids) {
        List<Attribute> all = new ArrayList<>();
        for (List<UUID> chunk : chunks(ids)) {
            all.addAll(jdbc.sql("SELECT contact_id, key, key_norm, value FROM contact_attribute"
                            + " WHERE contact_id IN (:ids) ORDER BY contact_id, position")
                    .param("ids", chunk)
                    .query((rs, n) -> new Attribute(
                            rs.getObject("contact_id", UUID.class),
                            rs.getString("key"),
                            rs.getString("key_norm"),
                            rs.getString("value")))
                    .list());
        }
        return all;
    }

    /** Značke po kontaktih, po slovenski abecedi ({@code sort_sl}). */
    Map<UUID, List<String>> tags(Collection<UUID> ids) {
        Map<UUID, List<String>> tags = new HashMap<>();
        for (List<UUID> chunk : chunks(ids)) {
            jdbc.sql("SELECT contact_id, tag FROM contact_tag WHERE contact_id IN (:ids)"
                            + " ORDER BY contact_id, tag_norm COLLATE sort_sl, tag_norm")
                    .param("ids", chunk)
                    .query((rs, n) -> Map.entry(rs.getObject("contact_id", UUID.class), rs.getString("tag")))
                    .list()
                    .forEach(e -> tags.computeIfAbsent(e.getKey(), k -> new ArrayList<>())
                            .add(e.getValue()));
        }
        return tags;
    }

    /**
     * Različni normalizirani ključi atributov kontaktov v slovenski abecedi, ne glede na velikost črk (D-63). Ena
     * poizvedba (največ 10 000 identitet, pod mejo parametrov), da je vrstni red skupen.
     */
    List<String> keyOrder(Collection<UUID> ids) {
        return jdbc.sql("SELECT key_norm FROM contact_attribute WHERE contact_id IN (:ids)"
                        + " GROUP BY key_norm ORDER BY key_norm COLLATE sort_sl, key_norm")
                .param("ids", List.copyOf(ids))
                .query(String.class)
                .list();
    }

    private static List<List<UUID>> chunks(Collection<UUID> ids) {
        List<UUID> list = List.copyOf(ids);
        List<List<UUID>> chunks = new ArrayList<>();
        for (int i = 0; i < list.size(); i += CHUNK) {
            chunks.add(list.subList(i, Math.min(list.size(), i + CHUNK)));
        }
        return chunks;
    }
}

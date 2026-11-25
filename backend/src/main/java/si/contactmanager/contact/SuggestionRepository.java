package si.contactmanager.contact;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.core.simple.JdbcClient.StatementSpec;
import org.springframework.stereotype.Repository;

/**
 * Predlogi ključev, vrednosti, podjetij, značk in držav skupine (docs/specs/013, research R-04). Vsaka poizvedba ima pogoj
 * {@code group_id}; vrstni red: predpona pred ujemanjem v sredini, nato število kontaktov, nato besedilo. Ujemanje
 * je brez razlike velikosti črk in strešic ({@code search_fold}, V8).
 */
@Repository
class SuggestionRepository {

    /** Največ predlogov (FR-013-09). */
    static final int LIMIT = 10;

    private static final String COLLATE = " COLLATE search_fold";

    private final JdbcClient jdbc;

    SuggestionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Ključi atributov v kanonični obliki po številu kontaktov; rezervirana imena so izločena. */
    List<Suggestion> keys(UUID group, String q) {
        List<Suggestion> items = aggregated("contact_attribute", "key", "key_norm", group, q, true);
        if (items.isEmpty()) {
            return items;
        }
        // Tip ključa v skupini (016); ključ brez vrstice je tipa OTHER.
        List<String> norms =
                items.stream().map(s -> ContactInputParser.normalize(s.text())).toList();
        java.util.Map<String, AttributeType> types = new java.util.HashMap<>();
        jdbc.sql("SELECT key_norm, type FROM attribute_key WHERE group_id = :group AND key_norm IN (:norms)")
                .param("group", group)
                .param("norms", norms)
                .query((rs, n) -> {
                    types.put(rs.getString("key_norm"), AttributeType.valueOf(rs.getString("type")));
                    return null;
                })
                .list();
        return items.stream()
                .map(s -> new Suggestion(
                        s.text(),
                        s.count(),
                        types.getOrDefault(ContactInputParser.normalize(s.text()), AttributeType.OTHER)))
                .toList();
    }

    /** Značke v kanonični obliki po številu kontaktov. */
    List<Suggestion> tags(UUID group, String q) {
        return aggregated("contact_tag", "tag", "tag_norm", group, q, false);
    }

    private List<Suggestion> aggregated(
            String table, String column, String normColumn, UUID group, String q, boolean skipReserved) {
        String match = q.isEmpty() ? "" : " WHERE strpos(k.text" + COLLATE + ", :q) > 0";
        String reserved = skipReserved ? " WHERE regexp_replace(s.norm, '\\s+', ' ', 'g') NOT IN (:reserved)" : "";
        // Zapis z največ kontakti je kanoničen; število je vsota čez vse zapise istega normaliziranega imena.
        String sql =
                "SELECT k.text, k.uses FROM (SELECT DISTINCT ON (s.norm) s.norm, s.spelling AS text, s.total AS uses"
                        + " FROM (SELECT t." + normColumn + " AS norm, t." + column + " AS spelling,"
                        + " count(*) AS own, sum(count(*)) OVER (PARTITION BY t." + normColumn + ") AS total,"
                        + " min(c.created_at) AS first_at FROM " + table + " t JOIN contact c ON c.id = t.contact_id"
                        + " WHERE c.group_id = :group GROUP BY t." + normColumn + ", t." + column + ") s" + reserved
                        + " ORDER BY s.norm, s.own DESC, s.first_at, s.spelling COLLATE \"C\") k" + match
                        + order("k.text", "k.uses", q);
        StatementSpec spec = jdbc.sql(sql).param("group", group).param("limit", LIMIT);
        if (!q.isEmpty()) {
            spec = spec.param("q", q);
        }
        if (skipReserved) {
            spec = spec.param("reserved", List.copyOf(AttributeKeys.ALL_RESERVED));
        }
        return spec.query((rs, n) -> new Suggestion(rs.getString("text"), rs.getLong("uses")))
                .list();
    }

    /** Vrednosti atributa z normaliziranim ključem {@code keyNorm}, po številu kontaktov. */
    List<Suggestion> values(UUID group, String keyNorm, String q) {
        String match = q.isEmpty() ? "" : " AND strpos(a.value" + COLLATE + ", :q) > 0";
        String sql = "SELECT a.value AS text, count(*) AS uses FROM contact_attribute a JOIN contact c"
                + " ON c.id = a.contact_id WHERE c.group_id = :group AND a.key_norm = :key" + match
                + " GROUP BY a.value" + order("a.value", "count(*)", q);
        StatementSpec spec =
                jdbc.sql(sql).param("group", group).param("key", keyNorm).param("limit", LIMIT);
        if (!q.isEmpty()) {
            spec = spec.param("q", q);
        }
        return spec.query((rs, n) -> new Suggestion(rs.getString("text"), rs.getLong("uses")))
                .list();
    }

    /** Podjetja kontaktov skupine po številu kontaktov. */
    List<Suggestion> companies(UUID group, String q) {
        String match = q.isEmpty() ? "" : " AND strpos(c.company" + COLLATE + ", :q) > 0";
        String sql = "SELECT c.company AS text, count(*) AS uses FROM contact c WHERE c.group_id = :group"
                + " AND c.company IS NOT NULL" + match + " GROUP BY c.company" + order("c.company", "count(*)", q);
        StatementSpec spec = jdbc.sql(sql).param("group", group).param("limit", LIMIT);
        if (!q.isEmpty()) {
            spec = spec.param("q", q);
        }
        return spec.query((rs, n) -> new Suggestion(rs.getString("text"), rs.getLong("uses")))
                .list();
    }

    /** Kode držav po številu kontaktov skupine. */
    List<Suggestion> countries(UUID group) {
        return jdbc.sql("SELECT c.country AS text, count(*) AS uses FROM contact c WHERE c.group_id = :group"
                        + " AND c.country IS NOT NULL GROUP BY c.country ORDER BY uses DESC, c.country LIMIT :limit")
                .param("group", group)
                .param("limit", LIMIT)
                .query((rs, n) -> new Suggestion(rs.getString("text"), rs.getLong("uses")))
                .list();
    }

    /** Vrstni red: predpona (ujemanje na začetku) pred ujemanjem v sredini, nato število, nato besedilo. */
    private static String order(String text, String uses, String q) {
        String prefix = q.isEmpty() ? "" : "(strpos(" + text + COLLATE + ", :q) = 1) DESC, ";
        return " ORDER BY " + prefix + uses + " DESC, " + text + " COLLATE \"C\" LIMIT :limit";
    }
}

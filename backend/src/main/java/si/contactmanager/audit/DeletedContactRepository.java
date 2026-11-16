package si.contactmanager.audit;

import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.core.simple.JdbcClient.StatementSpec;
import org.springframework.stereotype.Repository;
import si.contactmanager.audit.HistoryViews.DeletedItem;
import si.contactmanager.audit.HistoryViews.DeletedMergedInto;
import si.contactmanager.group.UserRef;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Izbrisani kontakti skupine, izpeljani iz sledi (015, research R-06): zadnja sprememba kontakta je odstranitev
 * ({@code after IS NULL}), kontakta ni v {@code contact} in novejše spremembe ni. Brez ločene hrambe.
 */
@Repository
class DeletedContactRepository {

    /** Filter stanja: vsi, obnovljivi ali združeni. */
    enum State {
        ALL,
        RESTORABLE,
        MERGED
    }

    record Filter(String query, State state) {}

    private static final String FROM =
            " FROM audit_entry e JOIN audit_change c ON c.entry_id = e.id AND c.after IS NULL"
                    + " LEFT JOIN app_user u ON u.id = e.actor_id"
                    + " LEFT JOIN LATERAL (SELECT k.contact_id, k.display_name FROM audit_change k"
                    + "   WHERE k.entry_id = e.id AND k.after IS NOT NULL AND e.action = 'MERGE'"
                    + "   ORDER BY k.position LIMIT 1) kept ON true"
                    + " WHERE e.group_id = :group"
                    + " AND NOT EXISTS (SELECT 1 FROM contact x WHERE x.group_id = :group AND x.id = c.contact_id)"
                    + " AND NOT EXISTS (SELECT 1 FROM audit_change c2 JOIN audit_entry e2 ON e2.id = c2.entry_id"
                    + "   WHERE c2.contact_id = c.contact_id AND e2.group_id = :group AND e2.seq > e.seq)";

    private final JdbcClient jdbc;
    private final JsonMapper json;

    DeletedContactRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    private static String where(Filter filter) {
        StringBuilder where = new StringBuilder();
        if (filter.state() == State.RESTORABLE) {
            where.append(" AND e.action <> 'MERGE'");
        } else if (filter.state() == State.MERGED) {
            where.append(" AND e.action = 'MERGE'");
        }
        if (!filter.query().isEmpty()) {
            where.append(
                    " AND strpos((coalesce(c.before->>'firstName', '') || ' ' || coalesce(c.before->>'lastName', '')"
                            + " || ' ' || coalesce(c.before->>'email', '') || ' ' || coalesce(c.before->>'company', ''))"
                            + " COLLATE search_fold, :query) > 0");
        }
        return where.toString();
    }

    private static StatementSpec bind(StatementSpec spec, UUID group, Filter filter) {
        StatementSpec bound = spec.param("group", group);
        return filter.query().isEmpty() ? bound : bound.param("query", filter.query());
    }

    long count(UUID group, Filter filter) {
        return bind(jdbc.sql("SELECT count(*)" + FROM + where(filter)), group, filter)
                .query(Long.class)
                .single();
    }

    /** Stran, najnovejša odstranitev prva. */
    List<DeletedItem> page(UUID group, Filter filter, int size, int page) {
        List<DeletedItem> items = new ArrayList<>();
        StatementSpec spec = jdbc.sql("SELECT c.contact_id, c.display_name, c.before::text AS before, e.id AS entry_id,"
                        + " e.created_at, e.action, u.name AS actor_name, u.email AS actor_email,"
                        + " kept.contact_id AS kept_id, kept.display_name AS kept_name,"
                        + " EXISTS (SELECT 1 FROM contact y WHERE y.group_id = :group AND y.id = kept.contact_id)"
                        + " AS kept_exists" + FROM + where(filter)
                        + " ORDER BY e.seq DESC LIMIT :size OFFSET :offset")
                .param("size", size)
                .param("offset", (long) page * size);
        bind(spec, group, filter).query((ResultSet rs) -> {
            while (rs.next()) {
                JsonNode before = json.readTree(rs.getString("before"));
                String action = rs.getString("action");
                boolean merged = "MERGE".equals(action);
                UUID keptId = rs.getObject("kept_id", UUID.class);
                String email = text(before, "email");
                String actorEmail = rs.getString("actor_email");
                items.add(new DeletedItem(
                        rs.getObject("contact_id", UUID.class),
                        rs.getString("display_name"),
                        email,
                        text(before, "company"),
                        rs.getTimestamp("created_at").toInstant(),
                        actorEmail == null ? null : new UserRef(rs.getString("actor_name"), actorEmail),
                        rs.getObject("entry_id", UUID.class),
                        merged ? "MERGED" : "ROLLBACK".equals(action) ? "ROLLBACK" : "DELETED",
                        !merged,
                        merged && keptId != null
                                ? new DeletedMergedInto(keptId, rs.getString("kept_name"), rs.getBoolean("kept_exists"))
                                : null));
            }
            return items;
        });
        return items;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }
}

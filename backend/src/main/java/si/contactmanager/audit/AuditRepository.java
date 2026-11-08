package si.contactmanager.audit;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.core.simple.JdbcClient.StatementSpec;
import org.springframework.stereotype.Repository;
import si.contactmanager.contact.ContactState;
import si.contactmanager.group.UserRef;
import tools.jackson.databind.json.JsonMapper;

/** Tabele {@code audit_entry}, {@code audit_change} in {@code audit_head} (data-model.md). Vsaka poizvedba ima {@code group_id}. */
@Repository
class AuditRepository {

    private static final String ENTRY_SELECT =
            "SELECT e.id, e.created_at, u.name AS actor_name, u.email AS actor_email, e.action, e.contact_count,"
                    + " e.contact_name, t.id AS target_id, t.created_at AS target_at, e.target_initial"
                    + " FROM audit_entry e LEFT JOIN app_user u ON u.id = e.actor_id"
                    + " LEFT JOIN audit_entry t ON t.id = e.target_entry_id";

    /** Filtri seznama: vrste dejanj in kontakt (oboje neobvezno). */
    record Filter(List<AuditAction> actions, UUID contact) {}

    private final JdbcClient jdbc;
    private final NamedParameterJdbcTemplate batch;
    private final JsonMapper json;

    AuditRepository(JdbcClient jdbc, NamedParameterJdbcTemplate batch, JsonMapper json) {
        this.jdbc = jdbc;
        this.batch = batch;
        this.json = json;
    }

    /**
     * Zapiše vnos s spremembami in posodobi glavo sledi (research R-02): glava zaklene vrstico do konca transakcije,
     * zato je vrstni red {@code seq} enak vrstnemu redu potrditev.
     */
    UUID insert(
            UUID group,
            long actor,
            AuditAction action,
            List<ContactChange> changes,
            UUID targetEntry,
            boolean targetInitial) {
        UUID id = jdbc.sql("SELECT uuidv7()").query(UUID.class).single();
        long seq = jdbc.sql("INSERT INTO audit_head (group_id, last_seq, last_entry_id) VALUES (:group, 1, :id)"
                        + " ON CONFLICT (group_id) DO UPDATE SET last_seq = audit_head.last_seq + 1,"
                        + " last_entry_id = EXCLUDED.last_entry_id RETURNING last_seq")
                .param("group", group)
                .param("id", id)
                .query(Long.class)
                .single();
        String name = changes.size() == 1 && action != AuditAction.ROLLBACK
                ? changes.get(0).displayName()
                : null;
        jdbc.sql("INSERT INTO audit_entry (id, group_id, seq, actor_id, action, contact_count, contact_name,"
                        + " target_entry_id, target_initial)"
                        + " VALUES (:id, :group, :seq, :actor, :action, :count, :name, :target, :initial)")
                .param("id", id)
                .param("group", group)
                .param("seq", seq)
                .param("actor", actor)
                .param("action", action.name())
                .param("count", changes.size())
                .param("name", name)
                .param("target", targetEntry)
                .param("initial", targetInitial)
                .update();
        SqlParameterSource[] rows = new SqlParameterSource[changes.size()];
        for (int i = 0; i < rows.length; i++) {
            ContactChange change = changes.get(i);
            rows[i] = new MapSqlParameterSource()
                    .addValue("entry", id)
                    .addValue("position", i)
                    .addValue("contact", change.contactId())
                    .addValue("name", change.displayName())
                    .addValue("before", write(change.before()))
                    .addValue("after", write(change.after()));
        }
        batch.batchUpdate(
                "INSERT INTO audit_change (entry_id, position, contact_id, display_name, before, after)"
                        + " VALUES (:entry, :position, :contact, :name, CAST(:before AS jsonb), CAST(:after AS jsonb))",
                rows);
        return id;
    }

    private static String where(Filter filter) {
        StringBuilder where = new StringBuilder(" WHERE e.group_id = :group");
        if (!filter.actions().isEmpty()) {
            where.append(" AND e.action IN (:actions)");
        }
        if (filter.contact() != null) {
            where.append(
                    " AND EXISTS (SELECT 1 FROM audit_change c WHERE c.entry_id = e.id AND c.contact_id = :contact)");
        }
        return where.toString();
    }

    private static StatementSpec bind(StatementSpec spec, UUID group, Filter filter) {
        StatementSpec bound = spec.param("group", group);
        if (!filter.actions().isEmpty()) {
            bound = bound.param(
                    "actions", filter.actions().stream().map(Enum::name).toList());
        }
        if (filter.contact() != null) {
            bound = bound.param("contact", filter.contact());
        }
        return bound;
    }

    long count(UUID group, Filter filter) {
        return bind(jdbc.sql("SELECT count(*) FROM audit_entry e" + where(filter)), group, filter)
                .query(Long.class)
                .single();
    }

    /** Stran vnosov, najnovejši (največji {@code seq}) prvi. */
    List<AuditEntry> page(UUID group, Filter filter, int size, int page) {
        StatementSpec spec = jdbc.sql(ENTRY_SELECT + where(filter) + " ORDER BY e.seq DESC LIMIT :size OFFSET :offset")
                .param("size", size)
                .param("offset", (long) page * size);
        return bind(spec, group, filter).query(AuditRepository::entry).list();
    }

    Optional<AuditEntry> find(UUID group, UUID id) {
        return jdbc.sql(ENTRY_SELECT + " WHERE e.group_id = :group AND e.id = :id")
                .param("group", group)
                .param("id", id)
                .query(AuditRepository::entry)
                .optional();
    }

    /** Najnovejši vnos celotne sledi (glava sledi); prazno, če sled nima vnosov. */
    Optional<UUID> latestEntryId(UUID group) {
        return jdbc.sql("SELECT last_entry_id FROM audit_head WHERE group_id = :group")
                .param("group", group)
                .query(UUID.class)
                .optional();
    }

    /** Ime kontakta iz njegove najnovejše spremembe v tej skupini; prazno, če sled kontakta nima vnosov. */
    Optional<String> latestDisplayName(UUID group, UUID contact) {
        return jdbc.sql("SELECT c.display_name FROM audit_change c JOIN audit_entry e ON e.id = c.entry_id"
                        + " WHERE e.group_id = :group AND c.contact_id = :contact ORDER BY e.seq DESC LIMIT 1")
                .param("group", group)
                .param("contact", contact)
                .query(String.class)
                .optional();
    }

    long countChanges(UUID entry) {
        return jdbc.sql("SELECT count(*) FROM audit_change WHERE entry_id = :entry")
                .param("entry", entry)
                .query(Long.class)
                .single();
    }

    /** Stran sprememb vnosa v vrstnem redu vnosa; polja so izpeljana iz stanj prej/potem. */
    List<ContactChangeView> changes(UUID entry, int size, int page) {
        List<ContactChangeView> views = new ArrayList<>();
        jdbc.sql("SELECT contact_id, display_name, before::text AS before, after::text AS after FROM audit_change"
                        + " WHERE entry_id = :entry ORDER BY position LIMIT :size OFFSET :offset")
                .param("entry", entry)
                .param("size", size)
                .param("offset", (long) page * size)
                .query((ResultSet rs) -> {
                    while (rs.next()) {
                        ContactState before = read(rs.getString("before"));
                        ContactState after = read(rs.getString("after"));
                        ContactChangeView.Kind kind = before == null
                                ? ContactChangeView.Kind.ADDED
                                : after == null ? ContactChangeView.Kind.REMOVED : ContactChangeView.Kind.CHANGED;
                        views.add(new ContactChangeView(
                                rs.getObject("contact_id", UUID.class),
                                rs.getString("display_name"),
                                kind,
                                ChangeDiff.fields(before, after)));
                    }
                    return views;
                });
        return views;
    }

    /** Zaklene vrstico skupine (izključi sočasna pisanja kontaktov in arhiviranje); vrne, ali je arhivirana. */
    Optional<Boolean> lockGroupArchived(UUID group) {
        return jdbc.sql("SELECT archived_at IS NOT NULL FROM contact_group WHERE id = :group FOR UPDATE")
                .param("group", group)
                .query(Boolean.class)
                .optional();
    }

    /** Zaklene glavo sledi in vrne najnovejši vnos; prazno, če sled nima vnosov. */
    Optional<UUID> lockHead(UUID group) {
        return jdbc.sql("SELECT last_entry_id FROM audit_head WHERE group_id = :group FOR UPDATE")
                .param("group", group)
                .query(UUID.class)
                .optional();
    }

    Optional<Long> seqOf(UUID group, UUID entry) {
        return jdbc.sql("SELECT seq FROM audit_entry WHERE group_id = :group AND id = :id")
                .param("group", group)
                .param("id", entry)
                .query(Long.class)
                .optional();
    }

    /**
     * Ciljno stanje po vnosu s {@code seq}: za vsak kontakt, ki ga je spremenil vnos z večjim {@code seq}, je to
     * {@code before} njegove prve takšne spremembe ({@code null} = kontakt takrat ni obstajal) – research R-04.
     */
    Map<UUID, ContactState> statesAfter(UUID group, long seq) {
        Map<UUID, ContactState> states = new LinkedHashMap<>();
        jdbc.sql("SELECT DISTINCT ON (c.contact_id) c.contact_id, c.before::text AS before FROM audit_change c"
                        + " JOIN audit_entry e ON e.id = c.entry_id WHERE e.group_id = :group AND e.seq > :seq"
                        + " ORDER BY c.contact_id, e.seq")
                .param("group", group)
                .param("seq", seq)
                .query((ResultSet rs) -> {
                    while (rs.next()) {
                        states.put(rs.getObject("contact_id", UUID.class), read(rs.getString("before")));
                    }
                    return states;
                });
        return states;
    }

    /** Največja verzija vsakega kontakta v stanjih sledi (FR-005-13). */
    Map<UUID, Long> maxVersions(UUID group, Collection<UUID> ids) {
        Map<UUID, Long> versions = new LinkedHashMap<>();
        List<UUID> all = new ArrayList<>(ids);
        for (int from = 0; from < all.size(); from += 5000) {
            List<UUID> chunk = all.subList(from, Math.min(all.size(), from + 5000));
            jdbc.sql("SELECT c.contact_id, max(greatest(coalesce((c.before->>'version')::bigint, -1),"
                            + " coalesce((c.after->>'version')::bigint, -1))) AS version FROM audit_change c"
                            + " JOIN audit_entry e ON e.id = c.entry_id"
                            + " WHERE e.group_id = :group AND c.contact_id IN (:ids) GROUP BY c.contact_id")
                    .param("group", group)
                    .param("ids", chunk)
                    .query((ResultSet rs) -> {
                        while (rs.next()) {
                            versions.put(rs.getObject("contact_id", UUID.class), rs.getLong("version"));
                        }
                        return versions;
                    });
        }
        return versions;
    }

    /** Podmnožica uporabnikov, ki še obstajajo. */
    Set<Long> existingUsers(Collection<Long> ids) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.sql("SELECT id FROM app_user WHERE id IN (:ids)")
                .param("ids", ids)
                .query(Long.class)
                .list());
    }

    private ContactState read(String text) {
        return text == null ? null : json.readValue(text, ContactState.class);
    }

    private String write(ContactState state) {
        return state == null ? null : json.writeValueAsString(state);
    }

    private static AuditEntry entry(ResultSet rs, int row) throws SQLException {
        String email = rs.getString("actor_email");
        UUID target = rs.getObject("target_id", UUID.class);
        return new AuditEntry(
                rs.getObject("id", UUID.class),
                rs.getTimestamp("created_at").toInstant(),
                email == null ? null : new UserRef(rs.getString("actor_name"), email),
                AuditAction.valueOf(rs.getString("action")),
                rs.getInt("contact_count"),
                rs.getString("contact_name"),
                target == null
                        ? null
                        : new AuditEntry.Target(
                                target, rs.getTimestamp("target_at").toInstant()),
                rs.getBoolean("target_initial"));
    }
}

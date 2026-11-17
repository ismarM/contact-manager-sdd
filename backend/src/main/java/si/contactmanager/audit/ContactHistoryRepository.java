package si.contactmanager.audit;

import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import si.contactmanager.audit.HistoryViews.HistoryEvent;
import si.contactmanager.audit.HistoryViews.MergedInto;
import si.contactmanager.audit.HistoryViews.Status;
import si.contactmanager.audit.HistoryViews.Version;
import si.contactmanager.contact.ContactState;
import si.contactmanager.group.UserRef;
import tools.jackson.databind.json.JsonMapper;

/**
 * Poizvedbe zgodovine in različic kontakta (015, research R-01, R-02): vse izpeljano iz {@code audit_change} /
 * {@code audit_entry}; vsaka poizvedba je omejena z {@code group_id} (izolacija).
 */
@Repository
class ContactHistoryRepository {

    /** Najnovejša sprememba kontakta v sledi. */
    record Latest(UUID entryId, long seq, String action, boolean removed, String displayName) {}

    /** Živ kontakt: ime in verzija. */
    record Live(String displayName, long version) {}

    private final JdbcClient jdbc;
    private final JsonMapper json;

    ContactHistoryRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    Optional<Live> live(UUID group, UUID contact) {
        return jdbc.sql("SELECT first_name, last_name, version FROM contact WHERE group_id = :group AND id = :id")
                .param("group", group)
                .param("id", contact)
                .query((rs, row) ->
                        new Live(name(rs.getString("first_name"), rs.getString("last_name")), rs.getLong("version")))
                .optional();
    }

    Optional<Latest> latest(UUID group, UUID contact) {
        return jdbc.sql("SELECT e.id, e.seq, e.action, c.after IS NULL AS removed, c.display_name FROM audit_change c"
                        + " JOIN audit_entry e ON e.id = c.entry_id WHERE e.group_id = :group AND c.contact_id = :id"
                        + " ORDER BY e.seq DESC LIMIT 1")
                .param("group", group)
                .param("id", contact)
                .query((rs, row) -> new Latest(
                        rs.getObject("id", UUID.class),
                        rs.getLong("seq"),
                        rs.getString("action"),
                        rs.getBoolean("removed"),
                        rs.getString("display_name")))
                .optional();
    }

    static Status status(Optional<Live> live, Optional<Latest> latest) {
        if (live.isPresent()) {
            return Status.ACTIVE;
        }
        return latest.filter(l -> "MERGE".equals(l.action())).isPresent() ? Status.MERGED : Status.DELETED;
    }

    /** Ali je kontakt obstajal pred prvo zabeleženo spremembo (njen {@code before} ni prazen). */
    boolean hasInitial(UUID group, UUID contact) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM (SELECT c.before FROM audit_change c JOIN audit_entry e"
                        + " ON e.id = c.entry_id WHERE e.group_id = :group AND c.contact_id = :id"
                        + " ORDER BY e.seq LIMIT 1) first WHERE first.before IS NOT NULL)")
                .param("group", group)
                .param("id", contact)
                .query(Boolean.class)
                .single();
    }

    long count(UUID group, UUID contact) {
        return jdbc.sql("SELECT count(*) FROM audit_change c JOIN audit_entry e ON e.id = c.entry_id"
                        + " WHERE e.group_id = :group AND c.contact_id = :id")
                .param("group", group)
                .param("id", contact)
                .query(Long.class)
                .single();
    }

    /** Stran dogodkov, najnovejši prvi. */
    List<HistoryEvent> page(UUID group, UUID contact, int size, int page) {
        List<HistoryEvent> events = new ArrayList<>();
        jdbc.sql("SELECT e.id, e.created_at, u.name AS actor_name, u.email AS actor_email, e.action, e.contact_count,"
                        + " c.display_name, c.before::text AS before, c.after::text AS after, t.id AS target_id,"
                        + " t.created_at AS target_at, e.target_initial, e.api_key_name, e.photo_change"
                        + " FROM audit_change c"
                        + " JOIN audit_entry e ON e.id = c.entry_id LEFT JOIN app_user u ON u.id = e.actor_id"
                        + " LEFT JOIN audit_entry t ON t.id = e.target_entry_id"
                        + " WHERE e.group_id = :group AND c.contact_id = :id ORDER BY e.seq DESC"
                        + " LIMIT :size OFFSET :offset")
                .param("group", group)
                .param("id", contact)
                .param("size", size)
                .param("offset", (long) page * size)
                .query((ResultSet rs) -> {
                    while (rs.next()) {
                        ContactState before = read(rs.getString("before"));
                        ContactState after = read(rs.getString("after"));
                        UUID entry = rs.getObject("id", UUID.class);
                        String action = rs.getString("action");
                        ContactChangeView.Kind kind = before == null
                                ? ContactChangeView.Kind.ADDED
                                : after == null ? ContactChangeView.Kind.REMOVED : ContactChangeView.Kind.CHANGED;
                        UUID target = rs.getObject("target_id", UUID.class);
                        events.add(new HistoryEvent(
                                entry,
                                rs.getTimestamp("created_at").toInstant(),
                                user(rs.getString("actor_name"), rs.getString("actor_email")),
                                action,
                                kind,
                                rs.getInt("contact_count"),
                                rs.getString("display_name"),
                                ChangeDiff.fields(before, after),
                                after != null,
                                target == null
                                        ? null
                                        : new AuditEntry.Target(
                                                target,
                                                rs.getTimestamp("target_at").toInstant()),
                                rs.getBoolean("target_initial"),
                                kind == ContactChangeView.Kind.REMOVED && "MERGE".equals(action)
                                        ? mergedInto(entry).orElse(null)
                                        : null,
                                rs.getString("api_key_name"),
                                rs.getString("photo_change") == null
                                        ? null
                                        : PhotoChange.valueOf(rs.getString("photo_change"))));
                    }
                    return events;
                });
        return events;
    }

    /** Ohranjeni kontakt združitve: druga sprememba istega vnosa z neprazno stanjem potem. */
    Optional<MergedInto> mergedInto(UUID entry) {
        return jdbc.sql("SELECT contact_id, display_name FROM audit_change WHERE entry_id = :entry"
                        + " AND after IS NOT NULL ORDER BY position LIMIT 1")
                .param("entry", entry)
                .query((rs, row) ->
                        new MergedInto(rs.getObject("contact_id", UUID.class), rs.getString("display_name")))
                .optional();
    }

    /** Različica po vnosu: {@code after} spremembe kontakta v tem vnosu te skupine. */
    Optional<Version> byEntry(UUID group, UUID contact, UUID entry) {
        return jdbc.sql("SELECT e.created_at, u.name AS actor_name, u.email AS actor_email, e.action,"
                        + " c.after::text AS after FROM audit_change c JOIN audit_entry e ON e.id = c.entry_id"
                        + " LEFT JOIN app_user u ON u.id = e.actor_id WHERE e.group_id = :group"
                        + " AND c.contact_id = :id AND e.id = :entry AND c.after IS NOT NULL")
                .param("group", group)
                .param("id", contact)
                .param("entry", entry)
                .query((rs, row) -> new Version(
                        entry.toString(),
                        rs.getTimestamp("created_at").toInstant(),
                        user(rs.getString("actor_name"), rs.getString("actor_email")),
                        rs.getString("action"),
                        HistoryViews.StateView.of(read(rs.getString("after")))))
                .optional();
    }

    /** Izhodiščna različica: {@code before} prve zabeležene spremembe, če ni prazen. */
    Optional<Version> initial(UUID group, UUID contact) {
        return jdbc.sql("SELECT c.before::text AS before FROM audit_change c JOIN audit_entry e ON e.id = c.entry_id"
                        + " WHERE e.group_id = :group AND c.contact_id = :id ORDER BY e.seq LIMIT 1")
                .param("group", group)
                .param("id", contact)
                .query((rs, row) -> rs.getString("before"))
                .optional()
                .filter(text -> text != null)
                .map(text -> new Version("initial", null, null, null, HistoryViews.StateView.of(read(text))));
    }

    /** Polno stanje (z metapodatki) različice po vnosu ali izhodiščne različice; prazno, če različice ni. */
    Optional<ContactState> fullState(UUID group, UUID contact, String ref) {
        if ("initial".equals(ref)) {
            return jdbc.sql("SELECT c.before::text AS state FROM audit_change c JOIN audit_entry e"
                            + " ON e.id = c.entry_id WHERE e.group_id = :group AND c.contact_id = :id"
                            + " ORDER BY e.seq LIMIT 1")
                    .param("group", group)
                    .param("id", contact)
                    .query((rs, row) -> rs.getString("state"))
                    .optional()
                    .filter(text -> text != null)
                    .map(this::read);
        }
        UUID entry;
        try {
            entry = UUID.fromString(ref);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT c.after::text AS state FROM audit_change c JOIN audit_entry e ON e.id = c.entry_id"
                        + " WHERE e.group_id = :group AND c.contact_id = :id AND e.id = :entry AND c.after IS NOT NULL")
                .param("group", group)
                .param("id", contact)
                .param("entry", entry)
                .query((rs, row) -> rs.getString("state"))
                .optional()
                .map(this::read);
    }

    /** Uporabnik zadnje spremembe živega kontakta ({@code null}: izbrisan uporabnik). */
    UserRef userRef(Long userId) {
        if (userId == null) {
            return null;
        }
        return jdbc.sql("SELECT name, email FROM app_user WHERE id = :id")
                .param("id", userId)
                .query((rs, row) -> new UserRef(rs.getString("name"), rs.getString("email")))
                .optional()
                .orElse(null);
    }

    ContactState read(String text) {
        return text == null ? null : json.readValue(text, ContactState.class);
    }

    private static UserRef user(String name, String email) {
        return email == null ? null : new UserRef(name, email);
    }

    static String name(String first, String last) {
        if (first == null) {
            return last;
        }
        return last == null ? first : first + " " + last;
    }
}

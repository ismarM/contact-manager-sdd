package si.contactmanager.carddav;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Branje za CardDAV (014 research R-08): skupine, katerih član je uporabnik (tudi arhivirane), kontakti skupine in
 * spremembe od zaporedne številke sledi. Vsaka poizvedba ima pogoj članstva ali {@code group_id}; članstvo se preveri ob
 * vsakem zahtevku.
 */
@Repository
class DavRepository {

    /** Imenik: skupina z naslovom, verzijo in zadnjo številko sledi ({@code 0} brez sledi). */
    record Book(UUID id, String title, long version, long lastSeq) {}

    /** Vizitka v imeniku: id, verzija in čas zadnje spremembe (za ETag). */
    record Card(UUID id, long version, Instant updatedAt) {}

    private static final String BOOK_SELECT = "SELECT g.id, g.title, g.version, coalesce(h.last_seq, 0) AS last_seq"
            + " FROM group_member m JOIN contact_group g ON g.id = m.group_id"
            + " LEFT JOIN audit_head h ON h.group_id = g.id WHERE m.user_id = :user";

    private final JdbcClient jdbc;

    DavRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    List<Book> books(long user) {
        return jdbc.sql(BOOK_SELECT + " ORDER BY g.title, g.id")
                .param("user", user)
                .query((rs, row) -> new Book(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getLong("version"),
                        rs.getLong("last_seq")))
                .list();
    }

    Optional<Book> book(long user, UUID group) {
        return jdbc.sql(BOOK_SELECT + " AND g.id = :group")
                .param("user", user)
                .param("group", group)
                .query((rs, row) -> new Book(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getLong("version"),
                        rs.getLong("last_seq")))
                .optional();
    }

    List<Card> cards(UUID group) {
        return jdbc.sql("SELECT id, version, updated_at FROM contact WHERE group_id = :group ORDER BY id")
                .param("group", group)
                .query((rs, row) -> new Card(
                        rs.getObject("id", UUID.class),
                        rs.getLong("version"),
                        rs.getTimestamp("updated_at").toInstant()))
                .list();
    }

    List<Card> cards(UUID group, Set<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("SELECT id, version, updated_at FROM contact WHERE group_id = :group AND id IN (:ids)"
                        + " ORDER BY id")
                .param("group", group)
                .param("ids", List.copyOf(ids))
                .query((rs, row) -> new Card(
                        rs.getObject("id", UUID.class),
                        rs.getLong("version"),
                        rs.getTimestamp("updated_at").toInstant()))
                .list();
    }

    /**
     * Kontakti, ki so se spremenili od številke {@code seq} (indeks {@code audit_entry_group_seq} in predpona primarnega
     * ključa {@code audit_change}).
     */
    Set<UUID> changedSince(UUID group, long seq) {
        return new LinkedHashSet<>(jdbc.sql("SELECT DISTINCT ch.contact_id FROM audit_entry e"
                        + " JOIN audit_change ch ON ch.entry_id = e.id WHERE e.group_id = :group AND e.seq > :seq")
                .param("group", group)
                .param("seq", seq)
                .query(UUID.class)
                .list());
    }
}

package si.contactmanager.image;

import java.sql.ResultSet;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link ImageStore} v tabelah {@code image} in {@code image_variant} (data-model.md). Pogoj lastnika vedno vsebuje
 * {@code user_id} oziroma {@code group_id}; slika izbrisanega (odklopljenega) kontakta se ne bere.
 */
@Repository
class PostgresImageStore implements ImageStore {

    private static final String UPSERT_TAIL =
            " DO UPDATE SET revision = image.revision + 1, updated_at = now()" + " RETURNING id, revision";

    private final JdbcClient jdbc;

    PostgresImageStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private record Saved(UUID id, long revision) {}

    @Override
    @Transactional
    public long put(Owner owner, ProcessedImage image) {
        JdbcClient.StatementSpec upsert = switch (owner.kind()) {
            case USER ->
                jdbc.sql("INSERT INTO image (kind, user_id) VALUES ('USER', :user)"
                                + " ON CONFLICT (user_id) WHERE kind = 'USER'" + UPSERT_TAIL)
                        .param("user", owner.userId());
            case GROUP ->
                jdbc.sql("INSERT INTO image (kind, group_id) VALUES ('GROUP', :group)"
                                + " ON CONFLICT (group_id) WHERE kind = 'GROUP'" + UPSERT_TAIL)
                        .param("group", owner.groupId());
            case CONTACT ->
                jdbc.sql("INSERT INTO image (kind, group_id, contact_id) VALUES ('CONTACT', :group, :contact)"
                                + " ON CONFLICT (group_id, contact_id) WHERE kind = 'CONTACT'" + UPSERT_TAIL)
                        .param("group", owner.groupId())
                        .param("contact", owner.contactId());
        };
        // Vrstica je zaklenjena do konca transakcije: sočasni zamenjavi se izvedeta druga za drugo.
        Saved saved = upsert.query((rs, n) -> new Saved(rs.getObject("id", UUID.class), rs.getLong("revision")))
                .single();
        jdbc.sql("DELETE FROM image_variant WHERE image_id = :id")
                .param("id", saved.id())
                .update();
        for (ProcessedImage.Variant variant : image.variants()) {
            jdbc.sql("INSERT INTO image_variant (image_id, size, content_type, data)"
                            + " VALUES (:id, :size, :type, :data)")
                    .param("id", saved.id())
                    .param("size", (short) variant.size())
                    .param("type", variant.contentType())
                    .param("data", variant.data())
                    .update();
        }
        return saved.revision();
    }

    @Override
    public Optional<StoredImage> get(Owner owner, int size) {
        return bind(
                        jdbc.sql("SELECT i.revision, v.size, v.content_type, v.data FROM image i"
                                + " JOIN image_variant v ON v.image_id = i.id WHERE " + ownerWhere(owner)
                                + " AND v.size = (SELECT max(m.size) FROM image_variant m"
                                + " WHERE m.image_id = i.id AND m.size <= :size)"),
                        owner)
                .param("size", (short) size)
                .query((rs, n) -> new StoredImage(
                        rs.getLong("revision"), rs.getInt("size"), rs.getString("content_type"), rs.getBytes("data")))
                .optional();
    }

    @Override
    public Optional<Long> revision(Owner owner) {
        return bind(jdbc.sql("SELECT i.revision FROM image i WHERE " + ownerWhere(owner)), owner)
                .query(Long.class)
                .optional();
    }

    @Override
    @Transactional
    public boolean delete(Owner owner) {
        // Tudi odklopljena slika kontakta se izbriše (npr. ob združevanju); pogoj ostane vezan na skupino.
        return bind(jdbc.sql("DELETE FROM image i WHERE " + ownerWhereAnyState(owner)), owner)
                        .update()
                > 0;
    }

    @Override
    @Transactional
    public void reassign(Owner from, Owner to) {
        if (from.kind() != Owner.Kind.CONTACT || to.kind() != Owner.Kind.CONTACT) {
            throw new IllegalArgumentException("preusmeritev je mogoča samo med kontakti");
        }
        jdbc.sql("UPDATE image SET contact_id = :to, revision = revision + 1, updated_at = now()"
                        + " WHERE kind = 'CONTACT' AND group_id = :group AND contact_id = :from")
                .param("to", to.contactId())
                .param("from", from.contactId())
                .param("group", from.groupId())
                .update();
    }

    @Override
    public Map<UUID, Long> contactRevisions(UUID group, Collection<UUID> contactIds) {
        Map<UUID, Long> revisions = new HashMap<>();
        if (contactIds.isEmpty()) {
            return revisions;
        }
        jdbc.sql("SELECT i.contact_id, i.revision FROM image i WHERE i.kind = 'CONTACT' AND i.group_id = :group"
                        + " AND i.contact_id IN (:ids) AND i.detached_at IS NULL")
                .param("group", group)
                .param("ids", contactIds)
                .query((ResultSet rs) -> {
                    while (rs.next()) {
                        revisions.put(rs.getObject("contact_id", UUID.class), rs.getLong("revision"));
                    }
                    return revisions;
                });
        return revisions;
    }

    @Override
    @Transactional
    public void mergeInto(UUID group, UUID keeper, List<UUID> losers) {
        if (losers.isEmpty()) {
            return;
        }
        List<UUID> withImage = jdbc.sql("SELECT contact_id FROM image WHERE kind = 'CONTACT' AND group_id = :group"
                        + " AND contact_id IN (:ids)")
                .param("group", group)
                .param("ids", Stream.concat(Stream.of(keeper), losers.stream()).toList())
                .query(UUID.class)
                .list();
        UUID adopted = null;
        if (!withImage.contains(keeper)) {
            adopted = losers.stream().filter(withImage::contains).findFirst().orElse(null);
        }
        if (adopted != null) {
            reassign(Owner.contact(group, adopted), Owner.contact(group, keeper));
        }
        for (UUID loser : losers) {
            if (!loser.equals(adopted)) {
                delete(Owner.contact(group, loser));
            }
        }
    }

    private static String ownerWhere(Owner owner) {
        return ownerWhereAnyState(owner) + (owner.kind() == Owner.Kind.CONTACT ? " AND i.detached_at IS NULL" : "");
    }

    private static String ownerWhereAnyState(Owner owner) {
        return switch (owner.kind()) {
            case USER -> "i.kind = 'USER' AND i.user_id = :user";
            case GROUP -> "i.kind = 'GROUP' AND i.group_id = :group";
            case CONTACT -> "i.kind = 'CONTACT' AND i.group_id = :group AND i.contact_id = :contact";
        };
    }

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec spec, Owner owner) {
        return switch (owner.kind()) {
            case USER -> spec.param("user", owner.userId());
            case GROUP -> spec.param("group", owner.groupId());
            case CONTACT -> spec.param("group", owner.groupId()).param("contact", owner.contactId());
        };
    }
}

package si.contactmanager.contact;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Tabela {@code attribute_key}: tip ključa atributa v skupini (016, research R-01). Vsaka poizvedba ima
 * {@code group_id} (izolacija skupin). Zaklepanje: urejanje kontakta drži {@code FOR SHARE} na vrstici ključa,
 * sprememba tipa {@code FOR UPDATE}; zato sta urejanje in sprememba tipa serializirana. Vsi klici razen
 * {@link #find} zahtevajo obdajajočo transakcijo (zaklep velja do njenega konca).
 */
@Repository
class AttributeKeyRepository {

    /** Vrstica ključa: tip in verzija (verzija se spremeni samo ob spremembi tipa). */
    record Row(String keyNorm, AttributeType type, long version) {}

    private final JdbcClient jdbc;

    AttributeKeyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Vrstica ključa brez zaklepa (branje, seznami). */
    Optional<Row> find(UUID group, String keyNorm) {
        return jdbc.sql("SELECT key_norm, type, version FROM attribute_key WHERE group_id = :group AND key_norm = :key")
                .param("group", group)
                .param("key", keyNorm)
                .query(AttributeKeyRepository::row)
                .optional();
    }

    /** Vrstica ključa z zaklepom {@code FOR SHARE} do konca transakcije (urejanje kontakta). */
    Optional<Row> lockForShare(UUID group, String keyNorm) {
        return jdbc.sql("SELECT key_norm, type, version FROM attribute_key"
                        + " WHERE group_id = :group AND key_norm = :key FOR SHARE")
                .param("group", group)
                .param("key", keyNorm)
                .query(AttributeKeyRepository::row)
                .optional();
    }

    /** Vrstica ključa z zaklepom {@code FOR UPDATE} do konca transakcije (sprememba tipa). */
    Optional<Row> lockForUpdate(UUID group, String keyNorm) {
        return jdbc.sql("SELECT key_norm, type, version FROM attribute_key"
                        + " WHERE group_id = :group AND key_norm = :key FOR UPDATE")
                .param("group", group)
                .param("key", keyNorm)
                .query(AttributeKeyRepository::row)
                .optional();
    }

    /**
     * Zagotovi vrstico ključa z zahtevanim tipom in vrne <b>veljavni</b> tip ključa (zaklenjen {@code FOR SHARE}).
     * Nov ključ dobi zahtevani tip; ključ brez kontaktov je prost in prevzame zahtevani tip (verzija se poveča); ključ
     * v uporabi obdrži svoj tip – kličoči primerja vrnjeni tip z zahtevanim (drugačen → {@code INVALID_VALUE}).
     * Dva sočasna nova ključa z različnima tipoma: prvi vstavek zmaga, drugi počaka na potrditev in vidi njegov tip.
     */
    AttributeType ensure(UUID group, String keyNorm, AttributeType requested) {
        jdbc.sql("INSERT INTO attribute_key (group_id, key_norm, type) VALUES (:group, :key, :type)"
                        + " ON CONFLICT (group_id, key_norm) DO NOTHING")
                .param("group", group)
                .param("key", keyNorm)
                .param("type", requested.name())
                .update();
        // Prost ključ (nobenega kontakta) lahko dobi nov tip; en sam stavek, da zaklep ni nadgrajen iz FOR SHARE.
        jdbc.sql("UPDATE attribute_key SET type = :type, version = version + 1"
                        + " WHERE group_id = :group AND key_norm = :key AND type <> :type"
                        + " AND NOT EXISTS (SELECT 1 FROM contact_attribute a JOIN contact c ON c.id = a.contact_id"
                        + " WHERE c.group_id = :group AND a.key_norm = :key)")
                .param("group", group)
                .param("key", keyNorm)
                .param("type", requested.name())
                .update();
        return lockForShare(group, keyNorm).orElseThrow().type();
    }

    /** Število kontaktov skupine, ki imajo ključ. */
    long contactCount(UUID group, String keyNorm) {
        return jdbc.sql("SELECT count(*) FROM contact_attribute a JOIN contact c ON c.id = a.contact_id"
                        + " WHERE c.group_id = :group AND a.key_norm = :key")
                .param("group", group)
                .param("key", keyNorm)
                .query(Long.class)
                .single();
    }

    /** Ključ je prost, kadar ga ne uporablja noben kontakt skupine (tip se ob ponovni uporabi izbere znova). */
    boolean isFree(UUID group, String keyNorm) {
        return contactCount(group, keyNorm) == 0;
    }

    /** Nastavi tip in poveča verzijo ključa (klic pod {@link #lockForUpdate}); vrne novo verzijo. */
    long setType(UUID group, String keyNorm, AttributeType type) {
        return jdbc.sql("UPDATE attribute_key SET type = :type, version = version + 1"
                        + " WHERE group_id = :group AND key_norm = :key RETURNING version")
                .param("group", group)
                .param("key", keyNorm)
                .param("type", type.name())
                .query(Long.class)
                .single();
    }

    /** Vrstica ključa za kontakt: identiteta, država, ime za razvrščanje in prikaz, vrednost (016, sprememba tipa). */
    record Value(UUID contactId, String firstName, String lastName, String country, String value) {}

    /**
     * Zagotovi vrstico ključa tipa {@code OTHER}, če je ključ v uporabi, pa vrstice še nima (ključi, ki so nastali pred
     * V13 ali po poteh brez razreševanja tipov); brez zaklepa.
     */
    void register(UUID group, String keyNorm) {
        jdbc.sql("INSERT INTO attribute_key (group_id, key_norm) VALUES (:group, :key)"
                        + " ON CONFLICT (group_id, key_norm) DO NOTHING")
                .param("group", group)
                .param("key", keyNorm)
                .update();
    }

    /** Vrednosti ključa vseh kontaktov skupine, po imenu kontakta (slovenska abeceda), nato identiteti. */
    List<Value> values(UUID group, String keyNorm) {
        return jdbc.sql("SELECT c.id, c.first_name, c.last_name, c.country, a.value"
                        + " FROM contact_attribute a JOIN contact c ON c.id = a.contact_id"
                        + " WHERE c.group_id = :group AND a.key_norm = :key"
                        + " ORDER BY c.sort_last COLLATE sort_sl NULLS LAST, c.sort_first COLLATE sort_sl NULLS LAST,"
                        + " c.id")
                .param("group", group)
                .param("key", keyNorm)
                .query((rs, n) -> new Value(
                        rs.getObject("id", UUID.class),
                        rs.getString("first_name"),
                        rs.getString("last_name"),
                        rs.getString("country"),
                        rs.getString("value")))
                .list();
    }

    /** Nova vrednost ključa kontakta (klic pod zaklepom ključa). */
    void updateValue(UUID contactId, String keyNorm, String value) {
        jdbc.sql("UPDATE contact_attribute SET value = :value WHERE contact_id = :id AND key_norm = :key")
                .param("value", value)
                .param("id", contactId)
                .param("key", keyNorm)
                .update();
    }

    /** Nova verzija kontaktov (sprememba tipa ključa spremeni njihovo stanje), izvajalec in čas; brez oznake rollbacka. */
    void touch(UUID group, java.util.Collection<UUID> contactIds, long user) {
        List<UUID> all = List.copyOf(contactIds);
        for (int from = 0; from < all.size(); from += 5000) {
            jdbc.sql("UPDATE contact SET version = version + 1, updated_by = :user, updated_at = now(),"
                            + " reverted_entry_id = NULL WHERE group_id = :group AND id IN (:ids)")
                    .param("user", user)
                    .param("group", group)
                    .param("ids", all.subList(from, Math.min(all.size(), from + 5000)))
                    .update();
        }
    }

    /** Ključi skupine v uporabi: kanonični zapis (najpogostejši), število kontaktov, tip in verzija. */
    record Listed(String key, String keyNorm, long contactCount, AttributeType type, long version) {}

    private static final String LISTED =
            "FROM (SELECT DISTINCT ON (x.norm) x.norm AS key_norm, x.spelling, x.total AS uses"
                    + " FROM (SELECT a.key_norm AS norm, a.key AS spelling, count(*) AS own,"
                    + " sum(count(*)) OVER (PARTITION BY a.key_norm) AS total, min(c.created_at) AS first_at"
                    + " FROM contact_attribute a JOIN contact c ON c.id = a.contact_id WHERE c.group_id = :group"
                    + " GROUP BY a.key_norm, a.key) x"
                    + " ORDER BY x.norm, x.own DESC, x.first_at, x.spelling COLLATE \"C\") s"
                    + " LEFT JOIN attribute_key k ON k.group_id = :group AND k.key_norm = s.key_norm";

    private static String filter(String q) {
        return q.isEmpty() ? "" : " WHERE strpos(s.spelling COLLATE search_fold, :q) > 0";
    }

    /** Stran ključev v uporabi: natančno ujemanje s {@code q} prvo, nato po ključu (slovenska abeceda). */
    List<Listed> list(UUID group, String q, int page, int size) {
        JdbcClient.StatementSpec spec = jdbc.sql("SELECT s.spelling, s.key_norm, s.uses, k.type, k.version " + LISTED
                        + filter(q) + " ORDER BY " + (q.isEmpty() ? "" : "(s.spelling COLLATE search_fold = :q) DESC, ")
                        + "s.key_norm COLLATE sort_sl, s.key_norm LIMIT :size OFFSET :offset")
                .param("group", group)
                .param("size", size)
                .param("offset", (long) page * size);
        if (!q.isEmpty()) {
            spec = spec.param("q", q);
        }
        return spec.query((rs, n) -> new Listed(
                        rs.getString("spelling"),
                        rs.getString("key_norm"),
                        rs.getLong("uses"),
                        rs.getString("type") == null
                                ? AttributeType.OTHER
                                : AttributeType.valueOf(rs.getString("type")),
                        rs.getLong("version")))
                .list();
    }

    long listCount(UUID group, String q) {
        JdbcClient.StatementSpec spec =
                jdbc.sql("SELECT count(*) " + LISTED + filter(q)).param("group", group);
        if (!q.isEmpty()) {
            spec = spec.param("q", q);
        }
        return spec.query(Long.class).single();
    }

    private static Row row(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new Row(rs.getString("key_norm"), AttributeType.valueOf(rs.getString("type")), rs.getLong("version"));
    }
}

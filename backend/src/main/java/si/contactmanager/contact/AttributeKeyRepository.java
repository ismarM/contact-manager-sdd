package si.contactmanager.contact;

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

    private static Row row(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new Row(rs.getString("key_norm"), AttributeType.valueOf(rs.getString("type")), rs.getLong("version"));
    }
}

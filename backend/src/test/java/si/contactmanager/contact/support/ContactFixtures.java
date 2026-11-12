package si.contactmanager.contact.support;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Priprava kontaktov neposredno v testni bazi (plan.md – tasks T002): ključi razvrščanja in normalizirani stolpci so
 * izračunani enako kot v produkcijski kodi (research R-02, R-03).
 */
public final class ContactFixtures {

    private final JdbcTemplate jdbc;

    public ContactFixtures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static String key(String value) {
        return value == null ? null : value.toLowerCase(Locale.ROOT);
    }

    /** Kontakt z imenom in priimkom (eden je lahko {@code null}); izvajalec spremembe je {@code userId}. */
    public UUID insert(UUID group, long userId, String firstName, String lastName) {
        return insert(group, userId, firstName, lastName, null, null, null);
    }

    public UUID insert(
            UUID group, long userId, String firstName, String lastName, String email, String phone, String address) {
        return jdbc.queryForObject(
                "insert into contact (group_id, first_name, last_name, email, phone, address, sort_first, sort_last,"
                        + " updated_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                UUID.class,
                group,
                firstName,
                lastName,
                email,
                phone,
                address,
                key(firstName),
                key(lastName),
                userId);
    }

    public void addAttribute(UUID contact, int position, String key, String value) {
        jdbc.update(
                "insert into contact_attribute (contact_id, position, key, key_norm, value) values (?, ?, ?, ?, ?)",
                contact,
                position,
                key,
                key(key),
                value);
    }

    public void addTag(UUID contact, int position, String tag) {
        jdbc.update(
                "insert into contact_tag (contact_id, position, tag, tag_norm) values (?, ?, ?, ?)",
                contact,
                position,
                tag,
                key(tag));
    }

    /**
     * {@code count} kontaktov »Ime 00001 Priimek 00001« … z enakim časom ustvarjanja (vrstni red določajo imena); vrne
     * id-je po vrstnem redu.
     */
    public List<UUID> insertMany(UUID group, long userId, int count) {
        jdbc.update(
                "insert into contact (group_id, first_name, last_name, sort_first, sort_last, updated_by)"
                        + " select ?, 'Ime ' || lpad(n::text, 5, '0'), 'Priimek ' || lpad(n::text, 5, '0'),"
                        + " 'ime ' || lpad(n::text, 5, '0'), 'priimek ' || lpad(n::text, 5, '0'), ?"
                        + " from generate_series(1, ?) n",
                group,
                userId,
                count);
        return jdbc.queryForList("select id from contact where group_id = ? order by sort_last, id", UUID.class, group);
    }

    /** Dodatni atributi in značke za več kontaktov naenkrat; vrstni red parametrov = vrstni red vnosa. */
    public void addTags(UUID contact, String... tags) {
        for (int i = 0; i < tags.length; i++) {
            addTag(contact, i, tags[i]);
        }
    }

    /**
     * {@code count} kontaktov iz <b>deterministične</b> porazdelitve (brez {@code random()}) za meritev SC-001 in
     * paginacije: 10 imen, 17 priimkov s šumniki, e-naslovi na 3 domenah (vsak tretji na {@code feri.si}), telefon
     * »041 NNNNNN«; vsak tretji ima atribut {@code kompetenca = web dev N}, vsak drugi značko {@code vip}, vsak peti
     * {@code konferenca2025}. Enak čas ustvarjanja (vrstni red pri enakih ključih določa id).
     */
    public void insertDistribution(UUID group, long userId, int count) {
        jdbc.update(
                "insert into contact (group_id, first_name, last_name, email, phone, sort_first, sort_last, updated_by)"
                        + " select ?, f, l, 'u' || n || '@' || d, '041 ' || lpad(n::text, 6, '0'), lower(f), lower(l), ?"
                        + " from (select n,"
                        + " (array['Ana','Bojan','Cene','Dana','Eva','Fani','Gaja','Hana','Ivan','Jure'])[1 + n % 10] f,"
                        + " (array['Novak','Čeh','Žagar','Šuligoj','Zupančič','Kralj','Cene','Horvat','Kovač','Krajnc',"
                        + "'Zupan','Potočnik','Mlakar','Vidmar','Golob','Turk','Božič'])[1 + n % 17] l,"
                        + " (array['feri.si','primer.si','test.si'])[1 + n % 3] d"
                        + " from generate_series(1, ?) n) s",
                group, userId, count);
        jdbc.update(
                "insert into contact_attribute (contact_id, position, key, key_norm, value)"
                        + " select c.id, 0, 'kompetenca', 'kompetenca', 'web dev ' || substr(c.phone, 5)"
                        + " from contact c where c.group_id = ? and right(c.phone, 6)::int % 3 = 0",
                group);
        jdbc.update(
                "insert into contact_tag (contact_id, position, tag, tag_norm)"
                        + " select c.id, 0, 'vip', 'vip' from contact c"
                        + " where c.group_id = ? and right(c.phone, 6)::int % 2 = 0",
                group);
        jdbc.update(
                "insert into contact_tag (contact_id, position, tag, tag_norm)"
                        + " select c.id, (select count(*) from contact_tag t where t.contact_id = c.id),"
                        + " 'konferenca2025', 'konferenca2025' from contact c"
                        + " where c.group_id = ? and right(c.phone, 6)::int % 5 = 0",
                group);
    }

    /** Skupina z {@code count} različnimi značkami (»znacka0001« …) na prvem kontaktu skupine (največ 30 na kontakt). */
    public void insertManyDistinctTags(UUID group, long userId, int count) {
        jdbc.update(
                "insert into contact (group_id, first_name, last_name, sort_first, sort_last, updated_by)"
                        + " select ?, 'Ime', 'Priimek ' || lpad(n::text, 5, '0'), 'ime',"
                        + " 'priimek ' || lpad(n::text, 5, '0'), ? from generate_series(1, ?) n",
                group,
                userId,
                (count + 29) / 30);
        List<UUID> ids =
                jdbc.queryForList("select id from contact where group_id = ? order by sort_last", UUID.class, group);
        for (int i = 0; i < count; i++) {
            String tag = "znacka" + String.format("%04d", i);
            addTag(ids.get(i / 30), i % 30, tag);
        }
    }

    /**
     * {@code count} kontaktov »Ime 00001 Priimek 00001« … paketno, vsak z danimi značkami (po vrstnem redu) in dodatnimi
     * atributi (ključ → vrednost, po vrstnem redu); za meritve z 10 000 kontakti. Vrne id-je po imenu.
     */
    public List<UUID> insertManyWithTagsAndAttributes(
            UUID group, long userId, int count, List<String> tags, Map<String, String> attributes) {
        List<UUID> ids = jdbc.queryForList(
                "insert into contact (group_id, first_name, last_name, sort_first, sort_last, updated_by)"
                        + " select ?, 'Ime ' || lpad(n::text, 5, '0'), 'Priimek ' || lpad(n::text, 5, '0'),"
                        + " 'ime ' || lpad(n::text, 5, '0'), 'priimek ' || lpad(n::text, 5, '0'), ?"
                        + " from generate_series(1, ?) n returning id",
                UUID.class,
                group,
                userId,
                count);
        int position = 0;
        for (String tag : tags) {
            insertChildRows(
                    "insert into contact_tag (contact_id, position, tag, tag_norm)"
                            + " select unnest(?::uuid[]), ?, ?, ?",
                    ids,
                    position++,
                    tag,
                    key(tag));
        }
        int attributePosition = 0;
        for (Map.Entry<String, String> attribute : attributes.entrySet()) {
            int at = attributePosition++;
            jdbc.update(connection -> {
                var statement = connection.prepareStatement(
                        "insert into contact_attribute (contact_id, position, key, key_norm, value)"
                                + " select unnest(?::uuid[]), ?, ?, ?, ?");
                statement.setArray(1, connection.createArrayOf("uuid", ids.toArray()));
                statement.setInt(2, at);
                statement.setString(3, attribute.getKey());
                statement.setString(4, key(attribute.getKey()));
                statement.setString(5, attribute.getValue());
                return statement;
            });
        }
        return ids;
    }

    private void insertChildRows(String sql, List<UUID> ids, int position, String text, String norm) {
        jdbc.update(connection -> {
            var statement = connection.prepareStatement(sql);
            statement.setArray(1, connection.createArrayOf("uuid", ids.toArray()));
            statement.setInt(2, position);
            statement.setString(3, text);
            statement.setString(4, norm);
            return statement;
        });
    }

    /**
     * Izbriše kontakt, kot bi ga izbrisal 004: vrstica izgine, v sledi skupine pa nastane vnos {@code DELETE} s stanjem
     * kontakta prej (identiteta je tako »znana« skupini, research R-02).
     */
    public void deleteAsAudited(UUID group, long userId, UUID contact) {
        String name = jdbc.queryForObject(
                "select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from contact where id = ?"
                        + " and group_id = ?",
                String.class,
                contact,
                group);
        Long seq = jdbc.queryForObject(
                "select coalesce((select last_seq from audit_head where group_id = ?), 0) + 1", Long.class, group);
        UUID entry = jdbc.queryForObject(
                "insert into audit_entry (group_id, seq, actor_id, action, contact_count, contact_name)"
                        + " values (?, ?, ?, 'DELETE', 1, ?) returning id",
                UUID.class,
                group,
                seq,
                userId,
                name);
        jdbc.update(
                "insert into audit_change (entry_id, position, contact_id, display_name, before)"
                        + " select ?, 0, c.id, ?, jsonb_build_object('firstName', c.first_name, 'lastName', c.last_name,"
                        + " 'address', c.address, 'email', c.email, 'phone', c.phone, 'attributes', '[]'::jsonb,"
                        + " 'tags', '[]'::jsonb, 'version', c.version) from contact c where c.id = ?",
                entry,
                name,
                contact);
        jdbc.update(
                "insert into audit_head (group_id, last_seq, last_entry_id) values (?, ?, ?)"
                        + " on conflict (group_id) do update set last_seq = excluded.last_seq,"
                        + " last_entry_id = excluded.last_entry_id",
                group,
                seq,
                entry);
        jdbc.update("delete from contact where id = ? and group_id = ?", contact, group);
    }

    public boolean exists(UUID contact) {
        Integer count = jdbc.queryForObject("select count(*) from contact where id = ?", Integer.class, contact);
        return count != null && count > 0;
    }

    public int count(UUID group) {
        Integer count = jdbc.queryForObject("select count(*) from contact where group_id = ?", Integer.class, group);
        return count == null ? 0 : count;
    }

    public long version(UUID contact) {
        Long version = jdbc.queryForObject("select version from contact where id = ?", Long.class, contact);
        return version == null ? -1 : version;
    }

    /** Vrstica kontakta brez ključev razvrščanja – za preverjanje, da se ni spremenila. */
    public Map<String, Object> row(UUID contact) {
        return jdbc.queryForMap(
                "select group_id, first_name, last_name, address, email, phone, version, created_at, updated_at,"
                        + " updated_by from contact where id = ?",
                contact);
    }

    public List<String> tagsOf(UUID contact) {
        return jdbc.queryForList(
                "select tag from contact_tag where contact_id = ? order by position", String.class, contact);
    }

    public List<Map<String, Object>> attributesOf(UUID contact) {
        return jdbc.queryForList(
                "select key, value from contact_attribute where contact_id = ? order by position", contact);
    }

    public int attributeRows(UUID contact) {
        Integer count = jdbc.queryForObject(
                "select count(*) from contact_attribute where contact_id = ?", Integer.class, contact);
        return count == null ? 0 : count;
    }

    /** Spremeni polje kontakta brez povečanja verzije (priprava nasprotnega stanja). */
    public void setPhone(UUID contact, String phone) {
        jdbc.update("update contact set phone = ? where id = ?", phone, contact);
    }

    /** Spremeni kontakt, kot da bi ga shranil drug urednik: telefon, verzija + 1, izvajalec in čas. */
    public void editedByOther(UUID contact, long userId, String phone) {
        jdbc.update(
                "update contact set phone = ?, version = version + 1, updated_by = ?, updated_at = now() where id = ?",
                phone,
                userId,
                contact);
    }

    /**
     * Kontakt z nadzorovanim {@code created_at} (011): vrednosti se shranijo dobesedno (brez obrezovanja, z velikimi
     * črkami in večkratnimi presledki), da se preizkusi normalizacija pri iskanju dvojnikov. Kontaktov, ki jih test
     * briše, ne ustvarjaj s to metodo (sled bi manjkala): zanje uporabi API 004.
     */
    public UUID insertContact(
            UUID group,
            long userId,
            String first,
            String last,
            String email,
            String phone,
            java.time.Instant createdAt) {
        return jdbc.queryForObject(
                "insert into contact (group_id, first_name, last_name, email, phone, sort_first, sort_last, updated_by,"
                        + " created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                UUID.class,
                group,
                first,
                last,
                email,
                phone,
                key(first),
                key(last),
                userId,
                java.sql.Timestamp.from(createdAt),
                java.sql.Timestamp.from(createdAt));
    }

    /**
     * {@code count} kontaktov z enakim e-naslovom, z naraščajočim {@code created_at} (po eno sekundo narazen, od
     * {@code 2026-01-01T00:00:00Z}); vrne id-je po vrstnem redu ustvarjanja (prvi je najstarejši).
     */
    public List<UUID> insertDuplicates(UUID group, long userId, int count, String email) {
        java.time.Instant start = java.time.Instant.parse("2026-01-01T00:00:00Z");
        List<UUID> ids = new java.util.ArrayList<>();
        for (int i = 1; i <= count; i++) {
            ids.add(insertContact(
                    group,
                    userId,
                    "Ime" + String.format("%02d", i),
                    "Priimek" + String.format("%02d", i),
                    email,
                    null,
                    start.plusSeconds(i)));
        }
        return ids;
    }

    /** Čas ustvarjanja kontakta (za preverjanje, da združitev ne spremeni {@code created_at}). */
    public java.time.Instant createdAt(UUID contact) {
        return jdbc.queryForObject("select created_at from contact where id = ?", java.sql.Timestamp.class, contact)
                .toInstant();
    }
}

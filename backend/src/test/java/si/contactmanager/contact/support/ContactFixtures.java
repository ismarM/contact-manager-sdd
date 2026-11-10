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
}

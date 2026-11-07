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

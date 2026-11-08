package si.contactmanager.audit.support;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Branje revizijske sledi neposredno iz testne baze (tasks T002). Vnosi nastanejo prek API-ja (ali {@code AuditLog});
 * {@link #insertEntries} je edina izjema – za meritve zmogljivosti (SC-005).
 */
public final class AuditFixtures {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final JdbcTemplate jdbc;

    public AuditFixtures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Vnosi skupine po {@code seq} naraščajoče: id, seq, action, actor_id, contact_count, contact_name, ... */
    public List<Map<String, Object>> entries(UUID group) {
        return jdbc.queryForList(
                "select id, seq, created_at, action, actor_id, contact_count, contact_name, target_entry_id,"
                        + " target_initial from audit_entry where group_id = ? order by seq",
                group);
    }

    /** Spremembe vnosa po {@code position}: contact_id, display_name, before in after kot {@link Map} (ali null). */
    public List<Map<String, Object>> changes(UUID entry) {
        return jdbc
                .queryForList(
                        "select contact_id, display_name, before::text as before, after::text as after"
                                + " from audit_change where entry_id = ? order by position",
                        entry)
                .stream()
                .map(row -> {
                    Map<String, Object> change = new LinkedHashMap<>(row);
                    change.put("before", state((String) row.get("before")));
                    change.put("after", state((String) row.get("after")));
                    return change;
                })
                .toList();
    }

    /** Id-ji kontaktov skupine po id (stabilen vrstni red). */
    public List<UUID> contactIds(UUID group) {
        return jdbc.queryForList("select id from contact where group_id = ? order by id", UUID.class, group);
    }

    public int count(UUID group) {
        Integer count =
                jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Integer.class, group);
        return count == null ? 0 : count;
    }

    /** Najnovejši vnos celotne sledi (glava sledi) ali {@code null} v prazni sledi. */
    public UUID latestEntryId(UUID group) {
        List<UUID> ids =
                jdbc.queryForList("select last_entry_id from audit_head where group_id = ?", UUID.class, group);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * {@code n} vnosov {@code UPDATE} z enim {@code audit_change} vsak in pravilno glavo sledi (SC-005: 100.000 vnosov).
     * Stanja so minimalna; vnosov ni mogoče povrniti.
     */
    public void insertEntries(UUID group, long actorId, int n) {
        jdbc.update(
                "insert into audit_entry (group_id, seq, actor_id, action, contact_count, contact_name)"
                        + " select ?, s, ?, 'UPDATE', 1, 'Kontakt ' || s from generate_series(1, ?) s",
                group,
                actorId,
                n);
        jdbc.update(
                "insert into audit_change (entry_id, position, contact_id, display_name, before, after)"
                        + " select e.id, 0, uuidv7(), e.contact_name, '{\"firstName\":\"A\"}'::jsonb,"
                        + " '{\"firstName\":\"B\"}'::jsonb from audit_entry e where e.group_id = ?",
                group);
        jdbc.update(
                "insert into audit_head (group_id, last_seq, last_entry_id)"
                        + " select ?, e.seq, e.id from audit_entry e where e.group_id = ? order by e.seq desc limit 1"
                        + " on conflict (group_id) do update set last_seq = excluded.last_seq,"
                        + " last_entry_id = excluded.last_entry_id",
                group,
                group);
    }

    /**
     * Trenutna vsebina in metapodatki kontakta: polja, atributi, značke, version, created_at, updated_at, updated_by,
     * reverted_entry_id; prazno, če kontakta ni.
     */
    public Map<String, Object> contactState(UUID contact) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select first_name, last_name, address, email, phone, version, created_at, updated_at, updated_by,"
                        + " reverted_entry_id from contact where id = ?",
                contact);
        if (rows.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> state = new LinkedHashMap<>(rows.get(0));
        state.put(
                "attributes",
                jdbc.queryForList(
                        "select key, value from contact_attribute where contact_id = ? order by position", contact));
        state.put(
                "tags",
                jdbc.queryForList(
                        "select tag from contact_tag where contact_id = ? order by position", String.class, contact));
        return state;
    }

    private static Map<String, Object> state(String json) {
        return json == null ? null : JSON.readValue(json, new TypeReference<Map<String, Object>>() {});
    }
}

package si.contactmanager.contact.support;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Osnova testov dvojnikov (011, plan.md – Public Interfaces): zahtevki na tri endpointe, telesa {@code merge}, vsiljena
 * napaka prek sprožilca SQL in sledenje vnosom revizijske sledi. Stanje »nič se ni spremenilo« je {@link
 * #snapshot(UUID)} in {@link #assertUnchanged(Snapshot, Snapshot)} iz {@link BulkApiTest}.
 */
public abstract class DuplicateApiTest extends BulkApiTest {

    protected static String duplicatesPath(UUID group) {
        return "/api/groups/" + group + "/duplicates";
    }

    protected static String comparePath(UUID group) {
        return duplicatesPath(group) + "/compare";
    }

    protected static String mergePath(UUID group) {
        return duplicatesPath(group) + "/merge";
    }

    /** {@code GET …/duplicates} z URL kodiranimi pari ime, vrednost (npr. {@code "category", "email"}). */
    protected HttpResponse<String> duplicates(String token, UUID group, String... pairs) throws Exception {
        return get(duplicatesPath(group) + ContactSearchClient.query(pairs), token);
    }

    /** {@code GET …/duplicates/compare?ids=…} (vejice). */
    protected HttpResponse<String> compare(String token, UUID group, Collection<UUID> ids) throws Exception {
        return get(comparePath(group) + "?ids=" + String.join(",", ids(ids)), token);
    }

    /** {@code GET …/duplicates/compare} s surovim nizom poizvedbe (neveljavni primeri). */
    protected HttpResponse<String> compareRaw(String token, UUID group, String rawQuery) throws Exception {
        return get(comparePath(group) + (rawQuery.isEmpty() ? "" : "?" + rawQuery), token);
    }

    /** {@code POST …/duplicates/merge}; telo je lahko niz (neveljaven JSON) ali objekt. */
    protected HttpResponse<String> merge(String token, UUID group, Object requestBody) throws Exception {
        return post(mergePath(group), token, requestBody instanceof String text ? text : body(requestBody));
    }

    /** Vključeni kontakt {@code {id, version}}. */
    protected static Map<String, Object> contact(UUID id, long version) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", id.toString());
        row.put("version", version);
        return row;
    }

    /** Končne vrednosti združenega kontakta ({@code result}); {@code null} polja so izpuščena. */
    protected static Map<String, Object> result(
            String first,
            String last,
            String address,
            String email,
            String phone,
            List<Map<String, String>> attributes,
            List<String> tags) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (first != null) {
            result.put("firstName", first);
        }
        if (last != null) {
            result.put("lastName", last);
        }
        if (address != null) {
            result.put("address", address);
        }
        if (email != null) {
            result.put("email", email);
        }
        if (phone != null) {
            result.put("phone", phone);
        }
        result.put("attributes", attributes == null ? List.of() : attributes);
        result.put("tags", tags == null ? List.of() : tags);
        return result;
    }

    /** Vrstica {@code attributes} rezultata. */
    protected static Map<String, String> attribute(String key, String value) {
        Map<String, String> row = new LinkedHashMap<>();
        row.put("key", key);
        row.put("value", value);
        return row;
    }

    /** Telo {@code merge}: {@code contacts} (id, verzija) in {@code result}. */
    protected static Map<String, Object> mergeBody(List<Map<String, Object>> contacts, Map<String, Object> result) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("contacts", contacts);
        body.put("result", result);
        return body;
    }

    /** Telo {@code merge} z verzijami, prebranimi iz baze (kot da je primerjava odprta zdaj). */
    protected Map<String, Object> mergeBodyNow(List<UUID> ids, Map<String, Object> result) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UUID id : ids) {
            rows.add(contact(id, contacts.version(id)));
        }
        return mergeBody(rows, result);
    }

    /** Vnosi sledi skupine z dano vrsto dejanja ({@code CREATE}, {@code UPDATE}, {@code DELETE}, {@code MERGE}, {@code ROLLBACK}). */
    protected List<Map<String, Object>> auditEntries(UUID group, String action) {
        return audit.entries(group).stream()
                .filter(entry -> action.equals(String.valueOf(entry.get("action"))))
                .toList();
    }

    /**
     * Vsiljena napaka (FR-011-15, F6): sprožilec {@code BEFORE <event> ON <table> FOR EACH ROW WHEN (<condition>)}, ki
     * vrže {@code RAISE EXCEPTION}. {@code condition} mora zožiti sprožilec na kontakt oziroma skupino testa (npr.
     * {@code OLD.id = '…'}), da ne vpliva na druge teste v isti bazi. Vrne ime sprožilca za {@link #dropTrigger}.
     */
    protected String installFailingTrigger(String table, String event, String condition) {
        String name = "t011_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE OR REPLACE FUNCTION " + name + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN"
                + " RAISE EXCEPTION 'vsiljena napaka (test 011)'; END $$");
        jdbc.execute("CREATE TRIGGER " + name + " BEFORE " + event + " ON " + table + " FOR EACH ROW WHEN (" + condition
                + ") EXECUTE FUNCTION " + name + "()");
        return name;
    }

    /** Odstrani sprožilec in funkcijo; varno za večkratni klic (vedno v {@code finally}). */
    protected void dropTrigger(String table, String name) {
        jdbc.execute("DROP TRIGGER IF EXISTS " + name + " ON " + table);
        jdbc.execute("DROP FUNCTION IF EXISTS " + name + "()");
    }

    /** Število sprožilcev testa 011 v bazi (po testu mora biti 0). */
    protected int leftoverTriggers() {
        Integer count =
                jdbc.queryForObject("select count(*) from pg_trigger where tgname like 't011\\_%'", Integer.class);
        return count == null ? 0 : count;
    }
}

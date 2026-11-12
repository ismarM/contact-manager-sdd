package si.contactmanager.contact.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import si.contactmanager.audit.support.AuditFixtures;

/**
 * Osnova testov množičnih operacij (009, plan.md – Public Interfaces): zahtevki na štiri endpointe in preverjanje
 * »nič se ni spremenilo« (verzije, vrednosti, značke, atributi vseh kontaktov skupine in število vnosov sledi).
 */
public abstract class BulkApiTest extends ContactApiTest {

    protected AuditFixtures audit;

    @BeforeEach
    void setUpBulkFixtures() {
        audit = new AuditFixtures(jdbc);
    }

    /** Stanje skupine za primerjavo: vrstice kontaktov (z verzijo), značke, atributi in število vnosov sledi. */
    public record Snapshot(
            Map<UUID, Map<String, Object>> rows,
            Map<UUID, List<String>> tags,
            Map<UUID, List<Map<String, Object>>> attributes,
            int auditEntries) {}

    protected static String contactIdsPath(UUID group) {
        return "/api/groups/" + group + "/contact-ids";
    }

    protected static String selectionCheckPath(UUID group) {
        return contactsPath(group) + "/selection-check";
    }

    protected static String bulkUpdatePath(UUID group) {
        return contactsPath(group) + "/bulk-update";
    }

    protected static String bulkDeletePath(UUID group) {
        return contactsPath(group) + "/bulk-delete";
    }

    /** {@code GET …/contact-ids} z URL kodiranimi pari ime, vrednost (kot 008). */
    protected HttpResponse<String> contactIds(String token, UUID group, String... pairs) throws Exception {
        return get(contactIdsPath(group) + ContactSearchClient.query(pairs), token);
    }

    protected HttpResponse<String> selectionCheck(String token, UUID group, Object requestBody) throws Exception {
        return post(selectionCheckPath(group), token, asText(requestBody));
    }

    protected HttpResponse<String> bulkUpdate(String token, UUID group, Object requestBody) throws Exception {
        return post(bulkUpdatePath(group), token, asText(requestBody));
    }

    protected HttpResponse<String> bulkDelete(String token, UUID group, Object requestBody) throws Exception {
        return post(bulkDeletePath(group), token, asText(requestBody));
    }

    private static String asText(Object requestBody) {
        return requestBody instanceof String text ? text : body(requestBody);
    }

    /** Identitete kot nizi za telo zahtevka. */
    protected static List<String> ids(Collection<UUID> ids) {
        return ids.stream().map(UUID::toString).toList();
    }

    /** Telo {@code {contactIds: …}} z dodatnimi polji iz parov ime, vrednost. */
    protected static Map<String, Object> request(Collection<UUID> contactIds, Object... fields) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("contactIds", ids(contactIds));
        for (int i = 0; i < fields.length; i += 2) {
            request.put((String) fields[i], fields[i + 1]);
        }
        return request;
    }

    /** Vrstica {@code attributes} zahtevka. */
    protected static Map<String, Object> attributeSet(String field, String key, String value) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("field", field);
        if (key != null) {
            row.put("key", key);
        }
        row.put("value", value);
        return row;
    }

    /** Poizvedba {@code selection-check}. */
    protected static Map<String, Object> checkQuery(
            List<String> tag, Collection<UUID> contactIds, Collection<UUID> excludedIds) {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("q", "");
        query.put("f", List.of());
        query.put("tag", tag);
        query.put("contactIds", ids(contactIds));
        query.put("excludedIds", ids(excludedIds));
        return query;
    }

    /** Rollback 005 na stanje takoj po vnosu {@code entry} kot admin z najnovejšim vnosom sledi; zahteva uspeh. */
    protected void rollbackTo(Scenario s, UUID entry) throws Exception {
        UUID latest = audit.latestEntryId(s.group());
        HttpResponse<String> response = post(
                "/api/groups/" + s.group() + "/audit/" + entry + "/rollback",
                s.token(Who.ADMIN),
                body(Map.of("latestEntryId", latest.toString())));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
    }

    /** Id-ji kontaktov, ustvarjenih prek API-ja 004 (vsak ima vnos sledi {@code CREATE}). */
    protected List<UUID> createViaApi(Scenario s, int count, List<String> tags) throws Exception {
        List<UUID> created = new java.util.ArrayList<>();
        for (int i = 1; i <= count; i++) {
            Map<String, Object> input = input("Ime" + i, "Priimek" + i);
            input.put("tags", tags);
            input.put("phone", "01 000 " + String.format("%03d", i));
            created.add(UUID.fromString((String) createViaApi(s, input).get("id")));
        }
        return created;
    }

    protected Snapshot snapshot(UUID group) {
        Map<UUID, Map<String, Object>> rows = new LinkedHashMap<>();
        Map<UUID, List<String>> tags = new LinkedHashMap<>();
        Map<UUID, List<Map<String, Object>>> attributes = new LinkedHashMap<>();
        for (UUID id : audit.contactIds(group)) {
            rows.put(id, contacts.row(id));
            tags.put(id, contacts.tagsOf(id));
            attributes.put(id, contacts.attributesOf(id));
        }
        return new Snapshot(rows, tags, attributes, audit.count(group));
    }

    /** Nič se ni spremenilo: enake verzije in vrednosti vseh kontaktov, enake značke in atributi, enako število vnosov. */
    protected static void assertUnchanged(Snapshot before, Snapshot after) {
        assertThat(after.rows()).isEqualTo(before.rows());
        assertThat(after.tags()).isEqualTo(before.tags());
        assertThat(after.attributes()).isEqualTo(before.attributes());
        assertThat(after.auditEntries()).isEqualTo(before.auditEntries());
    }

    /** Množica identitet iz seznama nizov v odgovoru. */
    protected static java.util.Set<String> idSet(Object value) {
        return new java.util.HashSet<>(asStrings(value));
    }
}

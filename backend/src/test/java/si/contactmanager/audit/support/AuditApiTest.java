package si.contactmanager.audit.support;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import si.contactmanager.contact.support.ContactApiTest;
import si.contactmanager.support.Http;

/** Osnova testov revizijske sledi: skupina po vlogah (004) in pomočniki za operacije prek API-ja ter branje sledi. */
public abstract class AuditApiTest extends ContactApiTest {

    protected AuditFixtures audit;

    @BeforeEach
    void setUpAudit() {
        audit = new AuditFixtures(jdbc);
    }

    protected static String auditPath(UUID group) {
        return "/api/groups/" + group + "/audit";
    }

    protected static String entryPath(UUID group, Object entry) {
        return auditPath(group) + "/" + entry;
    }

    protected static String rollbackPath(UUID group, Object entry) {
        return entryPath(group, entry) + "/rollback";
    }

    protected static String initialRollbackPath(UUID group) {
        return auditPath(group) + "/initial-state/rollback";
    }

    protected static Map<String, Object> rollbackBody(Object latestEntryId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("latestEntryId", latestEntryId == null ? null : latestEntryId.toString());
        return body;
    }

    /** Ustvari kontakt kot izbrani član; vrne razčlenjen odgovor. */
    protected Map<String, Object> create(Scenario s, Who who, Map<String, Object> input) throws Exception {
        HttpResponse<String> response = post(contactsPath(s.group()), s.token(who), body(input));
        if (response.statusCode() != 201) {
            throw new IllegalStateException("POST contacts vrnil " + response.statusCode() + ": " + response.body());
        }
        return json(response.body());
    }

    /** Uredi kontakt (celotne vrednosti in verzija) kot izbrani član; vrne razčlenjen odgovor. */
    protected Map<String, Object> update(Scenario s, Who who, UUID contact, Map<String, Object> values, long version)
            throws Exception {
        HttpResponse<String> response =
                put(contactPath(s.group(), contact), s.token(who), body(withVersion(values, version)));
        if (response.statusCode() != 200) {
            throw new IllegalStateException("PUT contact vrnil " + response.statusCode() + ": " + response.body());
        }
        return json(response.body());
    }

    /** Izbriše kontakt z dano verzijo kot izbrani član. */
    protected void remove(Scenario s, Who who, UUID contact, long version) throws Exception {
        HttpResponse<String> response = delete(contactPath(s.group(), contact) + "?version=" + version, s.token(who));
        if (response.statusCode() != 204) {
            throw new IllegalStateException("DELETE contact vrnil " + response.statusCode() + ": " + response.body());
        }
    }

    /** Vrednosti kontakta iz odgovora kot telo za urejanje (brez verzije). */
    protected static Map<String, Object> valuesOf(Map<String, Object> detail) {
        Map<String, Object> values = new LinkedHashMap<>();
        for (String field : List.of("firstName", "lastName", "address", "email", "phone", "attributes", "tags")) {
            values.put(field, detail.get(field));
        }
        return values;
    }

    protected static UUID idOf(Map<String, Object> detail) {
        return UUID.fromString((String) detail.get("id"));
    }

    protected static long versionOf(Map<String, Object> detail) {
        return ((Number) detail.get("version")).longValue();
    }

    /** {@code GET …/audit} z dano poizvedbo (npr. {@code "?size=50"}) kot izbrani član. */
    protected HttpResponse<String> list(Scenario s, Who who, String query) throws Exception {
        return get(auditPath(s.group()) + query, s.token(who));
    }

    /** Rollback na vnos kot izbrani član z danim {@code latestEntryId}. */
    protected HttpResponse<String> rollback(Scenario s, Who who, UUID entry, UUID latestEntryId) throws Exception {
        return post(rollbackPath(s.group(), entry), s.token(who), body(rollbackBody(latestEntryId)));
    }

    /** Rollback na vnos kot admin z najnovejšim vnosom sledi; zahteva uspeh in vrne razčlenjen nov vnos. */
    protected Map<String, Object> rollbackToEntry(Scenario s, UUID entry) throws Exception {
        HttpResponse<String> response = rollback(s, Who.ADMIN, entry, audit.latestEntryId(s.group()));
        if (response.statusCode() != 201) {
            throw new IllegalStateException("rollback vrnil " + response.statusCode() + ": " + response.body());
        }
        return json(response.body());
    }

    protected HttpResponse<String> rollbackInitial(Scenario s, Who who, UUID latestEntryId) throws Exception {
        return post(initialRollbackPath(s.group()), s.token(who), body(rollbackBody(latestEntryId)));
    }

    /** Zahtevek brez telesa s poljubno metodo in žetonom (ali brez njega). */
    protected HttpResponse<String> send(String method, String path, String token) throws Exception {
        return Http.send(method, url(path), token == null ? Map.of() : Http.bearer(token));
    }

    /** Veljavno telo kontakta z ime in priimkom ter telefonom. */
    protected static Map<String, Object> contactInput(String first, String last, String phone) {
        Map<String, Object> input = input(first, last);
        input.put("phone", phone);
        return input;
    }
}

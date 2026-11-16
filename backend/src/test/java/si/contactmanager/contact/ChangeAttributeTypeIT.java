package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.audit.support.AuditApiTest;

/**
 * Sprememba tipa ključa {@code POST …/attribute-keys/change-type} (016, FR-016-04, -05, -26): atomarna normalizacija
 * vseh vrednosti, nova verzija kontaktov, en vnos sledi {@code ATTRIBUTE_TYPE}; neveljavne vrednosti → 409 s seznamom
 * (do 100) in številom, nič se ne spremeni; nespremenjen tip brez vnosa; sočasni zahtevki.
 */
@Tag("FR-016-04")
@Tag("FR-016-05")
@Tag("FR-016-26")
class ChangeAttributeTypeIT extends AuditApiTest {

    private static String changePath(UUID group) {
        return "/api/groups/" + group + "/attribute-keys/change-type";
    }

    private static String change(String key, String type, long version) {
        return body(Map.of("key", key, "type", type, "version", version));
    }

    /** {@code n} kontaktov z ključem {@code key}; vrednost {@code value.apply(i)}; ključ je tipa OTHER (vrstica). */
    private List<UUID> contactsWithKey(Scenario s, String key, int n, java.util.function.IntFunction<String> value) {
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), n);
        jdbc.update(
                "insert into attribute_key (group_id, key_norm) values (?, ?) on conflict do nothing",
                s.group(),
                key.toLowerCase(java.util.Locale.ROOT));
        List<Object[]> rows = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            rows.add(new Object[] {ids.get(i), key, key.toLowerCase(java.util.Locale.ROOT), value.apply(i)});
        }
        jdbc.batchUpdate(
                "insert into contact_attribute (contact_id, position, key, key_norm, value) values (?, 0, ?, ?, ?)",
                rows);
        return ids;
    }

    private long keyVersion(UUID group, String keyNorm) {
        return jdbc.queryForObject(
                "select version from attribute_key where group_id = ? and key_norm = ?", Long.class, group, keyNorm);
    }

    private String keyType(UUID group, String keyNorm) {
        return jdbc.queryForObject(
                "select type from attribute_key where group_id = ? and key_norm = ?", String.class, group, keyNorm);
    }

    @Test
    void aThousandValuesAreNormalizedInOneTransactionWithOneAuditEntry() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contactsWithKey(s, "Pošta", 1000, i -> "Uporabnik" + i + "@Primer.SI");

        HttpResponse<String> response = post(changePath(s.group()), s.token(Who.EDITOR), change("pošta", "EMAIL", 0));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .containsEntry("key", "Pošta")
                .containsEntry("type", "EMAIL")
                .containsEntry("contactCount", 1000)
                .containsEntry("version", 1);
        assertThat(keyType(s.group(), "pošta")).isEqualTo("EMAIL");
        assertThat(contacts.attributesOf(ids.get(7)))
                .containsExactly(Map.of("key", "Pošta", "value", "Uporabnik7@primer.si"));
        assertThat(contacts.version(ids.get(7))).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "select count(*) from contact where group_id = ? and version = 1", Long.class, s.group()))
                .isEqualTo(1000);
        List<Map<String, Object>> entries = audit.entries(s.group());
        assertThat(entries).hasSize(1);
        assertThat(entries.get(0)).containsEntry("action", "ATTRIBUTE_TYPE").containsEntry("contact_count", 1000);
        Map<String, Object> entry = jdbc.queryForMap(
                "select attribute_key, type_before, type_after from audit_entry where group_id = ?", s.group());
        assertThat(entry)
                .containsEntry("attribute_key", "Pošta")
                .containsEntry("type_before", "OTHER")
                .containsEntry("type_after", "EMAIL");
    }

    @Test
    void invalidValuesGiveAConflictListAndNothingChanges() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contactsWithKey(s, "kontakt", 150, i -> i < 120 ? "ni-e-naslov" + i : "ok" + i + "@primer.si");

        HttpResponse<String> response = post(changePath(s.group()), s.token(Who.EDITOR), change("Kontakt", "EMAIL", 0));

        assertThat(response.statusCode()).isEqualTo(409);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "ATTRIBUTE_TYPE_CONFLICT");
        Map<String, Object> details = asObject(body.get("details"));
        assertThat(details).containsEntry("total", 120);
        List<Map<String, Object>> shown = asObjects(details.get("contacts"));
        assertThat(shown).hasSize(100);
        assertThat(shown.get(0)).containsKeys("contactId", "displayName", "value");
        assertThat(keyType(s.group(), "kontakt")).isEqualTo("OTHER");
        assertThat(keyVersion(s.group(), "kontakt")).isZero();
        assertThat(contacts.attributesOf(ids.get(130)))
                .containsExactly(Map.of("key", "kontakt", "value", "ok130@primer.si"));
        assertThat(contacts.version(ids.get(0))).isZero();
        assertThat(audit.count(s.group())).isZero();
    }

    @Test
    void theSameTypeIsASuccessWithoutAChangeOrAnEntry() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contactsWithKey(s, "pošta", 3, i -> "a" + i + "@primer.si");
        assertThat(post(changePath(s.group()), s.token(Who.EDITOR), change("pošta", "EMAIL", 0))
                        .statusCode())
                .isEqualTo(200);
        int entries = audit.count(s.group());

        HttpResponse<String> again = post(changePath(s.group()), s.token(Who.EDITOR), change("pošta", "EMAIL", 1));

        assertThat(again.statusCode()).isEqualTo(200);
        assertThat(json(again.body())).containsEntry("type", "EMAIL").containsEntry("version", 1);
        assertThat(audit.count(s.group())).isEqualTo(entries);
        assertThat(contacts.version(ids.get(0))).isEqualTo(1);
    }

    @Test
    void aStaleVersionIsAVersionConflictWithTheCurrentKey() throws Exception {
        Scenario s = scenario();
        contactsWithKey(s, "Pošta", 2, i -> "a" + i + "@primer.si");
        assertThat(post(changePath(s.group()), s.token(Who.EDITOR), change("Pošta", "EMAIL", 0))
                        .statusCode())
                .isEqualTo(200);

        HttpResponse<String> stale = post(changePath(s.group()), s.token(Who.EDITOR), change("Pošta", "URL", 0));

        assertThat(stale.statusCode()).isEqualTo(409);
        Map<String, Object> body = json(stale.body());
        assertThat(body).containsEntry("code", "VERSION_CONFLICT");
        assertThat(asObject(body.get("current")))
                .containsEntry("key", "Pošta")
                .containsEntry("type", "EMAIL")
                .containsEntry("version", 1)
                .containsEntry("contactCount", 2);
        assertThat(keyType(s.group(), "pošta")).isEqualTo("EMAIL");
    }

    @Test
    void aKeyThatIsNotInUseIsNotFound() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = post(changePath(s.group()), s.token(Who.EDITOR), change("ni-ga", "EMAIL", 0));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from attribute_key where group_id = ?", Long.class, s.group()))
                .isZero();
    }

    @Test
    void aKeyWithoutARowIsRegisteredAsOtherAndConverted() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Novak");
        contacts.addAttribute(contact, 0, "Stran", "primer.si");

        HttpResponse<String> response = post(changePath(s.group()), s.token(Who.EDITOR), change("stran", "URL", 0));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("type", "URL").containsEntry("version", 1);
        assertThat(contacts.attributesOf(contact).get(0).get("value").toString())
                .startsWith("https://primer.si");
    }

    @Test
    void invalidBodiesAreRefusedBeforeAnyChange() throws Exception {
        Scenario s = scenario();
        contactsWithKey(s, "pošta", 1, i -> "a@primer.si");

        assertThat(fieldErrors(
                        post(changePath(s.group()), s.token(Who.EDITOR), "{}").body()))
                .containsEntry("key", "REQUIRED")
                .containsEntry("type", "REQUIRED")
                .containsEntry("version", "REQUIRED");
        assertThat(fieldErrors(post(changePath(s.group()), s.token(Who.EDITOR), change("pošta", "NEZNAN", 0))
                        .body()))
                .containsEntry("type", "INVALID_VALUE");
        assertThat(post(changePath(s.group()), s.token(Who.EDITOR), "ni json").statusCode())
                .isEqualTo(400);
        assertThat(keyType(s.group(), "pošta")).isEqualTo("OTHER");
    }

    @Test
    void concurrentChangesWithTheSameVersionLeaveExactlyOneWinner() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contactsWithKey(s, "pošta", 200, i -> "a" + i + "@primer.si");

        CompletableFuture<HttpResponse<String>> email = CompletableFuture.supplyAsync(() -> send(s, "EMAIL"));
        CompletableFuture<HttpResponse<String>> url = CompletableFuture.supplyAsync(() -> send(s, "URL"));

        List<Integer> statuses = List.of(email.get().statusCode(), url.get().statusCode()).stream()
                .sorted()
                .toList();
        // Zmagovalec spremeni tip; drugi vidi novo verzijo (VERSION_CONFLICT) ali vrednosti, ki jih tip zavrne.
        assertThat(statuses.get(0)).isEqualTo(200);
        assertThat(statuses.get(1)).isEqualTo(409);
        assertThat(keyVersion(s.group(), "pošta")).isEqualTo(1);
        assertThat(contacts.version(ids.get(0))).isEqualTo(1);
        assertThat(audit.count(s.group())).isEqualTo(1);
    }

    private HttpResponse<String> send(Scenario s, String type) {
        try {
            return post(changePath(s.group()), s.token(Who.EDITOR), change("pošta", type, 0));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}

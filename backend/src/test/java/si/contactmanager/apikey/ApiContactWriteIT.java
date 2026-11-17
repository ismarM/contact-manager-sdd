package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.apikey.support.ApiV1Test;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;

/**
 * Pisanje kontaktov prek API ključa (FR-019-10, -11, -12): enaka normalizacija, preverjanje in verzije kot v spletni
 * aplikaciji; vsaka sprememba je v sledi z imenom ključa.
 */
@Tag("FR-019-10")
@Tag("FR-019-11")
@Tag("FR-019-12")
class ApiContactWriteIT extends ApiV1Test {

    private static final String KEY_NAME = "Testni ključ";

    private static Map<String, Object> contact(String first, String last, String phone) {
        Map<String, Object> input = input(first, last);
        input.put("phone", phone);
        return input;
    }

    private List<Map<String, Object>> trail(Scenario s, String query) throws Exception {
        HttpResponse<String> response = get("/api/groups/" + s.group() + "/audit" + query, s.token(Who.OWNER));
        assertThat(response.statusCode()).isEqualTo(200);
        return asObjects(json(response.body()).get("items"));
    }

    @Test
    void createNormalizesLikeTheFormAndReturnsTheContactWithVersion() throws Exception {
        Scenario s = scenario();
        String key = keyFor(s, Who.EDITOR, Permission.WRITE, s.group());

        HttpResponse<String> api =
                v1("POST", contactsV1(s.group()), key, body(contact("Janez", "Novak", "+386 1 234 56 78")));
        HttpResponse<String> web =
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(contact("Janez", "Novak", "+386 1 234 56 78")));

        assertThat(api.statusCode()).isEqualTo(201);
        Map<String, Object> created = json(api.body());
        assertThat(created).containsEntry("phone", "+38612345678").containsKey("version");
        assertThat(created).containsEntry("version", json(web.body()).get("version"));
        assertThat(contacts.count(s.group())).isEqualTo(2);
    }

    @Test
    void invalidInputGivesTheSameValidationErrorsAsTheWebApplicationAndChangesNothing() throws Exception {
        Scenario s = scenario();
        UUID existing = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        Map<String, Object> rowBefore = contacts.row(existing);
        String key = keyFor(s, Who.EDITOR, Permission.WRITE, s.group());
        Map<String, Object> invalid = new java.util.LinkedHashMap<>();
        invalid.put("email", "ni-epostni-naslov");

        HttpResponse<String> webCreate = post(contactsPath(s.group()), s.token(Who.EDITOR), body(invalid));
        HttpResponse<String> apiCreate = v1("POST", contactsV1(s.group()), key, body(invalid));
        invalid.put("version", 0);
        HttpResponse<String> webUpdate = put(contactPath(s.group(), existing), s.token(Who.EDITOR), body(invalid));
        HttpResponse<String> apiUpdate = v1("PUT", contactV1(s.group(), existing), key, body(invalid));

        assertThat(apiCreate.statusCode()).isEqualTo(400);
        assertThat(json(apiCreate.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(json(apiCreate.body())).isEqualTo(json(webCreate.body()));
        assertThat(apiUpdate.statusCode()).isEqualTo(400);
        assertThat(json(apiUpdate.body())).isEqualTo(json(webUpdate.body()));
        assertThat(contacts.count(s.group())).isEqualTo(1);
        assertThat(contacts.row(existing)).isEqualTo(rowBefore);
        assertThat(trail(s, "")).isEmpty();
    }

    @Test
    void updateAndDeleteWithAStaleVersionAreVersionConflictsAndChangeNothing() throws Exception {
        Scenario s = scenario();
        String key = keyFor(s, Who.EDITOR, Permission.WRITE, s.group());
        Map<String, Object> created = json(v1("POST", contactsV1(s.group()), key, body(input("Janez", "Novak")))
                .body());
        UUID id = UUID.fromString((String) created.get("id"));
        long version = ((Number) created.get("version")).longValue();
        long stale = version + 1;

        HttpResponse<String> update =
                v1("PUT", contactV1(s.group(), id), key, body(withVersion(input("Drug", "Novak"), stale)));
        HttpResponse<String> delete = v1("DELETE", contactV1(s.group(), id) + "?version=" + stale, key);

        assertThat(update.statusCode()).isEqualTo(409);
        assertThat(json(update.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(delete.statusCode()).isEqualTo(409);
        assertThat(json(delete.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(contacts.row(id)).containsEntry("first_name", "Janez");
        assertThat(contacts.version(id)).isEqualTo(version);
    }

    @Test
    void deleteWithoutOrWithInvalidVersionIsAValidationError() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        String key = keyFor(s, Who.EDITOR, Permission.WRITE, s.group());

        for (String query : List.of("", "?version=x", "?version=-1")) {
            HttpResponse<String> response = v1("DELETE", contactV1(s.group(), id) + query, key);
            assertThat(response.statusCode()).as(query).isEqualTo(400);
        }
        assertThat(contacts.exists(id)).isTrue();
    }

    @Test
    void createUpdateAndDeleteAreInTheTrailWithTheKeyNameAndFilterByUserIncludesThem() throws Exception {
        Scenario s = scenario();
        String key = keyFor(s, Who.EDITOR, Permission.WRITE, s.group());

        Map<String, Object> created = json(v1("POST", contactsV1(s.group()), key, body(input("Janez", "Novak")))
                .body());
        String id = (String) created.get("id");
        long version = ((Number) created.get("version")).longValue();
        Map<String, Object> updated =
                json(v1("PUT", contactV1(s.group(), id), key, body(withVersion(input("Janez", "Horvat"), version)))
                        .body());
        long next = ((Number) updated.get("version")).longValue();
        assertThat(v1("DELETE", contactV1(s.group(), id) + "?version=" + next, key)
                        .statusCode())
                .isEqualTo(204);

        List<Map<String, Object>> entries = trail(s, "");
        assertThat(entries).extracting(e -> e.get("action")).containsExactly("DELETE", "UPDATE", "CREATE");
        assertThat(entries).allSatisfy(e -> {
            assertThat(e).containsEntry("apiKeyName", KEY_NAME);
            assertThat(asObject(e.get("actor"))).containsEntry("name", "EDITOR");
        });
        List<Map<String, Object>> actors =
                asObjects(json(get("/api/groups/" + s.group() + "/audit/actors", s.token(Who.OWNER))
                                .body())
                        .get("items"));
        String editor = (String) actors.stream()
                .filter(a -> a.get("user") != null
                        && "EDITOR".equals(asObject(a.get("user")).get("name")))
                .findFirst()
                .orElseThrow()
                .get("id");
        assertThat(trail(s, "?actor=" + editor)).hasSize(3);
    }

    @Test
    void historyOfAContactShowsTheKeyNameAndWebChangesHaveNone() throws Exception {
        Scenario s = scenario();
        String key = keyFor(s, Who.EDITOR, Permission.WRITE, s.group());
        Map<String, Object> created = json(v1("POST", contactsV1(s.group()), key, body(input("Janez", "Novak")))
                .body());
        String id = (String) created.get("id");
        long version = ((Number) created.get("version")).longValue();
        assertThat(put(
                                contactPath(s.group(), id),
                                s.token(Who.EDITOR),
                                body(withVersion(input("Janez", "Web"), version)))
                        .statusCode())
                .isEqualTo(200);

        HttpResponse<String> history = get(contactPath(s.group(), id) + "/history", s.token(Who.VIEWER));

        assertThat(history.statusCode()).isEqualTo(200);
        List<Map<String, Object>> items = asObjects(json(history.body()).get("items"));
        assertThat(items).hasSize(2);
        assertThat(items.get(0)).containsEntry("apiKeyName", null);
        assertThat(items.get(1)).containsEntry("apiKeyName", KEY_NAME);
        assertThat(trail(s, "").getFirst()).containsEntry("apiKeyName", null);
    }

    @Test
    void deletingTheAccountMakesTheActorDeletedAndClearsTheKeyName() throws Exception {
        Scenario s = scenario();
        String key = keyFor(s, Who.EDITOR, Permission.WRITE, s.group());
        assertThat(v1("POST", contactsV1(s.group()), key, body(input("Janez", "Novak")))
                        .statusCode())
                .isEqualTo(201);
        assertThat(trail(s, "").getFirst()).containsEntry("apiKeyName", KEY_NAME);

        jdbc.update("delete from app_user where id = ?", s.id(Who.EDITOR));

        Map<String, Object> entry = trail(s, "").getFirst();
        assertThat(entry).containsEntry("actor", null).containsEntry("apiKeyName", null);
    }
}

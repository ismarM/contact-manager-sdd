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
 * Branje kontaktov prek API ključa (FR-019-07, -08): telo je enako kot v spletni aplikaciji za istega uporabnika, branje
 * v arhivirani skupini uspe in ne ustvari vnosa sledi.
 */
@Tag("FR-019-07")
@Tag("FR-019-08")
class ApiContactReadIT extends ApiV1Test {

    @Test
    void listBodyEqualsTheWebApplicationBodyForTheSameParameters() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 60);
        for (int i = 0; i < all.size(); i += 2) {
            contacts.addTags(all.get(i), "vip");
        }
        String key = keyFor(s, Who.VIEWER, Permission.READ, s.group());

        for (String query : List.of(
                "?q=Ime&tag=vip&size=50",
                "?q=Ime&tag=vip&size=50&page=1",
                "?sort=lastName&dir=desc&size=25&page=2",
                "")) {
            HttpResponse<String> web = get(contactsPath(s.group()) + query, s.token(Who.VIEWER));
            HttpResponse<String> api = v1("GET", contactsV1(s.group()) + query, key);

            assertThat(api.statusCode()).as(query).isEqualTo(200);
            assertThat(web.statusCode()).isEqualTo(200);
            assertThat(json(api.body())).as(query).isEqualTo(json(web.body()));
        }
        Map<String, Object> page = json(
                v1("GET", contactsV1(s.group()) + "?q=Ime&tag=vip&size=50", key).body());
        assertThat(((Number) page.get("total")).longValue()).isEqualTo(30);
        assertThat(asObjects(page.get("items"))).hasSize(30);
    }

    @Test
    void invalidListParametersGiveTheSameValidationErrorsAsTheWebApplication() throws Exception {
        Scenario s = scenario();
        String key = keyFor(s, Who.VIEWER, Permission.READ, s.group());

        HttpResponse<String> web = get(contactsPath(s.group()) + "?sort=nic&size=0", s.token(Who.VIEWER));
        HttpResponse<String> api = v1("GET", contactsV1(s.group()) + "?sort=nic&size=0", key);

        assertThat(api.statusCode()).isEqualTo(400);
        assertThat(json(api.body())).isEqualTo(json(web.body()));
    }

    @Test
    void oneContactEqualsTheWebApplicationContactWithTypesAndVersion() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Janez", "Novak");
        input.put("phone", "041 123 456");
        input.put("tags", List.of("vip"));
        input.put("attributes", List.of(Map.of("key", "kompetenca", "value", "web dev", "type", "OTHER")));
        Map<String, Object> created = createViaApi(s, input);
        String id = (String) created.get("id");
        String key = keyFor(s, Who.VIEWER, Permission.READ, s.group());

        HttpResponse<String> web = get(contactPath(s.group(), id), s.token(Who.VIEWER));
        HttpResponse<String> api = v1("GET", contactV1(s.group(), id), key);

        assertThat(api.statusCode()).isEqualTo(200);
        assertThat(json(api.body())).isEqualTo(json(web.body())).containsKey("version");
    }

    @Test
    void readingInAnArchivedGroupSucceedsAndWritesNoAuditEntry() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        groups.archive(s.group());
        String key = keyFor(s, Who.VIEWER, Permission.READ, s.group());
        Integer before =
                jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Integer.class, s.group());

        HttpResponse<String> list = v1("GET", contactsV1(s.group()), key);
        HttpResponse<String> one = v1("GET", contactV1(s.group(), contact), key);

        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(one.statusCode()).isEqualTo(200);
        Integer after =
                jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Integer.class, s.group());
        assertThat(after).isEqualTo(before);
    }
}

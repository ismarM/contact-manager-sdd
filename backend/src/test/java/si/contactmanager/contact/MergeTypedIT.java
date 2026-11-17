package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.MergeApiTest;

/** Združevanje preveri in normalizira vrednosti po tipu ključa (016, FR-016-26). */
@Tag("FR-016-26")
class MergeTypedIT extends MergeApiTest {

    private static List<Map<String, Object>> targets(Map<String, Object> a, Map<String, Object> b) {
        return List.of(
                contact(uuid(a), ((Number) a.get("version")).longValue()),
                contact(uuid(b), ((Number) b.get("version")).longValue()));
    }

    private Map<String, Object> phoneContact(Scenario s, String first, String phone) throws Exception {
        Map<String, Object> input = input(first, "Novak");
        input.put("attributes", List.of(Map.of("key", "mobilni", "type", "PHONE", "value", phone)));
        return createViaApi(s, input);
    }

    @Test
    void anInvalidValueForThePhoneKeyIsRejectedAndNothingChanges() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = phoneContact(s, "Ana", "041 123 456");
        Map<String, Object> b = phoneContact(s, "Ana", "031 765 432");
        Map<String, Object> result =
                result("Ana", "Novak", null, null, null, List.of(attribute("Mobilni", "ni telefon")), null);

        HttpResponse<String> response =
                merge(s.token(Who.EDITOR), s.group(), Map.of("contacts", targets(a, b), "result", result));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("result.attributes[0].value", "INVALID_VALUE");
        assertThat(contacts.count(s.group())).isEqualTo(2);
    }

    @Test
    void aValidValueIsNormalizedAndTheKeeperGetsTheKeyType() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = phoneContact(s, "Ana", "041 123 456");
        Map<String, Object> b = phoneContact(s, "Ana", "031 765 432");
        Map<String, Object> result =
                result("Ana", "Novak", null, null, "(031) 765-432", List.of(attribute("mobilni", "070 123 456")), null);

        HttpResponse<String> response =
                merge(s.token(Who.EDITOR), s.group(), Map.of("contacts", targets(a, b), "result", result));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        UUID keeper = UUID.fromString((String) json(response.body()).get("keptContactId"));
        assertThat(contacts.row(keeper).get("phone")).isEqualTo("+38631765432");
        assertThat(contacts.attributesOf(keeper))
                .extracting(r -> r.get("value"))
                .containsExactly("+38670123456");
    }
}

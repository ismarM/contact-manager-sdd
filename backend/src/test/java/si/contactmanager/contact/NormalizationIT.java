package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactApiTest;

/**
 * Normalizacija na strežniku (016, FR-016-02, -07, -08, -09): predefinirana polja {@code email} in {@code phone} ter
 * dodatni atributi po tipu; telefon po državi kontakta, neveljavna vrednost je {@code 400 INVALID_VALUE} z imenom
 * polja, stari nenormalizirani podatki se ob urejanju drugega polja ne dotaknejo, opombe so dobesedne.
 */
@Tag("FR-016-02")
@Tag("FR-016-07")
@Tag("FR-016-08")
@Tag("FR-016-09")
class NormalizationIT extends ContactApiTest {

    private static Map<String, Object> attribute(String key, String type, String value) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("key", key);
        row.put("type", type);
        row.put("value", value);
        return row;
    }

    private HttpResponse<String> create(Scenario s, Map<String, Object> input) throws Exception {
        return post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));
    }

    private HttpResponse<String> edit(Scenario s, UUID id, Map<String, Object> input) throws Exception {
        return put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(input, contacts.version(id))));
    }

    @Test
    void phoneAndEmailAreStoredInTheCanonicalForm() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Ana", "Novak");
        input.put("phone", "(041) 123-456");
        input.put("email", "  Ana.Novak@Primer.SI ");

        HttpResponse<String> response = create(s, input);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(json(response.body()).get("phone")).isEqualTo("+38641123456");
        assertThat(json(response.body()).get("email")).isEqualTo("Ana.Novak@primer.si");
    }

    @Test
    void thePhoneIsParsedAgainstTheCountryOfTheContact() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Hans", "Muster");
        input.put("country", "AT");
        input.put("phone", "0664 1234567");

        HttpResponse<String> response = create(s, input);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(json(response.body()).get("phone")).isEqualTo("+436641234567");
    }

    @Test
    void anInvalidPhoneIsRejectedWithTheFieldName() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Ana", "Novak");
        input.put("phone", "123 456 7");

        HttpResponse<String> response = create(s, input);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("phone", "INVALID_VALUE");
        assertThat(contacts.count(s.group())).isZero();
    }

    @Test
    void additionalAttributesAreNormalizedByType() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Ana", "Novak");
        input.put(
                "attributes",
                List.of(
                        attribute("Domača stran", "URL", "Primer.si/pot"),
                        attribute("Rojstni dan", "DATE", "1990-03-05"),
                        attribute("Pošta", "EMAIL", "A@B.SI"),
                        attribute("Opis", "NOTES", "  vrstica 1\nvrstica 2  ")));

        HttpResponse<String> response = create(s, input);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        Map<String, Object> byKey = new LinkedHashMap<>();
        for (Map<String, Object> row : asObjects(json(response.body()).get("attributes"))) {
            byKey.put((String) row.get("key"), row.get("value"));
        }
        assertThat(byKey.get("Domača stran")).isEqualTo("https://primer.si/pot");
        assertThat(byKey.get("Rojstni dan")).isEqualTo("1990-03-05");
        assertThat(byKey.get("Pošta")).isEqualTo("A@b.si");
        assertThat(byKey.get("Opis")).isEqualTo("  vrstica 1\nvrstica 2  ");
    }

    @Test
    void anOldNonNormalizedValueIsNotTouchedWhenAnotherFieldIsEdited() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Novak", "ANA@Primer.SI", "041 123 456", null);
        Map<String, Object> input = input("Ana", "Nova");
        input.put("email", "ANA@Primer.SI");
        input.put("phone", "041 123 456");

        HttpResponse<String> response = edit(s, id, input);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(json(response.body()).get("lastName")).isEqualTo("Nova");
        assertThat(json(response.body()).get("phone")).isEqualTo("041 123 456");
        assertThat(json(response.body()).get("email")).isEqualTo("ANA@Primer.SI");
    }

    @Test
    void aChangedValueIsNormalizedAndAnInvalidOneIsRejected() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Novak", null, "041 123 456", null);
        Map<String, Object> input = input("Ana", "Novak");
        input.put("phone", "031 765 432");

        HttpResponse<String> ok = edit(s, id, input);
        input.put("phone", "41 1");
        HttpResponse<String> bad = edit(s, id, input);

        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        assertThat(json(ok.body()).get("phone")).isEqualTo("+38631765432");
        assertThat(bad.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(bad.body())).containsEntry("phone", "INVALID_VALUE");
        assertThat(contacts.row(id).get("phone")).isEqualTo("+38631765432");
    }
}

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
 * Tip ključa pri ustvarjanju in urejanju kontakta (016, FR-016-01, -02, -04): nov ključ dobi tip iz vnosa, drugi
 * kontakt ga prevzame, drugačen tip za ključ v uporabi je {@code INVALID_VALUE}, vrednosti so po tipu preverjene in
 * normalizirane, opombe dobesedne, nespremenjena stara vrednost se ne preverja.
 */
@Tag("FR-016-01")
@Tag("FR-016-02")
@Tag("FR-016-04")
class ContactTypedAttributesIT extends ContactApiTest {

    private static Map<String, Object> attribute(String key, String type, String value) {
        Map<String, Object> attribute = new LinkedHashMap<>();
        attribute.put("key", key);
        if (type != null) {
            attribute.put("type", type);
        }
        attribute.put("value", value);
        return attribute;
    }

    private static Map<String, Object> withAttributes(String first, Map<String, Object> one) {
        return withAttributes(first, List.of(one));
    }

    private static Map<String, Object> withAttributes(String first, Map<String, Object> one, Map<String, Object> two) {
        return withAttributes(first, List.of(one, two));
    }

    private static Map<String, Object> withAttributes(String first, List<Map<String, Object>> attributes) {
        Map<String, Object> input = input(first, "Novak");
        input.put("attributes", attributes);
        return input;
    }

    private HttpResponse<String> create(Scenario s, Map<String, Object> input) throws Exception {
        return post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));
    }

    private String keyType(UUID group, String keyNorm) {
        return jdbc.queryForObject(
                "select type from attribute_key where group_id = ? and key_norm = ?", String.class, group, keyNorm);
    }

    @Test
    void aNewKeyTakesTheTypeFromTheInputAndTheValueIsNormalized() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = create(s, withAttributes("Ana", attribute("Mobilni", "PHONE", "041 123 456")));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(asObjects(json(response.body()).get("attributes")))
                .containsExactly(Map.of("key", "Mobilni", "type", "PHONE", "value", "+38641123456"));
        assertThat(keyType(s.group(), "mobilni")).isEqualTo("PHONE");
    }

    @Test
    void theSecondContactTakesTheTypeOfTheKeyWithoutNamingIt() throws Exception {
        Scenario s = scenario();
        assertThat(create(s, withAttributes("Ana", attribute("Mobilni", "PHONE", "041 123 456")))
                        .statusCode())
                .isEqualTo(201);

        HttpResponse<String> response = create(s, withAttributes("Bojan", attribute("MOBILNI", null, "031 765 432")));

        assertThat(response.statusCode()).isEqualTo(201);
        // Zapis ključa je kanoničen (013), tip je tip ključa, vrednost normalizirana.
        assertThat(asObjects(json(response.body()).get("attributes")))
                .containsExactly(Map.of("key", "Mobilni", "type", "PHONE", "value", "+38631765432"));
    }

    @Test
    void aDifferentTypeForAKeyInUseIsInvalidAndNothingIsSaved() throws Exception {
        Scenario s = scenario();
        assertThat(create(s, withAttributes("Ana", attribute("Mobilni", "PHONE", "041 123 456")))
                        .statusCode())
                .isEqualTo(201);

        HttpResponse<String> response =
                create(s, withAttributes("Bojan", attribute("mobilni", "EMAIL", "b@primer.si")));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("attributes[0].type", "INVALID_VALUE");
        assertThat(contacts.count(s.group())).isEqualTo(1);
        assertThat(keyType(s.group(), "mobilni")).isEqualTo("PHONE");
    }

    @Test
    void anUnknownTypeAndAnInvalidValueAreFieldErrors() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> unknown = create(s, withAttributes("Ana", attribute("x", "NEZNAN", "v")));
        HttpResponse<String> invalid = create(
                s,
                withAttributes(
                        "Ana", attribute("pošta", "EMAIL", "ni-e-naslov"), attribute("datum", "DATE", "31.2.2025")));

        assertThat(unknown.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(unknown.body())).containsEntry("attributes[0].type", "INVALID_VALUE");
        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(invalid.body()))
                .containsEntry("attributes[0].value", "INVALID_VALUE")
                .containsEntry("attributes[1].value", "INVALID_VALUE");
        assertThat(contacts.count(s.group())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from attribute_key where group_id = ?", Long.class, s.group()))
                .isZero();
    }

    @Test
    void notesAreKeptLiterallyAndOtherValuesAreTrimmed() throws Exception {
        Scenario s = scenario();
        String notes = "  prva vrstica\n\n    druga vrstica  ";

        HttpResponse<String> response = create(
                s,
                withAttributes("Ana", attribute("Opomba", "NOTES", notes), attribute("Drugo", null, "  vrednost  ")));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(asObjects(json(response.body()).get("attributes")))
                .containsExactly(
                        Map.of("key", "Opomba", "type", "NOTES", "value", notes),
                        Map.of("key", "Drugo", "type", "OTHER", "value", "vrednost"));
    }

    @Test
    void updateKeepsTypesAndAnUnchangedOldValueIsNotRevalidated() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created =
                createViaApi(s, withAttributes("Ana", attribute("Pošta", "EMAIL", "a@primer.si")));
        UUID id = UUID.fromString((String) created.get("id"));
        // Vrednost, ki jo je kontakt dobil pred 016 (ni kanonična za svoj tip), ostane ob urejanju drugega polja.
        jdbc.update("update contact_attribute set value = 'Ana@PRIMER.si' where contact_id = ?", id);
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("firstName", "Ana");
        change.put("lastName", "Novak");
        change.put("company", "FERI");
        change.put("attributes", List.of(attribute("Pošta", null, "Ana@PRIMER.si")));
        change.put("version", 0);

        HttpResponse<String> response = put(contactPath(s.group(), id), s.token(Who.EDITOR), body(change));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(response.body()).get("attributes")))
                .containsExactly(Map.of("key", "Pošta", "type", "EMAIL", "value", "Ana@PRIMER.si"));
        assertThat(json(response.body())).containsEntry("version", 1).containsEntry("company", "FERI");
    }

    @Test
    void updateWithATypeForAnExistingKeyOrABadValueIsRefusedAfterTheVersionCheck() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created =
                createViaApi(s, withAttributes("Ana", attribute("Pošta", "EMAIL", "a@primer.si")));
        UUID id = UUID.fromString((String) created.get("id"));
        Map<String, Object> mismatch = withAttributes("Ana", attribute("Pošta", "PHONE", "041 123 456"));
        Map<String, Object> bad = withAttributes("Ana", attribute("Pošta", null, "ni-e-naslov"));

        HttpResponse<String> typeMismatch =
                put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(mismatch, 0)));
        HttpResponse<String> badValue = put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(bad, 0)));
        HttpResponse<String> stale = put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(bad, 5)));

        assertThat(typeMismatch.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(typeMismatch.body())).containsEntry("attributes[0].type", "INVALID_VALUE");
        assertThat(badValue.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(badValue.body())).containsEntry("attributes[0].value", "INVALID_VALUE");
        // Zastarela verzija ima prednost pred neveljavnimi podatki (§2.2); trenutno stanje nosi tipe.
        assertThat(stale.statusCode()).isEqualTo(409);
        Map<String, Object> conflict = json(stale.body());
        assertThat(conflict).containsEntry("code", "VERSION_CONFLICT");
        assertThat(asObjects(asObject(conflict.get("current")).get("attributes")))
                .containsExactly(Map.of("key", "Pošta", "type", "EMAIL", "value", "a@primer.si"));
    }

    @Test
    void keySuggestionsCarryTheKeyType() throws Exception {
        Scenario s = scenario();
        createViaApi(
                s, withAttributes("Ana", attribute("Mobilni", "PHONE", "041 123 456"), attribute("Opis", null, "x")));

        HttpResponse<String> response = get("/api/groups/" + s.group() + "/suggestions?type=key", s.token(Who.EDITOR));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(response.body()).get("items")))
                .containsExactlyInAnyOrder(
                        Map.of("text", "Mobilni", "count", 1, "attributeType", "PHONE"),
                        Map.of("text", "Opis", "count", 1, "attributeType", "OTHER"));
    }

    @Test
    void aFreeKeyTakesTheNewTypeWhenNoContactUsesIt() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created =
                createViaApi(s, withAttributes("Ana", attribute("Pošta", "EMAIL", "a@primer.si")));
        UUID id = UUID.fromString((String) created.get("id"));
        Map<String, Object> removal = input("Ana", "Novak");
        removal.put("attributes", List.of());
        assertThat(put(contactPath(s.group(), id), s.token(Who.EDITOR), body(withVersion(removal, 0)))
                        .statusCode())
                .isEqualTo(200);

        HttpResponse<String> response = create(s, withAttributes("Bojan", attribute("pošta", "URL", "primer.si")));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(keyType(s.group(), "pošta")).isEqualTo("URL");
        assertThat(asObjects(json(response.body()).get("attributes")).get(0)).containsEntry("type", "URL");
    }
}

package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.audit.support.TypedAuditApiTest;

/**
 * Obnova enega kontakta in tipi ključev (016, FR-016-26): vrednosti iz posnetka morajo biti veljavne za trenutni tip
 * ključa (sicer {@code 400 VALIDATION_FAILED} ob atributu in nič se ne spremeni), prost ključ prevzame tip iz
 * posnetka, deli naslova se obnovijo dobesedno.
 */
@Tag("FR-016-26")
@Tag("FR-015-12")
class RestoreTypedIT extends TypedAuditApiTest {

    private Map<String, Object> rename(Scenario s, UUID contact, String firstName) throws Exception {
        Map<String, Object> current = detail(s, contact);
        Map<String, Object> values = valuesOf(current);
        values.put("firstName", firstName);
        return update(s, Who.EDITOR, contact, values, versionOf(current));
    }

    @Test
    void aValueThatIsInvalidForTheCurrentKeyTypeIsRefusedAndNothingChanges() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = createWithAttribute(s, "Ana", "Mobilni", "ni telefon");
        UUID contact = idOf(created);
        UUID first = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, Object> values = valuesOf(created);
        values.put("attributes", List.of(Map.of("key", "Mobilni", "value", "041 123 456")));
        update(s, Who.EDITOR, contact, values, versionOf(created));
        changeTypeOk(s, "mobilni", "PHONE", 0);
        long version = versionOf(detail(s, contact));
        Map<String, Object> rowBefore = contacts.row(contact);
        int entries = audit.count(s.group());

        Map<String, Object> preview = json(get(previewPath(s.group(), contact) + "?from=" + first, s.token(Who.VIEWER))
                .body());
        HttpResponse<String> response = restore(s, Who.EDITOR, contact, restoreBody(first, version));

        assertThat(preview.get("restorable")).isEqualTo(false);
        assertThat(preview.get("reason")).isEqualTo("INVALID_STATE");
        assertThat(asObjects(preview.get("violations"))).singleElement().satisfies(v -> {
            assertThat(v.get("field")).isEqualTo("attributes[0].value");
            assertThat(v.get("code")).isEqualTo("INVALID_VALUE");
        });
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body())).containsEntry("attributes[0].value", "INVALID_VALUE");
        assertThat(contacts.row(contact)).isEqualTo(rowBefore);
        assertThat(audit.count(s.group())).isEqualTo(entries);
        assertThat(keyType(s, "mobilni")).isEqualTo("PHONE");
    }

    @Test
    void aValidValueIsWrittenInTheFormOfTheCurrentTypeWithTheOtherFieldsRestored() throws Exception {
        Scenario s = scenario();
        UUID contact = idOf(createWithAttribute(s, "Ana", "Mobilni", "041 123 456"));
        UUID first = (UUID) audit.entries(s.group()).get(0).get("id");
        changeTypeOk(s, "mobilni", "PHONE", 0);
        Map<String, Object> renamed = rename(s, contact, "Anica");

        HttpResponse<String> response = restore(s, Who.EDITOR, contact, restoreBody(first, versionOf(renamed)));

        assertThat(response.statusCode()).isEqualTo(201);
        Map<String, Object> restored = detail(s, contact);
        assertThat(restored).containsEntry("firstName", "Ana");
        assertThat(attributeOf(restored, "Mobilni"))
                .containsEntry("type", "PHONE")
                .containsEntry("value", "+38641123456");
        assertThat(keyType(s, "mobilni")).isEqualTo("PHONE");
    }

    @Test
    void aFreeKeyTakesTheTypeFromTheSnapshot() throws Exception {
        Scenario s = scenario();
        Map<String, Object> ana = createTyped(s, "Ana", "Faks", "PHONE", "041 123 456");
        UUID first = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, Object> values = valuesOf(ana);
        values.put("attributes", List.of());
        Map<String, Object> without = update(s, Who.EDITOR, idOf(ana), values, versionOf(ana));
        Map<String, Object> bor = createTyped(s, "Bor", "Faks", "EMAIL", "bor@primer.si");
        remove(s, Who.EDITOR, idOf(bor), versionOf(bor));
        assertThat(keyType(s, "faks")).isEqualTo("EMAIL");

        HttpResponse<String> response = restore(s, Who.EDITOR, idOf(ana), restoreBody(first, versionOf(without)));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(keyType(s, "faks")).isEqualTo("PHONE");
        assertThat(attributeOf(detail(s, idOf(ana)), "Faks"))
                .containsEntry("type", "PHONE")
                .containsEntry("value", "+38641123456");
    }

    @Test
    void addressPartsAreRestoredLiterally() throws Exception {
        Scenario s = scenario();
        Map<String, Object> parts =
                Map.of("street", "Trg 1", "postalCode", "1000", "city", "Ljubljana", "country", "SI");
        Map<String, Object> home = Map.of("street", "Cesta 2", "city", "Maribor");
        Map<String, Object> input = input("Ana", "Naslov");
        input.put("addressParts", parts);
        input.put("attributes", List.of(Map.of("key", "Domov", "type", "ADDRESS", "parts", home)));
        Map<String, Object> created = create(s, Who.EDITOR, input);
        UUID contact = idOf(created);
        UUID first = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, Object> values = valuesOf(created);
        values.remove("addressParts");
        values.put("address", "Drugje 5");
        values.put("attributes", List.of());
        Map<String, Object> edited = update(s, Who.EDITOR, contact, values, versionOf(created));

        HttpResponse<String> response = restore(s, Who.EDITOR, contact, restoreBody(first, versionOf(edited)));

        assertThat(response.statusCode()).isEqualTo(201);
        Map<String, Object> restored = detail(s, contact);
        assertThat(asObject(restored.get("addressParts"))).isEqualTo(parts);
        assertThat(attributeOf(restored, "Domov"))
                .containsEntry("type", "ADDRESS")
                .containsEntry("parts", home);
    }
}

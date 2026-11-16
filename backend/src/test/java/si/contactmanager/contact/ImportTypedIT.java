package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ImportApiTest;

/**
 * Tipi v uvozu (016, FR-016-24): obstoječi ključ uporabi svoj tip, nov ključ dobi izbrani tip, stolpci naslova sestavijo
 * strukturiran naslov, en stolpec v tipu <i>Naslov</i> ostane nerazčlenjen, vrednosti, neveljavne za tip, so napake
 * vrstic (predogled) oziroma zavrnejo potrditev brez zapisa (014 R-04).
 */
@Tag("FR-016-24")
class ImportTypedIT extends ImportApiTest {

    private static Map<String, Object> attribute(String key, String type, Object value) {
        Map<String, Object> attribute = new LinkedHashMap<>();
        attribute.put("key", key);
        if (type != null) {
            attribute.put("type", type);
        }
        attribute.put("value", value);
        return attribute;
    }

    private static Map<String, Object> withAttributes(String first, Map<String, Object> attribute) {
        Map<String, Object> contact = person(first, "Uvoz");
        contact.put("attributes", List.of(attribute));
        return contact;
    }

    private String keyType(Scenario s, String keyNorm) {
        return jdbc.queryForObject(
                "select type from attribute_key where group_id = ? and key_norm = ?", String.class, s.group(), keyNorm);
    }

    @Test
    void anExistingKeyKeepsItsTypeAndValuesAreNormalized() throws Exception {
        Scenario s = scenario();
        Map<String, Object> existing = person("Ana", "Kos");
        existing.put("attributes", List.of(attribute("Mobilni", "PHONE", "041 123 456")));
        createViaApi(s, existing);
        Map<String, Object> row = withAttributes("Bor", attribute("mobilni", null, "041 555 666"));

        HttpResponse<String> preview = preview(s.token(Who.EDITOR), s.group(), List.of(row));
        HttpResponse<String> commit = commit(s.token(Who.EDITOR), s.group(), "XLSX", List.of(row));

        assertThat(preview.statusCode()).as(preview.body()).isEqualTo(200);
        Map<String, Object> previewRow =
                asObjects(json(preview.body()).get("rows")).get(0);
        assertThat(asObjects(previewRow.get("errors"))).isEmpty();
        Map<String, Object> normalized = asObject(previewRow.get("normalized"));
        assertThat(asObjects(normalized.get("attributes")))
                .containsExactly(Map.of("key", "Mobilni", "type", "PHONE", "value", "+38641555666"));
        assertThat(commit.statusCode()).as(commit.body()).isEqualTo(201);
        assertThat(jdbc.queryForObject(
                        "select a.value from contact_attribute a join contact c on c.id = a.contact_id"
                                + " where c.group_id = ? and c.first_name = 'Bor'",
                        String.class,
                        s.group()))
                .isEqualTo("+38641555666");
        assertThat(keyType(s, "mobilni")).isEqualTo("PHONE");
    }

    @Test
    void aNewKeyGetsTheChosenTypeAndTheTypeAppliesToEveryRow() throws Exception {
        Scenario s = scenario();
        List<Map<String, Object>> rows = List.of(
                withAttributes("Ana", attribute("Delovna pošta", "EMAIL", "Ana@Primer.SI")),
                withAttributes("Bor", attribute("Delovna pošta", null, "bor@primer.si")));

        HttpResponse<String> commit = commit(s.token(Who.EDITOR), s.group(), "XLSX", rows);

        assertThat(commit.statusCode()).as(commit.body()).isEqualTo(201);
        assertThat(keyType(s, "delovna pošta")).isEqualTo("EMAIL");
        assertThat(jdbc.queryForList(
                        "select a.value from contact_attribute a join contact c on c.id = a.contact_id"
                                + " where c.group_id = ? order by a.value",
                        String.class,
                        s.group()))
                .containsExactly("Ana@primer.si", "bor@primer.si");
    }

    @Test
    void aTypeThatDiffersFromTheTypeOfAKeyInUseIsARowErrorAndRefusesTheCommit() throws Exception {
        Scenario s = scenario();
        Map<String, Object> existing = person("Ana", "Kos");
        existing.put("attributes", List.of(attribute("Mobilni", "PHONE", "041 123 456")));
        createViaApi(s, existing);
        Map<String, Object> row = withAttributes("Bor", attribute("Mobilni", "EMAIL", "041 555 666"));

        HttpResponse<String> preview = preview(s.token(Who.EDITOR), s.group(), List.of(row));
        HttpResponse<String> commit = commit(s.token(Who.EDITOR), s.group(), "XLSX", List.of(row));

        assertThat(asObjects(asObjects(json(preview.body()).get("rows")).get(0).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].type", "code", "INVALID_VALUE"));
        assertThat(commit.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(commit.body())).containsEntry("contacts[0].attributes[0].type", "INVALID_VALUE");
        assertThat(contacts.count(s.group())).isEqualTo(1);
    }

    @Test
    void aValueThatIsInvalidForTheTypeIsARowErrorOtherRowsStayValid() throws Exception {
        Scenario s = scenario();
        List<Map<String, Object>> rows = List.of(
                withAttributes("Ana", attribute("Mobilni", "PHONE", "ni telefon")),
                withAttributes("Bor", attribute("Mobilni", "PHONE", "041 555 666")),
                withAttributes("Cene", attribute("Rojstvo", "DATE", "31.2.2020")));

        HttpResponse<String> preview = preview(s.token(Who.EDITOR), s.group(), rows);
        HttpResponse<String> commit = commit(s.token(Who.EDITOR), s.group(), "XLSX", rows);

        List<Map<String, Object>> result = asObjects(json(preview.body()).get("rows"));
        assertThat(asObjects(result.get(0).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].value", "code", "INVALID_VALUE"));
        assertThat(asObjects(result.get(1).get("errors"))).isEmpty();
        assertThat(asObjects(result.get(2).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].value", "code", "INVALID_VALUE"));
        assertThat(commit.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(commit.body()))
                .containsEntry("contacts[0].attributes[0].value", "INVALID_VALUE")
                .containsEntry("contacts[2].attributes[0].value", "INVALID_VALUE")
                .doesNotContainKey("contacts[1].attributes[0].value");
        assertThat(contacts.count(s.group())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from attribute_key where group_id = ?", Long.class, s.group()))
                .isZero();
    }

    @Test
    void addressColumnsBuildAStructuredAddressAndAnAddressKeyKeepsItsParts() throws Exception {
        Scenario s = scenario();
        Map<String, Object> row = person("Ana", "Kos");
        row.put("addressParts", Map.of("street", "Trg 1", "postalCode", "1000", "city", "Ljubljana", "country", "SI"));
        Map<String, Object> work = new LinkedHashMap<>();
        work.put("key", "Delovni naslov");
        work.put("parts", Map.of("street", "Cesta 2", "postalCode", "2000 ", "city", "Maribor"));
        work.put("value", "");
        row.put("attributes", List.of(work));

        HttpResponse<String> commit = commit(s.token(Who.EDITOR), s.group(), "XLSX", List.of(row));

        assertThat(commit.statusCode()).as(commit.body()).isEqualTo(201);
        Map<String, Object> stored = jdbc.queryForMap(
                "select c.address, c.address_parts::text as parts from contact c where c.group_id = ?", s.group());
        assertThat(stored.get("address")).isNull();
        assertThat((String) stored.get("parts"))
                .contains("\"street\": \"Trg 1\"")
                .contains("\"city\": \"Ljubljana\"");
        assertThat(keyType(s, "delovni naslov")).isEqualTo("ADDRESS");
        assertThat(jdbc.queryForObject(
                        "select a.parts::text from contact_attribute a join contact c on c.id = a.contact_id"
                                + " where c.group_id = ?",
                        String.class,
                        s.group()))
                .contains("\"postalCode\": \"2000\"")
                .contains("\"city\": \"Maribor\"");
    }

    @Test
    void oneColumnMappedToTheWholeAddressImportsAnUnparsedAddress() throws Exception {
        Scenario s = scenario();
        Map<String, Object> row = withAttributes("Ana", attribute("Dom", "ADDRESS", "Trg 1, 1000 Ljubljana"));

        HttpResponse<String> commit = commit(s.token(Who.EDITOR), s.group(), "XLSX", List.of(row));

        assertThat(commit.statusCode()).as(commit.body()).isEqualTo(201);
        assertThat(keyType(s, "dom")).isEqualTo("ADDRESS");
        assertThat(jdbc.queryForMap(
                        "select a.value, a.parts from contact_attribute a join contact c on c.id = a.contact_id"
                                + " where c.group_id = ?",
                        s.group()))
                .containsEntry("value", "Trg 1, 1000 Ljubljana")
                .containsEntry("parts", null);
    }

    @Test
    void invalidAddressPartsAreRowErrors() throws Exception {
        Scenario s = scenario();
        Map<String, Object> row = person("Ana", "Kos");
        row.put("addressParts", Map.of("postalCode", "1000"));
        Map<String, Object> other = person("Bor", "Zupan");
        other.put("addressParts", Map.of("street", "Trg 1", "country", "XX"));

        HttpResponse<String> preview = preview(s.token(Who.EDITOR), s.group(), List.of(row, other));

        List<Map<String, Object>> result = asObjects(json(preview.body()).get("rows"));
        assertThat(asObjects(result.get(0).get("errors")))
                .containsExactly(Map.of("field", "addressParts.street", "code", "REQUIRED"));
        assertThat(asObjects(result.get(1).get("errors")))
                .containsExactly(Map.of("field", "addressParts.country", "code", "INVALID_VALUE"));
    }

    @Test
    void aTypedImportIsRecordedAsOneEntryAndDoesNotTouchAnotherGroup() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        Map<String, Object> row = withAttributes("Ana", attribute("Mobilni", "PHONE", "041 123 456"));

        HttpResponse<String> commit = commit(s.token(Who.EDITOR), s.group(), "XLSX", List.of(row));

        assertThat(commit.statusCode()).isEqualTo(201);
        assertThat(jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Long.class, s.group()))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from attribute_key where group_id = ?", Long.class, other))
                .isZero();
    }
}

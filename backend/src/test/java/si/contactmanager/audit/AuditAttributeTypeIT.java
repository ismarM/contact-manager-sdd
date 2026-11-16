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
 * Tipi in deli naslova v sledi, zgodovini in primerjavi (016, FR-016-26): vnos {@code ATTRIBUTE_TYPE} s ključem in
 * tipoma (filter, vnos, spremembe), atribut v spremembah nosi tip in vrednost ali dele.
 */
@Tag("FR-016-26")
class AuditAttributeTypeIT extends TypedAuditApiTest {

    private static final Map<String, Object> PARTS =
            Map.of("street", "Trg 1", "postalCode", "1000", "city", "Ljubljana", "country", "SI");

    @Test
    void theTypeChangeIsOneFilterableEntryWithKeyAndBothTypes() throws Exception {
        Scenario s = scenario();
        createWithAttribute(s, "Ana", "Mobilni", "041 123 456");
        UUID entry = changeTypeOk(s, "mobilni", "PHONE", 0);

        Map<String, Object> page =
                json(list(s, Who.VIEWER, "?action=ATTRIBUTE_TYPE").body());

        assertThat(page).containsEntry("total", 1);
        Map<String, Object> item = asObjects(page.get("items")).get(0);
        assertThat(item)
                .containsEntry("id", entry.toString())
                .containsEntry("action", "ATTRIBUTE_TYPE")
                .containsEntry("contactCount", 1)
                .containsEntry("attributeKey", "Mobilni")
                .containsEntry("typeBefore", "OTHER")
                .containsEntry("typeAfter", "PHONE");
        Map<String, Object> others = json(list(s, Who.VIEWER, "?action=CREATE").body());
        assertThat(others).containsEntry("total", 1);
        assertThat(asObjects(others.get("items")).get(0)).doesNotContainKeys("attributeKey", "typeBefore", "typeAfter");
    }

    @Test
    void theEntryAndItsChangesShowTypeAndValueBeforeAndAfter() throws Exception {
        Scenario s = scenario();
        createWithAttribute(s, "Ana", "Mobilni", "041 123 456");
        UUID entry = changeTypeOk(s, "mobilni", "PHONE", 0);

        HttpResponse<String> single = get(entryPath(s.group(), entry), s.token(Who.VIEWER));
        HttpResponse<String> changes = get(entryPath(s.group(), entry) + "/changes", s.token(Who.VIEWER));

        assertThat(single.statusCode()).isEqualTo(200);
        assertThat(json(single.body())).containsEntry("attributeKey", "Mobilni").containsEntry("typeAfter", "PHONE");
        assertThat(changes.statusCode()).isEqualTo(200);
        Map<String, Object> change =
                asObjects(json(changes.body()).get("items")).get(0);
        assertThat(change).containsEntry("kind", "CHANGED");
        List<Map<String, Object>> fields = asObjects(change.get("fields"));
        assertThat(fields).hasSize(1);
        assertThat(fields.get(0))
                .containsEntry("field", "ATTRIBUTE")
                .containsEntry("key", "Mobilni")
                .containsEntry("before", Map.of("type", "OTHER", "value", "041 123 456"))
                .containsEntry("after", Map.of("type", "PHONE", "value", "+38641123456"));
    }

    @Test
    void historyVersionsAndComparisonCarryTypes() throws Exception {
        Scenario s = scenario();
        UUID contact = idOf(createWithAttribute(s, "Ana", "Mobilni", "041 123 456"));
        UUID created = (UUID) audit.entries(s.group()).get(0).get("id");
        UUID typed = changeTypeOk(s, "mobilni", "PHONE", 0);

        Map<String, Object> history = history(s, Who.VIEWER, contact, "");
        List<Map<String, Object>> events = asObjects(history.get("items"));
        assertThat(events).extracting(e -> e.get("action")).containsExactly("ATTRIBUTE_TYPE", "CREATE");
        Map<String, Object> field = asObjects(events.get(0).get("fields")).get(0);
        assertThat(field.get("after")).isEqualTo(Map.of("type", "PHONE", "value", "+38641123456"));
        Map<String, Object> createdField = asObjects(events.get(1).get("fields")).stream()
                .filter(f -> "ATTRIBUTE".equals(f.get("field")))
                .findFirst()
                .orElseThrow();
        assertThat(createdField.get("before")).isNull();
        assertThat(createdField.get("after")).isEqualTo(Map.of("type", "OTHER", "value", "041 123 456"));

        Map<String, Object> version = json(get(versionPath(s.group(), contact, created), s.token(Who.VIEWER))
                .body());
        assertThat(asObjects(asObject(version.get("state")).get("attributes")))
                .containsExactly(Map.of("key", "Mobilni", "type", "OTHER", "value", "041 123 456"));
        Map<String, Object> compare =
                json(get(comparePath(s.group(), contact) + "?from=" + created + "&to=" + typed, s.token(Who.VIEWER))
                        .body());
        assertThat(asObjects(compare.get("changes")).get(0))
                .containsEntry("field", "ATTRIBUTE")
                .containsEntry("before", Map.of("type", "OTHER", "value", "041 123 456"))
                .containsEntry("after", Map.of("type", "PHONE", "value", "+38641123456"));
    }

    @Test
    void addressPartsAreReportedAsPartsInTheTraceAndVersions() throws Exception {
        Scenario s = scenario();
        Map<String, Object> cesta = Map.of("street", "Cesta 2", "city", "Maribor");
        Map<String, Object> input = input("Ana", "Naslov");
        input.put("addressParts", PARTS);
        input.put("attributes", List.of(Map.of("key", "Domov", "type", "ADDRESS", "parts", cesta)));
        UUID contact = idOf(create(s, Who.EDITOR, input));
        UUID entry = (UUID) audit.entries(s.group()).get(0).get("id");

        Map<String, Object> change = asObjects(json(get(entryPath(s.group(), entry) + "/changes", s.token(Who.VIEWER))
                                .body())
                        .get("items"))
                .get(0);

        List<Map<String, Object>> fields = asObjects(change.get("fields"));
        Map<String, Object> address = fields.stream()
                .filter(f -> "ADDRESS".equals(f.get("field")))
                .findFirst()
                .orElseThrow();
        assertThat(address.get("after")).isEqualTo(PARTS);
        Map<String, Object> attribute = fields.stream()
                .filter(f -> "ATTRIBUTE".equals(f.get("field")))
                .findFirst()
                .orElseThrow();
        assertThat(attribute.get("after")).isEqualTo(Map.of("type", "ADDRESS", "parts", cesta));
        Map<String, Object> version = json(
                get(versionPath(s.group(), contact, entry), s.token(Who.VIEWER)).body());
        assertThat(asObject(asObject(version.get("state")).get("addressParts"))).isEqualTo(PARTS);
    }
}

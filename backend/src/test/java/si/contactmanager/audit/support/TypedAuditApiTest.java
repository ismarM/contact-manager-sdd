package si.contactmanager.audit.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Pomočniki testov sledi, zgodovine, rollbacka in obnove s tipiziranimi atributi (016, FR-016-26). */
public abstract class TypedAuditApiTest extends HistoryApiTest {

    /** Kontakt z enim atributom brez navedenega tipa (nov ključ je {@code OTHER}) kot urednik. */
    protected Map<String, Object> createWithAttribute(Scenario s, String first, String key, String value)
            throws Exception {
        Map<String, Object> input = input(first, "Kontakt");
        input.put("attributes", List.of(Map.of("key", key, "value", value)));
        return create(s, Who.EDITOR, input);
    }

    /** Kontakt z atributom izbranega tipa (za nov ali prost ključ). */
    protected Map<String, Object> createTyped(Scenario s, String first, String key, String type, String value)
            throws Exception {
        Map<String, Object> input = input(first, "Kontakt");
        input.put("attributes", List.of(Map.of("key", key, "type", type, "value", value)));
        return create(s, Who.EDITOR, input);
    }

    protected HttpResponse<String> changeType(Scenario s, Who who, String key, String type, long version)
            throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("key", key);
        body.put("type", type);
        body.put("version", version);
        return post("/api/groups/" + s.group() + "/attribute-keys/change-type", s.token(who), body(body));
    }

    /** Sprememba tipa mora uspeti; vrne id novega vnosa sledi. */
    protected UUID changeTypeOk(Scenario s, String key, String type, long version) throws Exception {
        HttpResponse<String> response = changeType(s, Who.EDITOR, key, type, version);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return audit.latestEntryId(s.group());
    }

    protected String keyType(Scenario s, String keyNorm) {
        return jdbc.queryForObject(
                "select type from attribute_key where group_id = ? and key_norm = ?", String.class, s.group(), keyNorm);
    }

    protected Map<String, Object> detail(Scenario s, UUID contact) throws Exception {
        HttpResponse<String> response = get(contactPath(s.group(), contact), s.token(Who.VIEWER));
        assertThat(response.statusCode()).isEqualTo(200);
        return json(response.body());
    }

    protected Map<String, Object> attributeOf(Map<String, Object> detail, String key) {
        return asObjects(detail.get("attributes")).stream()
                .filter(a -> key.equals(a.get("key")))
                .findFirst()
                .orElseThrow();
    }
}

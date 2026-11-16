package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.BulkApiTest;

/**
 * Množično nastavljanje atributa s tipom (016, FR-016-06): obstoječ ključ uporabi svoj tip, nov ključ dobi {@code type}
 * iz zahtevka, vrednost se normalizira po tipu in državi vsakega kontakta; ena neveljavna vrednost zavrne celotno
 * operacijo in nič se ne spremeni.
 */
@Tag("FR-016-06")
class BulkTypedAttributeIT extends BulkApiTest {

    private static Map<String, Object> typedSet(String key, String type, String value) {
        Map<String, Object> row = new LinkedHashMap<>(attributeSet("custom", key, value));
        if (type != null) {
            row.put("type", type);
        }
        return row;
    }

    private int keyRows(UUID group) {
        return jdbc.queryForObject("select count(*) from attribute_key where group_id = ?", Integer.class, group);
    }

    @Test
    void aNewKeyTakesTheRequestedTypeAndEveryValueIsNormalized() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 3);

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(ids, "attributes", List.of(typedSet("Mobilni", "PHONE", "041 123 456"))));

        assertThat(response.statusCode()).isEqualTo(200);
        for (UUID id : ids) {
            assertThat(contacts.attributesOf(id)).containsExactly(Map.of("key", "Mobilni", "value", "+38641123456"));
        }
        assertThat(jdbc.queryForObject(
                        "select type from attribute_key where group_id = ? and key_norm = 'mobilni'",
                        String.class,
                        s.group()))
                .isEqualTo("PHONE");
    }

    @Test
    void anExistingKeyKeepsItsTypeWithoutNamingIt() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 2);
        jdbc.update("insert into attribute_key (group_id, key_norm, type) values (?, 'pošta', 'EMAIL')", s.group());
        contacts.addAttribute(ids.get(0), 0, "Pošta", "stara@primer.si");

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(ids, "attributes", List.of(attributeSet("custom", "pošta", "Nova@Primer.SI"))));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(contacts.attributesOf(ids.get(0)))
                .containsExactly(Map.of("key", "Pošta", "value", "Nova@primer.si"));
        assertThat(contacts.attributesOf(ids.get(1)))
                .containsExactly(Map.of("key", "Pošta", "value", "Nova@primer.si"));
    }

    @Test
    void oneInvalidValueRejectsTheWholeOperationAndNothingChanges() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 3);
        long versionBefore = contacts.version(ids.get(0));

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(ids, "attributes", List.of(typedSet("Datum", "DATE", "31.2.2025"))));

        assertThat(response.statusCode()).isEqualTo(400);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "VALIDATION_FAILED");
        List<Map<String, Object>> perContact = asObjects(body.get("contacts"));
        assertThat(perContact).hasSize(3);
        assertThat(asObjects(perContact.get(0).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].value", "code", "INVALID_VALUE"));
        for (UUID id : ids) {
            assertThat(contacts.attributeRows(id)).isZero();
        }
        assertThat(contacts.version(ids.get(0))).isEqualTo(versionBefore);
        assertThat(keyRows(s.group())).isZero();
        assertThat(audit.count(s.group())).isZero();
    }

    @Test
    void aTypeDifferentFromTheTypeOfAKeyInUseIsARequestError() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 2);
        jdbc.update("insert into attribute_key (group_id, key_norm, type) values (?, 'pošta', 'EMAIL')", s.group());
        contacts.addAttribute(ids.get(0), 0, "pošta", "a@primer.si");

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(ids, "attributes", List.of(typedSet("pošta", "PHONE", "041 123 456"))));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].type", "code", "INVALID_VALUE"));
        assertThat(contacts.attributesOf(ids.get(0))).containsExactly(Map.of("key", "pošta", "value", "a@primer.si"));
        assertThat(contacts.attributeRows(ids.get(1))).isZero();
    }

    @Test
    void anUnknownTypeIsRefused() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 1);

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR), s.group(), request(ids, "attributes", List.of(typedSet("x", "NEZNAN", "v"))));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].type", "code", "INVALID_VALUE"));
        assertThat(keyRows(s.group())).isZero();
    }

    private static Map<String, Object> partsSet(String field, String key, Map<String, Object> parts) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("field", field);
        if (key != null) {
            row.put("key", key);
        }
        row.put("parts", parts);
        return row;
    }

    private String addressPartsOf(UUID id) {
        return jdbc.queryForObject("select address_parts::text from contact where id = ?", String.class, id);
    }

    @Test
    void theAddressIsSetByPartsAndNormalized() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 2);

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(
                        ids,
                        "attributes",
                        List.of(partsSet(
                                "address",
                                null,
                                Map.of(
                                        "street",
                                        "  Trg  1 ",
                                        "postalCode",
                                        "1000",
                                        "city",
                                        "Ljubljana",
                                        "country",
                                        "si")))));

        assertThat(response.statusCode()).isEqualTo(200);
        for (UUID id : ids) {
            assertThat(addressPartsOf(id)).contains("\"street\": \"Trg 1\"").contains("\"country\": \"SI\"");
            assertThat(jdbc.queryForObject("select address from contact where id = ?", String.class, id))
                    .isNull();
        }
    }

    @Test
    void anAddressAttributeIsSetByParts() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 2);

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(
                        ids,
                        "attributes",
                        List.of(partsSet("custom", "Delo", Map.of("street", "Cesta 2", "city", "Maribor")))));

        assertThat(response.statusCode()).isEqualTo(200);
        for (UUID id : ids) {
            assertThat(jdbc.queryForObject(
                            "select count(*) from contact_attribute where contact_id = ? and parts is not null",
                            Integer.class,
                            id))
                    .isEqualTo(1);
        }
        assertThat(jdbc.queryForObject(
                        "select type from attribute_key where group_id = ? and key_norm = 'delo'",
                        String.class,
                        s.group()))
                .isEqualTo("ADDRESS");
    }

    @Test
    void anInvalidPartRejectsTheWholeOperation() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 2);

        HttpResponse<String> response = bulkUpdate(
                s.token(Who.EDITOR),
                s.group(),
                request(ids, "attributes", List.of(partsSet("address", null, Map.of("postalCode", "1000")))));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(
                        asObjects(json(response.body()).get("contacts")).get(0).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].parts.street", "code", "REQUIRED"));
        for (UUID id : ids) {
            assertThat(addressPartsOf(id)).isNull();
        }
        assertThat(audit.count(s.group())).isZero();
    }

    @Test
    void valueAndPartsTogetherAreRefused() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 1);
        Map<String, Object> row = new LinkedHashMap<>(partsSet("address", null, Map.of("street", "Trg 1")));
        row.put("value", "Trg 1");

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(ids, "attributes", List.of(row)));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(asObjects(json(response.body()).get("errors")))
                .containsExactly(Map.of("field", "attributes[0].value", "code", "INVALID_VALUE"));
    }

    @Test
    void editingOtherFieldsKeepsTheStructuredAddress() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 1);
        jdbc.update(
                "update contact set address = null, address_parts = '{\"street\":\"Trg 1\",\"city\":\"Celje\"}'::jsonb where id = ?",
                ids.get(0));

        HttpResponse<String> response =
                bulkUpdate(s.token(Who.EDITOR), s.group(), request(ids, "addTags", List.of("novo")));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(addressPartsOf(ids.get(0))).contains("Trg 1").contains("Celje");
    }
}

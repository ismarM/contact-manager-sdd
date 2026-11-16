package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ImportApiTest;

/**
 * Tipi v vizitkah (016, FR-016-24, -25): izvoz zapiše {@code ADR} po delih in dodatne atribute tipov kot
 * {@code attrN.TEL|EMAIL|ADR|URL|BDAY|NOTE} z oznako ključa; uvoz izvožene datoteke ustvari enak kontakt (krožna pot).
 */
@Tag("FR-016-24")
@Tag("FR-016-25")
class VcardTypedIT extends ImportApiTest {

    private static Map<String, Object> typed(String key, String type, Object value) {
        Map<String, Object> attribute = new LinkedHashMap<>();
        attribute.put("key", key);
        attribute.put("type", type);
        attribute.put("value", value);
        return attribute;
    }

    private Map<String, Object> richContact(Scenario s) throws Exception {
        Map<String, Object> input = person("Ana", "Kos");
        input.put("country", "SI");
        input.put(
                "addressParts",
                Map.of(
                        "street", "Trg republike 1",
                        "extra", "2. nadstropje",
                        "postalCode", "1000",
                        "city", "Ljubljana",
                        "region", "Osrednjeslovenska",
                        "country", "SI"));
        input.put("phone", "041 123 456");
        Map<String, Object> vikend = new LinkedHashMap<>();
        vikend.put("key", "Vikend");
        vikend.put("parts", Map.of("street", "Gozdna 5", "city", "Bled"));
        vikend.put("value", "");
        input.put(
                "attributes",
                List.of(
                        typed("Služba", "PHONE", "01 234 5678"),
                        typed("Pisarna", "EMAIL", "Ana@Delo.SI"),
                        vikend,
                        typed("Dom", "ADDRESS", "Stara cesta 3, Kranj"),
                        typed("Spletna stran", "URL", "https://primer.si/ana"),
                        typed("Rojstvo", "DATE", "1990-05-17"),
                        typed("Opomba", "NOTES", "Prva vrstica\nDruga; z vejico, in poševnico \\"),
                        typed("Vloga", "OTHER", "mentor")));
        return createViaApi(s, input);
    }

    @Test
    void theExportWritesAdrByPartsAndTypedAttributesWithTheirLabels() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = richContact(s);

        HttpResponse<byte[]> response = send(
                exportPath(s.group()) + "/vcard",
                s.token(Who.VIEWER),
                body(exportBody(List.of(UUID.fromString((String) created.get("id"))), "sl")));

        assertThat(response.statusCode()).as(text(response)).isEqualTo(200);
        String vcf = new String(response.body(), StandardCharsets.UTF_8).replace("\r\n ", "");
        assertThat(vcf)
                .contains("TEL;TYPE=voice:+38641123456")
                .contains("2. nadstropje;Trg republike 1;Ljubljana;Osrednjeslovenska;1000;Slovenija")
                .contains("attr1.TEL:+38612345678", "attr1.X-ABLabel:Služba", "attr1.X-CM-KEY:Služba")
                .contains("attr2.EMAIL:Ana@delo.si", "attr2.X-CM-KEY:Pisarna")
                .contains("attr3.X-CM-KEY:Vikend", "Gozdna 5")
                .contains("attr4.X-CM-KEY:Dom", "Stara cesta 3\\, Kranj")
                .contains("attr5.URL:https://primer.si/ana", "attr5.X-CM-KEY:Spletna stran")
                .contains("attr6.BDAY:1990-05-17", "attr6.X-CM-KEY:Rojstvo")
                .contains("attr7.NOTE:Prva vrstica\\nDruga\\; z vejico\\, in poševnico \\\\")
                .contains("attr8.X-CM-KEY:Vloga", "attr8.X-CM-VALUE:mentor");
    }

    @Test
    void anExportedFileImportsBackIntoAnIdenticalTypedContact() throws Exception {
        Scenario s = scenario();
        Map<String, Object> original = richContact(s);
        UUID id = UUID.fromString((String) original.get("id"));
        UUID other = groups.createGroup(s.id(Who.OWNER), "Prazna");
        byte[] file = send(exportPath(s.group()) + "/vcard", s.token(Who.OWNER), body(exportBody(List.of(id), "sl")))
                .body();

        Map<String, Object> parsed =
                json(parse(s.token(Who.OWNER), other, file, "VCF", "sl").body());
        Map<String, Object> candidate = asObjects(parsed.get("candidates")).get(0);
        candidate.put("country", candidate.remove("countryText"));
        HttpResponse<String> created = commit(s.token(Who.OWNER), other, "VCF", List.of(candidate));

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        UUID copy = UUID.fromString((String) asObjects(
                        json(get(contactsPath(other), s.token(Who.OWNER)).body())
                                .get("items"))
                .get(0)
                .get("id"));
        Map<String, Object> imported =
                json(get(contactPath(other, copy), s.token(Who.OWNER)).body());
        for (String field : List.of(
                "firstName",
                "lastName",
                "address",
                "addressParts",
                "email",
                "phone",
                "company",
                "country",
                "attributes",
                "tags")) {
            assertThat(imported.get(field)).as(field).isEqualTo(original.get(field));
        }
        assertThat(jdbc.queryForList(
                        "select key_norm, type from attribute_key where group_id = ? order by key_norm", other))
                .extracting(row -> row.get("key_norm") + ":" + row.get("type"))
                .containsExactlyInAnyOrder(
                        "služba:PHONE",
                        "pisarna:EMAIL",
                        "vikend:ADDRESS",
                        "dom:ADDRESS",
                        "spletna stran:URL",
                        "rojstvo:DATE",
                        "opomba:NOTES",
                        "vloga:OTHER");
    }

    @Test
    void anUnlabelledStructuredAdrOfAForeignFileImportsAsPartsAndExtraPropertiesAsTypedAttributes() throws Exception {
        Scenario s = scenario();
        String vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bor Zupan\r\n"
                + "ADR;TYPE=work:;Soba 4;Glavni trg 1;Kranj;;4000;Slovenija\r\n"
                + "TEL:041 555 666\r\nTEL:01 222 3333\r\nEMAIL:bor@primer.si\r\nEMAIL:bor@delo.si\r\n"
                + "BDAY:1985-02-03\r\nURL:https://bor.si\r\nNOTE:Pozdravi\r\nEND:VCARD\r\n";

        Map<String, Object> parsed =
                json(parse(s.token(Who.EDITOR), s.group(), vcf.getBytes(StandardCharsets.UTF_8), "VCF", "sl")
                        .body());
        Map<String, Object> candidate = asObjects(parsed.get("candidates")).get(0);
        candidate.put("country", "SI");
        candidate.remove("countryText");
        HttpResponse<String> preview = preview(s.token(Who.EDITOR), s.group(), List.of(candidate));
        HttpResponse<String> created = commit(s.token(Who.EDITOR), s.group(), "VCF", List.of(candidate));

        assertThat(asObjects(json(preview.body()).get("rows")).get(0).get("errors"))
                .isEqualTo(List.of());
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        UUID id = UUID.fromString((String) asObjects(
                        json(get(contactsPath(s.group()), s.token(Who.EDITOR)).body())
                                .get("items"))
                .get(0)
                .get("id"));
        Map<String, Object> detail =
                json(get(contactPath(s.group(), id), s.token(Who.EDITOR)).body());
        assertThat(detail.get("address")).isNull();
        assertThat(detail.get("addressParts"))
                .isEqualTo(Map.of("street", "Glavni trg 1", "extra", "Soba 4", "postalCode", "4000", "city", "Kranj"));
        assertThat(detail.get("phone")).isEqualTo("+38641555666");
        assertThat(asObjects(detail.get("attributes")))
                .containsExactly(
                        Map.of("key", "E-naslov 2", "type", "EMAIL", "value", "bor@delo.si"),
                        Map.of("key", "Telefon 2", "type", "PHONE", "value", "+38612223333"),
                        Map.of("key", "Rojstni dan", "type", "DATE", "value", "1985-02-03"),
                        Map.of("key", "Spletna stran", "type", "URL", "value", "https://bor.si"),
                        Map.of("key", "Opomba", "type", "NOTES", "value", "Pozdravi"));
    }
}

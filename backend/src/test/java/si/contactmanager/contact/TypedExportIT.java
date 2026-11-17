package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ExportApiTest;
import si.contactmanager.contact.support.XlsxReader.Workbook;

/**
 * Izvoz v Excel s tipi (016, FR-016-18, -25): kanonične vrednosti ne glede na prikazno shemo izvajalca, naslov (predefiniran
 * in atribut tipa <i>Naslov</i>) v enem stolpcu po pravilih države, nerazčlenjen naslov dobesedno.
 */
@Tag("FR-016-18")
@Tag("FR-016-25")
class TypedExportIT extends ExportApiTest {

    private static Map<String, Object> typed(String key, String type, Object value) {
        Map<String, Object> attribute = new LinkedHashMap<>();
        attribute.put("key", key);
        attribute.put("type", type);
        attribute.put("value", value);
        return attribute;
    }

    private UUID typedContact(Scenario s) throws Exception {
        Map<String, Object> input = input("Ana", "Kos");
        input.put("country", "SI");
        input.put(
                "addressParts",
                Map.of(
                        "street", "Trg 1",
                        "extra", "Vhod B",
                        "postalCode", "1000",
                        "city", "Ljubljana",
                        "country", "SI"));
        Map<String, Object> work = new LinkedHashMap<>();
        work.put("key", "Delovni naslov");
        work.put("parts", Map.of("street", "Cesta 2", "postalCode", "2000", "city", "Maribor", "country", "AT"));
        work.put("value", "");
        input.put(
                "attributes",
                List.of(
                        typed("Služba", "PHONE", "01 234 5678"),
                        typed("Rojstvo", "DATE", "1990-05-17"),
                        work,
                        typed("Dom", "ADDRESS", "Stara cesta 3, Kranj")));
        return UUID.fromString((String) createViaApi(s, input).get("id"));
    }

    @Test
    void valuesAreCanonicalEvenWhenTheExporterDisplaysThemInANationalScheme() throws Exception {
        Scenario s = scenario();
        UUID id = typedContact(s);
        String schemes = "{\"language\":\"sl\",\"theme\":null,\"phoneFormat\":\"NATIONAL\",\"dateFormat\":\"LONG\","
                + "\"addressFormat\":\"SINGLE_LINE\"}";
        assertThat(put("/api/me/preferences", s.token(Who.EDITOR), schemes).statusCode())
                .isEqualTo(200);

        HttpResponse<byte[]> response = export(s.token(Who.EDITOR), s.group(), exportBody(List.of(id), "sl"));

        assertThat(response.statusCode()).as(text(response)).isEqualTo(200);
        Workbook book = workbook(response);
        List<String> header = book.rows().get(0);
        List<String> row = book.rows().get(1);
        // Predpona ' pri vrednostih, ki se začnejo z +, je varovalo pred formulami v celicah (010, CellText).
        assertThat(row.get(header.indexOf("Služba"))).isEqualTo("'+38612345678");
        assertThat(row.get(header.indexOf("Rojstvo"))).isEqualTo("1990-05-17");
        assertThat(book.allText()).isTrue();
        assertThat(book.hasFormula()).isFalse();
    }

    @Test
    void addressesAreOneColumnInTheFormOfTheCountry() throws Exception {
        Scenario s = scenario();
        UUID id = typedContact(s);

        Workbook book = workbook(export(s.token(Who.VIEWER), s.group(), exportBody(List.of(id), "sl")));

        List<String> header = book.rows().get(0);
        List<String> row = book.rows().get(1);
        // Predefinirani naslov: brez vrstice države (ta je v svojem stolpcu).
        assertThat(row.get(header.indexOf("Naslov"))).isEqualTo("Trg 1\nVhod B\n1000 Ljubljana");
        assertThat(row.get(header.indexOf("Država"))).isEqualTo("Slovenija");
        // Atribut tipa Naslov: država kot zadnja vrstica; nerazčlenjen naslov dobesedno.
        assertThat(row.get(header.indexOf("Delovni naslov"))).isEqualTo("Cesta 2\n2000 Maribor\nAvstrija");
        assertThat(row.get(header.indexOf("Dom"))).isEqualTo("Stara cesta 3, Kranj");
    }

    @Test
    void anUnparsedPredefinedAddressIsExportedVerbatim() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Bor", "Zupan", null, null, "Trg 9\n3000 Celje");

        Workbook book = workbook(export(s.token(Who.VIEWER), s.group(), exportBody(List.of(id), "sl")));

        assertThat(book.rows().get(1).get(book.rows().get(0).indexOf("Naslov"))).isEqualTo("Trg 9\n3000 Celje");
    }
}

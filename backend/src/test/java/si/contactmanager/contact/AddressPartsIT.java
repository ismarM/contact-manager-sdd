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
 * Strukturiran naslov (016, FR-016-12, FR-016-15, FR-016-04; research R-04): predefiniran naslov in atribut tipa
 * {@code ADDRESS} po delih, normalizacija delov, meje, nerazčlenjen naslov iz časa pred 016 ostane besedilo,
 * razčlenitev ob urejanju, sprememba tipa ključa v drug tip (besedilo po pravilih države) in iskanje po delih.
 */
@Tag("FR-016-12")
@Tag("FR-016-15")
@Tag("FR-016-04")
class AddressPartsIT extends ContactApiTest {

    private static final String LEGACY = "Slovenska cesta 1\n1000 Ljubljana";

    private static Map<String, Object> parts(Object... pairs) {
        Map<String, Object> parts = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            parts.put((String) pairs[i], pairs[i + 1]);
        }
        return parts;
    }

    private Map<String, Object> storedParts(UUID contact) {
        String json =
                jdbc.queryForObject("select address_parts::text from contact where id = ?", String.class, contact);
        return json == null ? null : json(json);
    }

    private HttpResponse<String> update(Scenario s, UUID contact, Map<String, Object> input) throws Exception {
        return put(
                contactPath(s.group(), contact),
                s.token(Who.EDITOR),
                body(withVersion(input, contacts.version(contact))));
    }

    @Test
    void addressIsStoredByPartsNormalizedWithTheCountryAsCode() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Ana", "Kos");
        input.put(
                "addressParts",
                parts(
                        "street", "  Slovenska   cesta 1 ",
                        "extra", " ",
                        "postalCode", " sI-1000 ",
                        "city", "Ljubljana",
                        "country", "si"));

        Map<String, Object> created = createViaApi(s, input);

        Map<String, Object> expected =
                parts("street", "Slovenska cesta 1", "postalCode", "SI-1000", "city", "Ljubljana", "country", "SI");
        assertThat(created.get("addressParts")).isEqualTo(expected);
        assertThat(created.get("address")).isNull();
        UUID id = UUID.fromString((String) created.get("id"));
        assertThat(storedParts(id)).isEqualTo(expected);
        assertThat(jdbc.queryForObject("select address from contact where id = ?", String.class, id))
                .isNull();
        assertThat(json(get(contactPath(s.group(), id), s.token(Who.VIEWER)).body())
                        .get("addressParts"))
                .isEqualTo(expected);
        // Posnetek v sledi vsebuje dele.
        String after =
                jdbc.queryForObject("select after::text from audit_change where contact_id = ?", String.class, id);
        assertThat(asObject(json(after).get("addressParts"))).isEqualTo(expected);
    }

    @Test
    void invalidPartsAreRejectedNextToTheFieldAndNothingIsSaved() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos", null, null, LEGACY);
        long version = contacts.version(contact);
        Map<Map<String, Object>, Map<String, String>> cases = new LinkedHashMap<>();
        cases.put(parts("street", "a".repeat(201)), Map.of("addressParts.street", "TOO_LONG"));
        cases.put(parts("city", "Kraj", "extra", "b".repeat(201)), Map.of("addressParts.extra", "TOO_LONG"));
        cases.put(parts("city", "Kraj", "postalCode", "1".repeat(21)), Map.of("addressParts.postalCode", "TOO_LONG"));
        cases.put(parts("city", "c".repeat(101)), Map.of("addressParts.city", "TOO_LONG"));
        cases.put(parts("city", "Kraj", "region", "d".repeat(101)), Map.of("addressParts.region", "TOO_LONG"));
        cases.put(parts("postalCode", "1000", "country", "SI"), Map.of("addressParts.street", "REQUIRED"));
        cases.put(parts("city", "Kraj", "country", "XX"), Map.of("addressParts.country", "INVALID_VALUE"));
        cases.put(parts("city", "Kraj", "zip", "1000"), Map.of("addressParts.zip", "UNKNOWN_FIELD"));
        cases.put(parts("city", 1000), Map.of("addressParts.city", "INVALID_VALUE"));

        for (Map.Entry<Map<String, Object>, Map<String, String>> c : cases.entrySet()) {
            Map<String, Object> input = input("Ana", "Kos");
            input.put("addressParts", c.getKey());
            HttpResponse<String> response = update(s, contact, input);
            assertThat(response.statusCode()).as(c.getKey().toString()).isEqualTo(400);
            assertThat(fieldErrors(response.body())).as(c.getKey().toString()).isEqualTo(c.getValue());
        }
        // Natanko ena oblika naslova.
        Map<String, Object> both = input("Ana", "Kos");
        both.put("address", "Besedilo");
        both.put("addressParts", parts("city", "Kraj"));
        assertThat(fieldErrors(update(s, contact, both).body())).isEqualTo(Map.of("addressParts", "INVALID_VALUE"));
        // Meje so vključno: 200/20/100.
        Map<String, Object> limits = input("Ana", "Kos");
        limits.put(
                "addressParts",
                parts("street", "s".repeat(200), "postalCode", "p".repeat(20), "city", "c".repeat(100)));
        HttpResponse<String> ok =
                put(contactPath(s.group(), contact), s.token(Who.EDITOR), body(withVersion(limits, version)));
        assertThat(ok.statusCode()).isEqualTo(200);
        assertThat(contacts.version(contact)).isEqualTo(version + 1);
    }

    @Test
    void anExistingUnparsedAddressStaysTextWhenAnotherFieldChanges() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos", null, null, LEGACY);
        Map<String, Object> input = input("Ana", "Kosova");
        input.put("address", LEGACY);

        HttpResponse<String> response = update(s, contact, input);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("address", LEGACY).doesNotContainKey("addressParts");
        assertThat(jdbc.queryForObject("select address from contact where id = ?", String.class, contact))
                .isEqualTo(LEGACY);
        assertThat(storedParts(contact)).isNull();
        // Odpiranje ne spremeni ničesar (FR-016-04).
        long version = contacts.version(contact);
        get(contactPath(s.group(), contact), s.token(Who.VIEWER));
        assertThat(contacts.version(contact)).isEqualTo(version);
    }

    @Test
    void parsingAnUnparsedAddressOnSaveReplacesTheTextWithPartsAndIsAuditedAsOneChange() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Kos", null, null, LEGACY);
        Map<String, Object> input = input("Ana", "Kos");
        input.put("addressParts", parts("street", "Slovenska cesta 1", "postalCode", "1000", "city", "Ljubljana"));

        HttpResponse<String> response = update(s, contact, input);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()).get("address")).isNull();
        assertThat(storedParts(contact))
                .isEqualTo(parts("street", "Slovenska cesta 1", "postalCode", "1000", "city", "Ljubljana"));
        Map<String, Object> change = jdbc.queryForMap(
                "select before::text as before, after::text as after from audit_change where contact_id = ?", contact);
        assertThat(json((String) change.get("before"))).containsEntry("address", LEGACY);
        assertThat(json((String) change.get("after")).get("addressParts")).isNotNull();
        // Isti deli še enkrat: brez spremembe in brez nove verzije.
        long version = contacts.version(contact);
        assertThat(update(s, contact, input).statusCode()).isEqualTo(200);
        assertThat(contacts.version(contact)).isEqualTo(version);
    }

    @Test
    void anAddressAttributeIsStoredByPartsAndOnlyForAnAddressKey() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Ana", "Kos");
        input.put(
                "attributes",
                List.of(Map.of(
                        "key",
                        "Domači naslov",
                        "parts",
                        parts("street", "Dunajska  5", "city", "Ljubljana", "country", "si"))));

        Map<String, Object> created = createViaApi(s, input);

        assertThat(asObjects(created.get("attributes")))
                .containsExactly(Map.of(
                        "key",
                        "Domači naslov",
                        "type",
                        "ADDRESS",
                        "parts",
                        parts("street", "Dunajska 5", "city", "Ljubljana", "country", "SI")));
        UUID id = UUID.fromString((String) created.get("id"));
        Map<String, Object> row =
                jdbc.queryForMap("select value, parts::text as parts from contact_attribute where contact_id = ?", id);
        assertThat(row.get("value")).isNull();
        assertThat(json((String) row.get("parts")))
                .isEqualTo(parts("street", "Dunajska 5", "city", "Ljubljana", "country", "SI"));

        // Deli za ključ drugega tipa, vrednost in deli hkrati, neveljavni deli.
        contacts.addAttribute(id, 1, "Opomba", "x");
        Map<String, Object> wrongType = input("Ana", "Kos");
        wrongType.put("attributes", List.of(Map.of("key", "Opomba", "parts", parts("city", "Kraj"))));
        assertThat(fieldErrors(update(s, id, wrongType).body()))
                .isEqualTo(Map.of("attributes[0].parts", "INVALID_VALUE"));
        Map<String, Object> both = input("Ana", "Kos");
        both.put("attributes", List.of(Map.of("key", "Domači naslov", "value", "x", "parts", parts("city", "Kraj"))));
        assertThat(fieldErrors(update(s, id, both).body())).isEqualTo(Map.of("attributes[0].value", "INVALID_VALUE"));
        Map<String, Object> invalid = input("Ana", "Kos");
        invalid.put("attributes", List.of(Map.of("key", "Domači naslov", "parts", parts("region", "R"))));
        assertThat(fieldErrors(update(s, id, invalid).body()))
                .isEqualTo(Map.of("attributes[0].parts.street", "REQUIRED"));
    }

    @Test
    void changingAnAddressKeyToAnotherTypeTurnsPartsIntoTextByCountryRules() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = input("Ana", "Kos");
        input.put(
                "attributes",
                List.of(Map.of(
                        "key",
                        "Pošta",
                        "type",
                        "ADDRESS",
                        "parts",
                        parts(
                                "street",
                                "Main Street 5",
                                "city",
                                "Springfield",
                                "region",
                                "IL",
                                "postalCode",
                                "62701",
                                "country",
                                "US"))));
        UUID id = UUID.fromString((String) createViaApi(s, input).get("id"));
        long version = jdbc.queryForObject(
                "select version from attribute_key where group_id = ? and key_norm = 'pošta'", Long.class, s.group());

        HttpResponse<String> response = post(
                "/api/groups/" + s.group() + "/attribute-keys/change-type",
                s.token(Who.EDITOR),
                body(Map.of("key", "Pošta", "type", "OTHER", "version", version)));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> row =
                jdbc.queryForMap("select value, parts::text as parts from contact_attribute where contact_id = ?", id);
        assertThat(row.get("parts")).isNull();
        assertThat(row.get("value"))
                .isEqualTo("Main Street 5\nSpringfield, IL 62701\n" + CountryNames.display("US", "sl"));
        // V drug tip, ki besedila ne sprejme: konflikt, nič se ne spremeni.
        Map<String, Object> second = input("Bor", "Kos");
        second.put(
                "attributes",
                List.of(Map.of("key", "Dom", "type", "ADDRESS", "parts", parts("city", "Ljubljana", "country", "SI"))));
        UUID other = UUID.fromString((String) createViaApi(s, second).get("id"));
        HttpResponse<String> conflict = post(
                "/api/groups/" + s.group() + "/attribute-keys/change-type",
                s.token(Who.EDITOR),
                body(Map.of("key", "Dom", "type", "EMAIL", "version", 0)));
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject(
                        "select parts::text from contact_attribute where contact_id = ?", String.class, other))
                .isNotNull();
    }

    @Test
    void searchFindsContactsByAddressPartsAndAddressCountry() throws Exception {
        Scenario s = scenario();
        Map<String, Object> predefined = input("Ana", "Kos");
        predefined.put("addressParts", parts("street", "Hauptplatz 1", "city", "Graz", "country", "AT"));
        UUID first = UUID.fromString((String) createViaApi(s, predefined).get("id"));
        Map<String, Object> attribute = input("Bor", "Novak");
        attribute.put(
                "attributes",
                List.of(Map.of(
                        "key",
                        "Dom",
                        "type",
                        "ADDRESS",
                        "parts",
                        parts("street", "Kolodvorska 7", "city", "Maribor"))));
        UUID second = UUID.fromString((String) createViaApi(s, attribute).get("id"));
        contacts.insert(s.group(), s.id(Who.OWNER), "Cene", "Zupan", null, null, "Kolodvorska ulica");

        assertThat(searchIds(s, "graz")).containsExactly(first.toString());
        assertThat(searchIds(s, "Avstrija")).containsExactly(first.toString());
        assertThat(searchIds(s, "Maribor")).containsExactly(second.toString());
        assertThat(searchIds(s, "Kolodvorska")).hasSize(2).contains(second.toString());
    }

    private List<Object> searchIds(Scenario s, String q) throws Exception {
        HttpResponse<String> response = get(contactsPath(s.group()) + "?q=" + q, s.token(Who.VIEWER));
        assertThat(response.statusCode()).isEqualTo(200);
        return asObjects(json(response.body()).get("items")).stream()
                .map(row -> row.get("id"))
                .toList();
    }
}

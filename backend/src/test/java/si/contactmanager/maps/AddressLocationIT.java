package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URLDecoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import si.contactmanager.contact.Address;
import si.contactmanager.shared.error.MapServiceUnavailableException;

/**
 * Lokacija naslova prek posrednika Nominatim (016, FR-016-21 … FR-016-23; research R-08): strukturirana poizvedba za
 * razčlenjen naslov, {@code q} za nerazčlenjen, natančnost zadetka, predpomnilnik, napake → 503, storitev prejme samo
 * besedilo naslova, koordinate niso v bazi ali dnevniku.
 */
@Tag("FR-016-21")
@Tag("FR-016-22")
@Tag("FR-016-23")
@ExtendWith(OutputCaptureExtension.class)
class AddressLocationIT extends MapsApiTest {

    @Autowired
    private MapsProperties properties;

    private static String unique(String text) {
        return text + " " + UUID.randomUUID().toString().substring(0, 8);
    }

    private static Map<String, Object> parts(Object... pairs) {
        Map<String, Object> parts = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            parts.put((String) pairs[i], pairs[i + 1]);
        }
        return parts;
    }

    private UUID contact(Scenario s, Map<String, Object> extra) throws Exception {
        Map<String, Object> input = input("Ana", "Novak");
        input.putAll(extra);
        return UUID.fromString((String) createViaApi(s, input).get("id"));
    }

    private HttpResponse<String> locate(Scenario s, UUID contact, Who who, String query) throws Exception {
        return get(
                contactPath(s.group(), contact) + "/address-location" + (query.isEmpty() ? "" : "?" + query),
                s.token(who));
    }

    private static String sentQuery() {
        return URLDecoder.decode(FAKE.requests().get(0).query(), StandardCharsets.UTF_8);
    }

    @Test
    void structuredAddressIsAStructuredQueryWithOnlyTheAddressAndTheCoordinatesAreNotStored(CapturedOutput output)
            throws Exception {
        Scenario s = scenario();
        String street = unique("Slovenska cesta 1");
        UUID id = contact(
                s,
                Map.of(
                        "email",
                        "ana@primer.si",
                        "addressParts",
                        parts("street", street, "postalCode", "1000", "city", "Ljubljana", "country", "SI")));
        long version = contacts.version(id);
        int audit = jdbc.queryForObject("select count(*) from audit_entry", Integer.class);
        FAKE.respond(nominatim(46.0512345, 14.5067891, 30, "1"));

        HttpResponse<String> response = locate(s, id, Who.VIEWER, "");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .isEqualTo(Map.of("status", "EXACT", "latitude", 46.0512345, "longitude", 14.5067891));
        assertThat(FAKE.count()).isEqualTo(1);
        MapsFakeServer.Request request = FAKE.requests().get(0);
        assertThat(request.method()).isEqualTo("GET");
        assertThat(request.path()).isEqualTo("/search");
        assertThat(sentQuery())
                .isEqualTo("street=" + street + "&postalcode=1000&city=Ljubljana&countrycodes=si"
                        + "&format=jsonv2&addressdetails=1&limit=1&accept-language=sl");
        assertThat(request.headers()).containsEntry("user-agent", properties.userAgent());
        assertThat(request.headers().get("user-agent")).doesNotContain("@");
        assertThat(request.headers()).doesNotContainKeys("cookie", "referer", "authorization");
        assertThat(request.query() + request.headers())
                .doesNotContain("primer.si")
                .doesNotContain("Novak")
                .doesNotContain(s.users().get(Who.VIEWER).uid())
                .doesNotContain(s.group().toString())
                .doesNotContain(id.toString());
        // Koordinate se ne shranijo: kontakt in sled se ne spremenita, v dnevniku jih ni.
        assertThat(contacts.version(id)).isEqualTo(version);
        assertThat(jdbc.queryForObject("select count(*) from audit_entry", Integer.class))
                .isEqualTo(audit);
        assertThat(jdbc.queryForObject(
                        "select count(*) from contact where id = ? and (address_parts::text like '%46.05123%'"
                                + " or coalesce(address, '') like '%46.05123%')",
                        Integer.class, id))
                .isZero();
        assertThat(output.getAll()).doesNotContain("46.0512345").doesNotContain(street);
    }

    @Test
    void unparsedAddressIsAFreeTextQueryAndALowRankIsApproximate() throws Exception {
        Scenario s = scenario();
        String street = unique("Gosposka 3");
        UUID id = contact(s, Map.of("address", street + "\n2000   Maribor"));
        FAKE.respond(nominatim(46.55, 15.64, 16, null));

        HttpResponse<String> response = locate(s, id, Who.EDITOR, "language=en");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .isEqualTo(Map.of("status", "APPROXIMATE", "latitude", 46.55, "longitude", 15.64));
        assertThat(sentQuery())
                .isEqualTo("q=" + street + " 2000 Maribor&format=jsonv2&addressdetails=1&limit=1&accept-language=en");
        assertThat(FAKE.requests().get(0).headers()).containsEntry("accept-language", "en");
    }

    @Test
    void addressAttributeIsFoundByKeyIgnoringCaseAndAHitWithoutHouseNumberIsApproximate() throws Exception {
        Scenario s = scenario();
        String street = unique("Dunajska cesta");
        UUID id = contact(
                s,
                Map.of(
                        "addressParts",
                        parts("city", "Celje", "country", "SI"),
                        "attributes",
                        List.of(Map.of(
                                "key",
                                "Dostava",
                                "type",
                                "ADDRESS",
                                "parts",
                                parts("street", street, "city", "Ljubljana")))));
        FAKE.respond(nominatim(46.07, 14.51, 30, null));

        HttpResponse<String> response = locate(s, id, Who.VIEWER, "key=dostava");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("status", "APPROXIMATE");
        assertThat(sentQuery()).startsWith("street=" + street + "&city=Ljubljana&format=jsonv2");
    }

    @Test
    void anAddressThatCannotBeFoundIsNotFoundWithoutCoordinates() throws Exception {
        Scenario s = scenario();
        UUID id = contact(s, Map.of("address", unique("Neznana ulica 999, Nikjer")));
        FAKE.respond(nominatimEmpty());

        HttpResponse<String> response = locate(s, id, Who.VIEWER, "");

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("status", "NOT_FOUND");
        assertThat(body.get("latitude")).isNull();
        assertThat(body.get("longitude")).isNull();
    }

    @Test
    void missingAddressAttributeOfAnotherTypeAndUnknownContactAre404WithoutCallingTheService() throws Exception {
        Scenario s = scenario();
        UUID none = contact(s, Map.of());
        UUID typed = contact(
                s,
                Map.of(
                        "address", unique("Cesta 1"),
                        "attributes", List.of(Map.of("key", "Služba", "type", "EMAIL", "value", "ana@primer.si"))));
        FAKE.respond(nominatim(46.0, 14.0, 30, "1"));

        List<HttpResponse<String>> responses = List.of(
                locate(s, none, Who.VIEWER, ""),
                locate(s, typed, Who.VIEWER, "key=Slu%C5%BEba"),
                locate(s, typed, Who.VIEWER, "key=Ni"),
                locate(s, UUID.randomUUID(), Who.VIEWER, ""),
                get("/api/groups/" + s.group() + "/contacts/ni-uuid/address-location", s.token(Who.VIEWER)));

        assertThat(responses).allSatisfy(r -> {
            assertThat(r.statusCode()).isEqualTo(404);
            assertThat(r.body()).isEmpty();
        });
        assertThat(FAKE.count()).isZero();
    }

    @Test
    void anInvalidLanguageIs400WithoutCallingTheService() throws Exception {
        Scenario s = scenario();
        UUID id = contact(s, Map.of("address", unique("Cesta 2")));

        HttpResponse<String> response = locate(s, id, Who.VIEWER, "language=de");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).isEqualTo(Map.of("language", "INVALID_VALUE"));
        assertThat(FAKE.count()).isZero();
    }

    @Test
    void reopeningTheSameAddressIsServedFromTheCache() throws Exception {
        Scenario s = scenario();
        String text = unique("Prešernov trg 1");
        UUID first = contact(s, Map.of("address", text));
        UUID second = contact(s, Map.of("address", "  " + text.toUpperCase() + " "));
        FAKE.respond(nominatim(46.05, 14.5, 30, "1"));

        HttpResponse<String> a = locate(s, first, Who.VIEWER, "");
        HttpResponse<String> b = locate(s, second, Who.OWNER, "");

        assertThat(a.statusCode()).isEqualTo(200);
        assertThat(b.body()).isEqualTo(a.body());
        assertThat(FAKE.count()).isEqualTo(1);
    }

    @Test
    void serviceErrorsSlownessAndInvalidBodiesAre503AndAreNotCached() throws Exception {
        Scenario s = scenario();
        UUID id = contact(s, Map.of("address", unique("Napaka 1")));
        List<MapsFakeServer.Response> failures = List.of(
                MapsFakeServer.Response.status(500),
                MapsFakeServer.Response.status(429),
                MapsFakeServer.Response.json("{\"ni\": \"seznam\"}"),
                MapsFakeServer.Response.json("[{\"lat\": \"ni število\", \"lon\": \"14\"}]"),
                nominatim(46.0, 14.0, 30, "1").delayed(Duration.ofMillis(2000)));

        for (MapsFakeServer.Response failure : failures) {
            FAKE.respond(failure);
            long start = System.nanoTime();
            HttpResponse<String> response = locate(s, id, Who.VIEWER, "");
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofMillis(1800));
            assertThat(response.statusCode()).isEqualTo(503);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "MAP_SERVICE_UNAVAILABLE"));
        }
        FAKE.respond(nominatim(46.0, 14.0, 30, "1"));
        HttpResponse<String> recovered = locate(s, id, Who.VIEWER, "");

        assertThat(recovered.statusCode()).isEqualTo(200);
        assertThat(FAKE.count()).isEqualTo(failures.size() + 1);
    }

    @Test
    void theAddressTextNeverAppearsInTheLogEvenOnErrors(CapturedOutput output) throws Exception {
        Scenario s = scenario();
        String secret = unique("Skrivna ulica");
        UUID id = contact(s, Map.of("address", secret));
        FAKE.respond(MapsFakeServer.Response.status(500));
        locate(s, id, Who.VIEWER, "");
        FAKE.respond(MapsFakeServer.Response.json("ni json"));
        locate(s, id, Who.VIEWER, "");

        assertThat(output.getAll()).doesNotContain(secret).doesNotContain(secret.replace(' ', '+'));
    }

    private MapsProperties with(boolean enabled, int perSecond, Duration maxWait) {
        MapsProperties.Limits l = properties.limits();
        return new MapsProperties(
                enabled,
                FAKE.url(),
                FAKE.url(),
                FAKE.url(),
                properties.userAgent(),
                properties.connectTimeout(),
                properties.readTimeout(),
                properties.locations(),
                properties.suggestions(),
                properties.tiles(),
                new MapsProperties.Limits(
                        perSecond,
                        maxWait,
                        l.photonPerSecond(),
                        l.photonPerUserPerSecond(),
                        l.tilesPerUserPerWindow(),
                        l.tilesWindow(),
                        l.tilesPerSecond()));
    }

    @Test
    void disabledProxyIs503WithoutCallingTheService() {
        FAKE.respond(nominatim(46.0, 14.0, 30, "1"));
        NominatimClient client = new NominatimClient(with(false, 1, Duration.ofSeconds(1)));

        assertThatThrownBy(() -> client.locate("Slovenska cesta 1", "sl"))
                .isInstanceOf(MapServiceUnavailableException.class);
        assertThatThrownBy(() ->
                        client.locate(new Address("Slovenska cesta 1", null, null, "Ljubljana", null, "SI"), "sl"))
                .isInstanceOf(MapServiceUnavailableException.class);
        assertThat(FAKE.count()).isZero();
    }

    @Test
    void theGlobalLimitIsOneRequestPerSecondWaitingAtMostMaxWait() {
        FAKE.respond(nominatim(46.0, 14.0, 30, "1"));
        NominatimClient noWait = new NominatimClient(with(true, 1, Duration.ZERO));

        assertThat(noWait.locate(unique("Prva"), "sl").status()).isEqualTo(AddressLocation.Status.EXACT);
        assertThatThrownBy(() -> noWait.locate(unique("Druga"), "sl"))
                .isInstanceOf(MapServiceUnavailableException.class);
        assertThat(FAKE.count()).isEqualTo(1);

        NominatimClient waits = new NominatimClient(with(true, 1, Duration.ofSeconds(1)));
        waits.locate(unique("Tretja"), "sl");
        long start = System.nanoTime();
        assertThat(waits.locate(unique("Četrta"), "sl").status()).isEqualTo(AddressLocation.Status.EXACT);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isGreaterThan(Duration.ofMillis(500));
        assertThat(FAKE.count()).isEqualTo(3);
    }
}

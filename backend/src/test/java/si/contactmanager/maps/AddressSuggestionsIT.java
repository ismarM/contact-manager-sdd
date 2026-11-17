package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

/**
 * Samodokončanje naslova prek posrednika Photon (016, FR-016-13, FR-016-23; research R-08): storitev prejme samo
 * besedilo naslova in jezik, predlogi so prednostno v državi, predpomnilnik, napake in omejitve vrnejo prazen seznam,
 * besedilo naslova ni v dnevniku.
 */
@Tag("FR-016-13")
@Tag("FR-016-23")
@ExtendWith(OutputCaptureExtension.class)
class AddressSuggestionsIT extends MapsApiTest {

    @Autowired
    private MapsProperties properties;

    private static String unique(String text) {
        return text + " " + UUID.randomUUID().toString().substring(0, 8);
    }

    private HttpResponse<String> suggest(UUID group, String token, String q, String... more) throws Exception {
        StringBuilder path = new StringBuilder("/api/groups/" + group + "/address-suggestions?q=")
                .append(URLEncoder.encode(q, StandardCharsets.UTF_8));
        for (int i = 0; i + 1 < more.length; i += 2) {
            path.append('&').append(more[i]).append('=').append(URLEncoder.encode(more[i + 1], StandardCharsets.UTF_8));
        }
        return get(path.toString(), token);
    }

    private static List<Map<String, Object>> items(HttpResponse<String> response) {
        return asObjects(json(response.body()).get("items"));
    }

    private static List<Map<String, Object>> sevenFeatures() {
        return List.of(
                feature(Map.of(
                        "name",
                        "Hauptplatz",
                        "street",
                        "Hauptplatz",
                        "housenumber",
                        "1",
                        "postcode",
                        "8010",
                        "city",
                        "Graz",
                        "state",
                        "Steiermark",
                        "countrycode",
                        "AT",
                        "type",
                        "house")),
                feature(Map.of(
                        "street",
                        "Slovenska cesta",
                        "housenumber",
                        "1",
                        "postcode",
                        "1000",
                        "city",
                        "Ljubljana",
                        "countrycode",
                        "SI",
                        "type",
                        "house")),
                feature(Map.of("name", "Ljubljana", "countrycode", "SI", "type", "city")),
                feature(Map.of("name", "Brez kraja in ulice", "countrycode", "SI", "type", "other")),
                feature(Map.of(
                        "street",
                        "Main Street",
                        "housenumber",
                        "5",
                        "city",
                        "Springfield",
                        "state",
                        "IL",
                        "postcode",
                        "62701",
                        "countrycode",
                        "US",
                        "type",
                        "house")),
                feature(Map.of("street", "Celovška cesta", "city", "Ljubljana", "countrycode", "SI", "type", "street")),
                feature(Map.of("street", "Wiener Straße", "city", "Linz", "countrycode", "AT", "type", "street")),
                feature(Map.of("street", "Via Roma", "city", "Trieste", "countrycode", "IT", "type", "street")));
    }

    @Test
    void editorGetsAtMostFiveSuggestionsPreferringTheCountryAndOsmReceivesOnlyTheAddressText() throws Exception {
        Scenario s = scenario();
        FAKE.respond(photon(sevenFeatures()));
        String q = unique("Slovenska cesta 1");

        HttpResponse<String> response = suggest(s.group(), s.token(Who.EDITOR), q, "country", "SI", "language", "sl");

        assertThat(response.statusCode()).isEqualTo(200);
        List<Map<String, Object>> items = items(response);
        assertThat(items).hasSize(5);
        // Najprej predlogi v državi kontakta (SI), nato ostali v vrstnem redu storitve; brez neveljavnega zadetka.
        assertThat(items).extracting(i -> i.get("country")).containsExactly("SI", "SI", "SI", "AT", "US");
        assertThat(items.get(0))
                .isEqualTo(Map.of(
                        "label", "Slovenska cesta 1, 1000 Ljubljana, Slovenija",
                        "street", "Slovenska cesta 1",
                        "postalCode", "1000",
                        "city", "Ljubljana",
                        "country", "SI"));
        assertThat(items.get(1))
                .isEqualTo(Map.of("label", "Ljubljana, Slovenija", "city", "Ljubljana", "country", "SI"));
        assertThat(items.get(3)).containsEntry("street", "Hauptplatz 1").containsEntry("region", "Steiermark");
        assertThat(items.get(4)).containsEntry("street", "5 Main Street");

        assertThat(FAKE.count()).isEqualTo(1);
        MapsFakeServer.Request request = FAKE.requests().get(0);
        assertThat(request.method()).isEqualTo("GET");
        assertThat(request.path()).isEqualTo("/api");
        assertThat(URLDecoder.decode(request.query(), StandardCharsets.UTF_8))
                .isEqualTo("q=" + q + "&limit=10&lang=default");
        assertThat(request.headers()).containsEntry("user-agent", properties.userAgent());
        assertThat(request.headers().get("user-agent")).doesNotContain("@");
        assertThat(request.headers()).doesNotContainKeys("cookie", "referer", "authorization");
        String sent = request.query() + request.headers();
        assertThat(sent)
                // Testni e-naslovi so u-…@primer.si.
                .doesNotContain("primer.si")
                .doesNotContain(s.users().get(Who.EDITOR).uid())
                .doesNotContain(s.group().toString());
    }

    @Test
    void englishInterfaceAsksForEnglishNamesAndNoCountryKeepsTheServiceOrder() throws Exception {
        Scenario s = scenario();
        FAKE.respond(photon(sevenFeatures()));

        HttpResponse<String> response = suggest(s.group(), s.token(Who.OWNER), unique("Hauptplatz"), "language", "en");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(items(response)).extracting(i -> i.get("country")).containsExactly("AT", "SI", "SI", "US", "SI");
        assertThat(items(response).get(1).get("label")).isEqualTo("Slovenska cesta 1, 1000 Ljubljana, Slovenia");
        assertThat(FAKE.requests().get(0).query()).endsWith("&lang=en");
        assertThat(FAKE.requests().get(0).headers()).containsEntry("accept-language", "en");
    }

    @Test
    void aRepeatedQueryIsServedFromTheCacheWithoutCallingTheService() throws Exception {
        Scenario s = scenario();
        FAKE.respond(photon(sevenFeatures()));
        String q = unique("Celovška");

        HttpResponse<String> first = suggest(s.group(), s.token(Who.EDITOR), q, "country", "SI");
        // Drug uporabnik, ista poizvedba (velikost črk in presledki ne štejejo).
        HttpResponse<String> second =
                suggest(s.group(), s.token(Who.ADMIN), "  " + q.toUpperCase() + " ", "country", "SI");

        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(second.statusCode()).isEqualTo(200);
        assertThat(items(second)).isEqualTo(items(first));
        assertThat(FAKE.count()).isEqualTo(1);
    }

    @Test
    void aSlowServiceTimesOutAndYieldsAnEmptyList() throws Exception {
        Scenario s = scenario();
        FAKE.respond(photon(sevenFeatures()).delayed(Duration.ofMillis(2000)));

        long start = System.nanoTime();
        HttpResponse<String> response = suggest(s.group(), s.token(Who.EDITOR), unique("Počasna"));
        Duration took = Duration.ofNanos(System.nanoTime() - start);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(items(response)).isEmpty();
        assertThat(took).isLessThan(Duration.ofMillis(1800));
    }

    @Test
    void serverErrorsAreNotCachedAndTheNextRequestCallsTheServiceAgain() throws Exception {
        Scenario s = scenario();
        String q = unique("Napaka");
        FAKE.respond(MapsFakeServer.Response.status(503));

        HttpResponse<String> failed = suggest(s.group(), s.token(Who.EDITOR), q);
        FAKE.respond(photon(sevenFeatures()));
        HttpResponse<String> recovered = suggest(s.group(), s.token(Who.EDITOR), q);

        assertThat(failed.statusCode()).isEqualTo(200);
        assertThat(items(failed)).isEmpty();
        assertThat(recovered.statusCode()).isEqualTo(200);
        assertThat(items(recovered)).hasSize(5);
        assertThat(FAKE.count()).isEqualTo(2);
    }

    @Test
    void tooManyRequestsFromTheServiceAndAnInvalidBodyYieldAnEmptyList() throws Exception {
        Scenario s = scenario();
        FAKE.respond(MapsFakeServer.Response.status(429));
        HttpResponse<String> limited = suggest(s.group(), s.token(Who.EDITOR), unique("Omejeno"));
        FAKE.respond(MapsFakeServer.Response.json("{\"ni\": \"geojson\"}"));
        HttpResponse<String> invalid = suggest(s.group(), s.token(Who.ADMIN), unique("Pokvarjeno"));

        assertThat(limited.statusCode()).isEqualTo(200);
        assertThat(items(limited)).isEmpty();
        assertThat(invalid.statusCode()).isEqualTo(200);
        assertThat(items(invalid)).isEmpty();
    }

    @Test
    void aUserAboveTwoRequestsPerSecondGetsAnEmptyListWithoutCallingTheService() throws Exception {
        Scenario s = scenario();
        FAKE.respond(photon(sevenFeatures()));

        List<HttpResponse<String>> responses = new java.util.ArrayList<>();
        for (int i = 0; i < 4; i++) {
            responses.add(suggest(s.group(), s.token(Who.EDITOR), unique("Hitro " + i)));
        }

        assertThat(responses).allSatisfy(r -> assertThat(r.statusCode()).isEqualTo(200));
        long empty = responses.stream().filter(r -> items(r).isEmpty()).count();
        assertThat(empty).isGreaterThanOrEqualTo(1);
        assertThat(FAKE.count()).isEqualTo(4 - (int) empty);
        // Drug uporabnik ima svojo omejitev.
        assertThat(items(suggest(s.group(), s.token(Who.ADMIN), unique("Drugi"))))
                .hasSize(5);
    }

    @Test
    void archivedGroupStillGetsSuggestions() throws Exception {
        Scenario s = scenario();
        groups.archive(s.group());
        FAKE.respond(photon(sevenFeatures()));

        HttpResponse<String> response = suggest(s.group(), s.token(Who.EDITOR), unique("Arhiv"));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(items(response)).hasSize(5);
    }

    @Test
    void invalidParametersAre400AndNeverCallTheService() throws Exception {
        Scenario s = scenario();
        String token = s.token(Who.EDITOR);
        String base = "/api/groups/" + s.group() + "/address-suggestions";

        assertThat(fieldErrors(get(base, token).body())).isEqualTo(Map.of("q", "REQUIRED"));
        assertThat(fieldErrors(suggest(s.group(), token, "  ").body())).isEqualTo(Map.of("q", "REQUIRED"));
        assertThat(fieldErrors(suggest(s.group(), token, " ab ").body())).isEqualTo(Map.of("q", "TOO_SHORT"));
        assertThat(fieldErrors(suggest(s.group(), token, "a".repeat(301)).body()))
                .isEqualTo(Map.of("q", "TOO_LONG"));
        assertThat(fieldErrors(
                        suggest(s.group(), token, "Cesta", "country", "si").body()))
                .isEqualTo(Map.of("country", "INVALID_VALUE"));
        assertThat(fieldErrors(
                        suggest(s.group(), token, "Cesta", "country", "XX").body()))
                .isEqualTo(Map.of("country", "INVALID_VALUE"));
        assertThat(fieldErrors(
                        suggest(s.group(), token, "Cesta", "language", "de").body()))
                .isEqualTo(Map.of("language", "INVALID_VALUE"));
        assertThat(suggest(s.group(), token, "Cesta", "language", "de").statusCode())
                .isEqualTo(400);
        // 300 znakov je še dovoljeno.
        FAKE.respond(photon(List.of()));
        assertThat(suggest(s.group(), token, "b".repeat(300)).statusCode()).isEqualTo(200);
        assertThat(FAKE.count()).isEqualTo(1);
    }

    @Test
    void disabledProxyNeverCallsTheService() {
        MapsProperties disabled = new MapsProperties(
                false,
                FAKE.url(),
                FAKE.url(),
                FAKE.url(),
                properties.userAgent(),
                properties.connectTimeout(),
                properties.readTimeout(),
                properties.locations(),
                properties.suggestions(),
                properties.tiles(),
                properties.limits());
        FAKE.respond(photon(sevenFeatures()));

        List<AddressSuggestion> result = new PhotonClient(disabled).suggest(1L, "Slovenska cesta 1", "SI", "sl");

        assertThat(result).isEmpty();
        assertThat(FAKE.count()).isZero();
    }

    @Test
    void theAddressTextNeverAppearsInTheApplicationLog(CapturedOutput output) throws Exception {
        Scenario s = scenario();
        String secret = "Skrivna ulica " + UUID.randomUUID().toString().substring(0, 8);
        FAKE.respond(MapsFakeServer.Response.status(500));
        suggest(s.group(), s.token(Who.EDITOR), secret);
        FAKE.respond(photon(sevenFeatures()).delayed(Duration.ofMillis(1500)));
        suggest(s.group(), s.token(Who.ADMIN), secret + " zakasnjena");
        FAKE.respond(MapsFakeServer.Response.json("ni json"));
        suggest(s.group(), s.token(Who.OWNER), secret + " pokvarjena");

        assertThat(output.getAll()).doesNotContain(secret).doesNotContain(secret.replace(' ', '+'));
    }
}

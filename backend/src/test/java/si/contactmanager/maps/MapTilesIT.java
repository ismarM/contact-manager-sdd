package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Ploščice podlage prek našega strežnika (016, FR-016-21, FR-016-23; research R-08, R-09): {@code image/png} s {@code
 * Cache-Control: private} in {@code max-age} storitve (največ 7 dni), predpomnilnik, veljavnost {@code z/x/y},
 * omejitev na uporabnika in napake storitve → 503. Storitev prejme samo koordinate ploščice.
 */
@Tag("FR-016-21")
@Tag("FR-016-23")
class MapTilesIT extends MapsApiTest {

    private static final HttpClient CLIENT =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Autowired
    private MapsProperties properties;

    private HttpResponse<byte[]> tile(String path, String token) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(java.net.URI.create(url("/api/map-tiles/" + path)))
                .header("Authorization", "Bearer " + token)
                .GET()
                .build();
        return CLIENT.send(request, HttpResponse.BodyHandlers.ofByteArray());
    }

    private static long maxAge(HttpResponse<?> response) {
        String header = response.headers().firstValue("Cache-Control").orElseThrow();
        assertThat(header).contains("private");
        return Long.parseLong(header.replaceAll(".*max-age=(\\d+).*", "$1"));
    }

    @Test
    void anyUserWithoutAGroupGetsThePngWithAPrivateMaxAgeAndOsmReceivesOnlyTheTile() throws Exception {
        Scenario s = scenario();
        String tile = randomTile();
        FAKE.respond(tile("public, max-age=3600"));

        HttpResponse<byte[]> response = tile(tile + ".png", s.token(Who.NON_MEMBER));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type")).hasValue("image/png");
        assertThat(response.body()).isEqualTo(PNG);
        assertThat(maxAge(response)).isBetween(3590L, 3600L);
        assertThat(FAKE.count()).isEqualTo(1);
        MapsFakeServer.Request request = FAKE.requests().get(0);
        assertThat(request.path()).isEqualTo("/tiles/" + tile + ".png");
        assertThat(request.query()).isNull();
        assertThat(request.headers()).containsEntry("user-agent", properties.userAgent());
        assertThat(request.headers()).doesNotContainKeys("cookie", "referer", "authorization");
        assertThat(request.headers().toString())
                .doesNotContain(s.users().get(Who.NON_MEMBER).uid());
    }

    @Test
    void aLongUpstreamMaxAgeIsCappedAtSevenDaysAndTheTileIsCached() throws Exception {
        Scenario s = scenario();
        String tile = randomTile();
        FAKE.respond(tile("max-age=2592000"));

        HttpResponse<byte[]> first = tile(tile + ".png", s.token(Who.VIEWER));
        HttpResponse<byte[]> second = tile(tile + ".png", s.token(Who.OWNER));

        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(maxAge(first)).isBetween(604790L, 604800L);
        assertThat(second.statusCode()).isEqualTo(200);
        assertThat(second.body()).isEqualTo(PNG);
        assertThat(maxAge(second)).isLessThanOrEqualTo(604800L);
        assertThat(FAKE.count()).isEqualTo(1);
    }

    @Test
    void invalidCoordinatesAre400AndOtherPathsAre404BothWithoutCallingTheService() throws Exception {
        Scenario s = scenario();
        String token = s.token(Who.VIEWER);
        FAKE.respond(tile("max-age=60"));

        Map<String, Map<String, String>> cases = Map.of(
                "20/0/0.png", Map.of("z", "INVALID_VALUE"),
                "2/4/0.png", Map.of("x", "INVALID_VALUE"),
                "2/0/4.png", Map.of("y", "INVALID_VALUE"),
                "2/-1/0.png", Map.of("x", "INVALID_VALUE"),
                "a/0/0.png", Map.of("z", "INVALID_VALUE"),
                "1/1/99999999999.png", Map.of("y", "INVALID_VALUE"));
        for (Map.Entry<String, Map<String, String>> c : cases.entrySet()) {
            HttpResponse<byte[]> response = tile(c.getKey(), token);
            assertThat(response.statusCode()).as(c.getKey()).isEqualTo(400);
            assertThat(fieldErrors(new String(response.body(), java.nio.charset.StandardCharsets.UTF_8)))
                    .as(c.getKey())
                    .isEqualTo(c.getValue());
        }
        assertThat(tile("1/0/0.jpg", token).statusCode()).isEqualTo(404);
        assertThat(tile("1/0.png", token).statusCode()).isEqualTo(404);
        // Mejni veljavni ploščici.
        assertThat(tile("0/0/0.png", token).statusCode()).isEqualTo(200);
        assertThat(tile("19/524287/524287.png", token).statusCode()).isEqualTo(200);
        assertThat(FAKE.count()).isEqualTo(2);
    }

    @Test
    void serviceErrorsSlownessAndNonPngBodiesAre503() throws Exception {
        Scenario s = scenario();
        List<MapsFakeServer.Response> failures = List.of(
                MapsFakeServer.Response.status(500),
                MapsFakeServer.Response.status(429),
                MapsFakeServer.Response.json("{}"),
                tile("max-age=60").delayed(Duration.ofMillis(2000)));

        for (MapsFakeServer.Response failure : failures) {
            FAKE.respond(failure);
            HttpResponse<byte[]> response = tile(randomTile() + ".png", s.token(Who.VIEWER));
            assertThat(response.statusCode()).isEqualTo(503);
            assertThat(json(new String(response.body(), java.nio.charset.StandardCharsets.UTF_8)))
                    .isEqualTo(Map.of("code", "MAP_SERVICE_UNAVAILABLE"));
        }
        assertThat(FAKE.count()).isEqualTo(failures.size());
    }

    @Test
    void aUserAboveSixtyTilesInTenSecondsGets503AndOthersAreNotAffected() throws Exception {
        Scenario s = scenario();
        FAKE.respond(tile("max-age=60"));
        int limit = properties.limits().tilesPerUserPerWindow();

        List<Integer> statuses = new ArrayList<>();
        for (int i = 0; i < 2 * limit; i++) {
            statuses.add(tile(randomTile() + ".png", s.token(Who.EDITOR)).statusCode());
        }

        assertThat(statuses.subList(0, limit)).containsOnly(200);
        assertThat(statuses.subList(limit, statuses.size())).contains(503);
        assertThat(FAKE.count())
                .isEqualTo((int) statuses.stream().filter(c -> c == 200).count());
        assertThat(tile(randomTile() + ".png", s.token(Who.ADMIN)).statusCode()).isEqualTo(200);
    }
}

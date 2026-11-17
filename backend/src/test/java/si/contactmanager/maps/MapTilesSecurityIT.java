package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije {@code GET /api/map-tiles/{z}/{x}/{y}.png} (016, FR-016-21, FR-016-23; konstitucija III): ni vezano
 * na skupino, zato je vsak prijavljen uporabnik dovoljen (tudi brez članstva). Neprijavljen, pokvarjen ali potekel
 * žeton 401 brez klica storitve; neveljavne koordinate 400 brez klica; napaka storitve 503; sicer 200 {@code
 * image/png}.
 */
@Tag("FR-016-21")
@Tag("FR-016-23")
class MapTilesSecurityIT extends MapsApiTest {

    enum Actor {
        NO_TOKEN,
        MALFORMED_TOKEN,
        EXPIRED_TOKEN,
        NON_MEMBER,
        VIEWER,
        EDITOR,
        ADMIN,
        OWNER
    }

    private static final HttpClient CLIENT = HttpClient.newHttpClient();

    private static Map<String, String> headers(Actor actor, Map<Who, SignedIn> users) {
        return switch (actor) {
            case NO_TOKEN -> Map.of();
            case MALFORMED_TOKEN -> Map.of("Authorization", "Bearer not-a-jwt");
            case EXPIRED_TOKEN ->
                Http.bearer(Tokens.withClaims(users.get(Who.VIEWER).idToken(), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }));
            default -> Http.bearer(users.get(Who.valueOf(actor.name())).idToken());
        };
    }

    private HttpResponse<byte[]> send(String path, Map<String, String> headers) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url("/api/map-tiles/" + path)));
        headers.forEach(request::header);
        return CLIENT.send(request.GET().build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    private static Map<String, Object> body(HttpResponse<byte[]> response) {
        return json(new String(response.body(), StandardCharsets.UTF_8));
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(Actor.class)
    void isolationMatrix(Actor actor) throws Exception {
        Scenario s = scenario();
        Map<String, String> headers = headers(actor, s.users());
        FAKE.respond(tile("max-age=600"));

        HttpResponse<byte[]> ok = send(randomTile() + ".png", headers);
        HttpResponse<byte[]> invalid = send("20/0/0.png", headers);
        int callsBeforeFailure = FAKE.count();
        FAKE.respond(MapsFakeServer.Response.status(503));
        HttpResponse<byte[]> unavailable = send(randomTile() + ".png", headers);

        switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> {
                for (HttpResponse<byte[]> response : java.util.List.of(ok, invalid, unavailable)) {
                    assertThat(response.statusCode()).isEqualTo(401);
                    assertThat(body(response)).isEqualTo(Map.of("code", "UNAUTHENTICATED"));
                }
                assertThat(FAKE.count()).as("klici OSM").isZero();
            }
            default -> {
                assertThat(ok.statusCode()).isEqualTo(200);
                assertThat(ok.headers().firstValue("Content-Type")).hasValue("image/png");
                assertThat(ok.body()).isEqualTo(PNG);
                assertThat(invalid.statusCode()).isEqualTo(400);
                assertThat(body(invalid)).containsEntry("code", "VALIDATION_FAILED");
                assertThat(callsBeforeFailure).as("klici OSM pred napako").isEqualTo(1);
                assertThat(unavailable.statusCode()).isEqualTo(503);
                assertThat(body(unavailable)).isEqualTo(Map.of("code", "MAP_SERVICE_UNAVAILABLE"));
                assertThat(FAKE.count()).isEqualTo(2);
            }
        }
    }
}

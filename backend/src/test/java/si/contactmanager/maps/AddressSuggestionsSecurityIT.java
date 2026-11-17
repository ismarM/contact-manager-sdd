package si.contactmanager.maps;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije {@code GET /api/groups/{groupId}/address-suggestions} (016, FR-016-13, FR-016-23; konstitucija
 * III, §3.1): akter × stanje skupine. Neprijavljen 401, nečlan 404 brez telesa, bralec 403, urednik in višje 200 tudi
 * v arhivirani skupini; prekratek {@code q} 400. Vsaka zavrnitev se zgodi pred klicem zunanje storitve: nadomestni
 * strežnik OSM ne prejme nobene zahteve.
 */
@Tag("FR-016-13")
@Tag("FR-016-23")
class AddressSuggestionsSecurityIT extends MapsApiTest {

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

    static Stream<Arguments> matrix() {
        List<Arguments> rows = new ArrayList<>();
        for (boolean archived : new boolean[] {false, true}) {
            for (Actor actor : Actor.values()) {
                rows.add(Arguments.of(actor, archived));
            }
        }
        return rows.stream();
    }

    private static Map<String, String> headers(Actor actor, Map<Who, SignedIn> users) {
        return switch (actor) {
            case NO_TOKEN -> Map.of();
            case MALFORMED_TOKEN -> Map.of("Authorization", "Bearer not-a-jwt");
            case EXPIRED_TOKEN ->
                Http.bearer(Tokens.withClaims(users.get(Who.EDITOR).idToken(), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }));
            default -> Http.bearer(users.get(Who.valueOf(actor.name())).idToken());
        };
    }

    private HttpResponse<String> send(UUID group, String q, Map<String, String> headers) throws Exception {
        return Http.send(
                "GET",
                url("/api/groups/" + group + "/address-suggestions?q=" + q.replace(' ', '+') + "&country=SI"),
                headers);
    }

    private static String unique() {
        return "Slovenska cesta " + UUID.randomUUID().toString().substring(0, 8);
    }

    @ParameterizedTest(name = "arhivirana={1}, {0}")
    @MethodSource("matrix")
    void isolationMatrix(Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        if (archived) {
            groups.archive(s.group());
        }
        FAKE.respond(photon(List.of(feature(Map.of(
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
                "house")))));

        HttpResponse<String> response = send(s.group(), unique(), headers(actor, s.users()));

        switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> {
                assertThat(response.statusCode()).isEqualTo(401);
                assertThat(json(response.body())).isEqualTo(Map.of("code", "UNAUTHENTICATED"));
            }
            case NON_MEMBER -> {
                assertThat(response.statusCode()).isEqualTo(404);
                assertThat(response.body()).isEmpty();
            }
            case VIEWER -> {
                assertThat(response.statusCode()).isEqualTo(403);
                assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
            }
            case EDITOR, ADMIN, OWNER -> {
                assertThat(response.statusCode()).isEqualTo(200);
                assertThat(asObjects(json(response.body()).get("items")))
                        .extracting(i -> i.get("street"))
                        .containsExactly("Slovenska cesta 1");
            }
        }
        boolean allowed = response.statusCode() == 200;
        assertThat(FAKE.count()).as("klici OSM").isEqualTo(allowed ? 1 : 0);
    }

    @Test
    void unknownGroupIs404AndATooShortQueryIs400BothWithoutCallingTheService() throws Exception {
        Scenario s = scenario();
        FAKE.respond(photon(List.of()));
        Map<String, String> editor = Http.bearer(s.token(Who.EDITOR));

        HttpResponse<String> unknown = send(UUID.randomUUID(), unique(), editor);
        HttpResponse<String> malformedId =
                Http.send("GET", url("/api/groups/ni-uuid/address-suggestions?q=Slovenska"), editor);
        HttpResponse<String> shortQuery = send(s.group(), "ab", editor);
        HttpResponse<String> viewerShort = send(s.group(), "ab", Http.bearer(s.token(Who.VIEWER)));

        assertThat(unknown.statusCode()).isEqualTo(404);
        assertThat(unknown.body()).isEmpty();
        assertThat(malformedId.statusCode()).isEqualTo(404);
        assertThat(shortQuery.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(shortQuery.body())).isEqualTo(Map.of("q", "TOO_SHORT"));
        // Bralec dobi 403 pred preverjanjem parametrov (§2.2).
        assertThat(viewerShort.statusCode()).isEqualTo(403);
        assertThat(FAKE.count()).isZero();
    }

    @Test
    void memberOfAnotherGroupIsNotFoundInThisGroupWithoutCallingTheService() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.NON_MEMBER), "Skupina B");
        FAKE.respond(photon(List.of()));

        HttpResponse<String> response = send(s.group(), unique(), Http.bearer(s.token(Who.NON_MEMBER)));
        HttpResponse<String> own = send(other, unique(), Http.bearer(s.token(Who.NON_MEMBER)));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertThat(own.statusCode()).isEqualTo(200);
        assertThat(FAKE.count()).isEqualTo(1);
    }
}

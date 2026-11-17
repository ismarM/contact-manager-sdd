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
 * Matrika izolacije {@code GET /api/groups/{groupId}/contacts/{contactId}/address-location} (016, FR-016-21,
 * FR-016-23; konstitucija III, §3.1): akter × stanje skupine. Neprijavljen 401, nečlan 404 brez telesa, bralec in
 * višje 200 tudi v arhivirani skupini; kontakt ali atribut druge skupine 404; neveljaven jezik 400; napaka storitve
 * 503. Vsaka zavrnitev se zgodi pred klicem zunanje storitve: nadomestni strežnik OSM ne prejme nobene zahteve.
 */
@Tag("FR-016-21")
@Tag("FR-016-23")
class AddressLocationSecurityIT extends MapsApiTest {

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
                Http.bearer(Tokens.withClaims(users.get(Who.VIEWER).idToken(), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }));
            default -> Http.bearer(users.get(Who.valueOf(actor.name())).idToken());
        };
    }

    private static String unique() {
        return "Slovenska cesta " + UUID.randomUUID().toString().substring(0, 8);
    }

    /** Kontakt z razčlenjenim naslovom in atributom {@code Dostava} tipa naslov, ustvarjen v skupini {@code group}. */
    private UUID contactIn(UUID group, String token) throws Exception {
        Map<String, Object> input = input("Ana", "Novak");
        input.put("addressParts", Map.of("street", unique(), "city", "Ljubljana", "country", "SI"));
        input.put(
                "attributes",
                List.of(Map.of(
                        "key", "Dostava", "type", "ADDRESS", "parts", Map.of("street", unique(), "city", "Kranj"))));
        HttpResponse<String> response = post(contactsPath(group), token, body(input));
        assertThat(response.statusCode()).isEqualTo(201);
        return UUID.fromString((String) json(response.body()).get("id"));
    }

    private HttpResponse<String> send(UUID group, UUID contact, String query, Map<String, String> headers)
            throws Exception {
        return Http.send(
                "GET",
                url(contactPath(group, contact) + "/address-location" + (query.isEmpty() ? "" : "?" + query)),
                headers);
    }

    @ParameterizedTest(name = "arhivirana={1}, {0}")
    @MethodSource("matrix")
    void isolationMatrix(Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        UUID contact = contactIn(s.group(), s.token(Who.EDITOR));
        if (archived) {
            groups.archive(s.group());
        }
        FAKE.respond(nominatim(46.05, 14.5, 30, "1"));

        HttpResponse<String> predefined = send(s.group(), contact, "", headers(actor, s.users()));
        HttpResponse<String> attribute = send(s.group(), contact, "key=Dostava", headers(actor, s.users()));

        for (HttpResponse<String> response : List.of(predefined, attribute)) {
            switch (actor) {
                case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> {
                    assertThat(response.statusCode()).isEqualTo(401);
                    assertThat(json(response.body())).isEqualTo(Map.of("code", "UNAUTHENTICATED"));
                }
                case NON_MEMBER -> {
                    assertThat(response.statusCode()).isEqualTo(404);
                    assertThat(response.body()).isEmpty();
                }
                case VIEWER, EDITOR, ADMIN, OWNER -> {
                    assertThat(response.statusCode()).isEqualTo(200);
                    assertThat(json(response.body()))
                            .isEqualTo(Map.of("status", "EXACT", "latitude", 46.05, "longitude", 14.5));
                }
            }
        }
        boolean allowed = predefined.statusCode() == 200;
        assertThat(FAKE.count()).as("klici OSM").isEqualTo(allowed ? 2 : 0);
    }

    @Test
    void contactOrAttributeOfAnotherGroupIs404WithoutCallingTheService() throws Exception {
        Scenario s = scenario();
        // Lastnik je član obeh skupin; kontakt skupine B ni dosegljiv prek poti skupine A.
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        UUID foreign = contactIn(other, s.token(Who.OWNER));
        UUID own = contactIn(s.group(), s.token(Who.EDITOR));
        FAKE.respond(nominatim(46.05, 14.5, 30, "1"));
        Map<String, String> owner = Http.bearer(s.token(Who.OWNER));

        List<HttpResponse<String>> rejected = List.of(
                send(s.group(), foreign, "", owner),
                send(s.group(), foreign, "key=Dostava", owner),
                send(other, own, "", owner),
                send(other, own, "key=Dostava", Http.bearer(s.token(Who.NON_MEMBER))),
                send(UUID.randomUUID(), own, "", owner),
                Http.send("GET", url("/api/groups/ni-uuid/contacts/" + own + "/address-location"), owner));

        assertThat(rejected).allSatisfy(r -> {
            assertThat(r.statusCode()).isEqualTo(404);
            assertThat(r.body()).isEmpty();
        });
        assertThat(FAKE.count()).isZero();
        assertThat(send(other, foreign, "key=Dostava", owner).statusCode()).isEqualTo(200);
        assertThat(FAKE.count()).isEqualTo(1);
    }

    @Test
    void invalidLanguageIs400AfterAccessAndAServiceErrorIs503() throws Exception {
        Scenario s = scenario();
        UUID contact = contactIn(s.group(), s.token(Who.EDITOR));
        groups.archive(s.group());
        Map<String, String> viewer = Http.bearer(s.token(Who.VIEWER));

        HttpResponse<String> badLanguage = send(s.group(), contact, "language=de", viewer);
        HttpResponse<String> nonMemberBadLanguage =
                send(s.group(), contact, "language=de", Http.bearer(s.token(Who.NON_MEMBER)));
        assertThat(badLanguage.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(badLanguage.body())).isEqualTo(Map.of("language", "INVALID_VALUE"));
        assertThat(nonMemberBadLanguage.statusCode()).isEqualTo(404);
        assertThat(FAKE.count()).isZero();

        FAKE.respond(MapsFakeServer.Response.status(503));
        HttpResponse<String> unavailable = send(s.group(), contact, "", viewer);
        assertThat(unavailable.statusCode()).isEqualTo(503);
        assertThat(json(unavailable.body())).isEqualTo(Map.of("code", "MAP_SERVICE_UNAVAILABLE"));
    }
}

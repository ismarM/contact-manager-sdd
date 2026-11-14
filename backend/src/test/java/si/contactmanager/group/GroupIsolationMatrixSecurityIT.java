package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov skupine (konstitucija III in §3.1; FR-002-07, FR-002-08, FR-002-10,
 * FR-002-11): {@code GET} in {@code PUT /api/groups/{groupId}} × akter × stanje skupine. Neprijavljen 401, nečlan 404
 * brez telesa, vloga pod najnižjo 403 FORBIDDEN (D-25), pisanje v arhivirani skupini 409 GROUP_ARCHIVED (vloga se
 * preveri pred stanjem, feature-map §2.2). Uporabniška endpointa {@code POST}/{@code GET /api/groups}: 401.
 */
@Tag("FR-002-01")
@Tag("FR-002-04")
@Tag("FR-002-07")
@Tag("FR-002-08")
@Tag("FR-002-10")
@Tag("FR-002-11")
class GroupIsolationMatrixSecurityIT extends ApiTest {

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

    enum Endpoint {
        GET,
        PUT
    }

    /** Pričakovan odgovor: status in telo ({@code null} = prazno telo). */
    record Expected(int status, Map<String, Object> body) {}

    static Expected expected(Endpoint endpoint, Actor actor, boolean archived) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER, EDITOR ->
                endpoint == Endpoint.GET ? new Expected(200, null) : new Expected(403, Map.of("code", "FORBIDDEN"));
            case ADMIN, OWNER ->
                endpoint == Endpoint.GET || !archived
                        ? new Expected(200, null)
                        : new Expected(409, Map.of("code", "GROUP_ARCHIVED"));
        };
    }

    static Stream<Arguments> matrix() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : Endpoint.values()) {
            for (boolean archived : new boolean[] {false, true}) {
                for (Actor actor : Actor.values()) {
                    rows.add(Arguments.of(endpoint, actor, archived));
                }
            }
        }
        return rows.stream();
    }

    private static Map<String, String> headers(Actor actor, Map<Actor, SignedIn> users, SignedIn any) {
        return switch (actor) {
            case NO_TOKEN -> Map.of();
            case MALFORMED_TOKEN -> Map.of("Authorization", "Bearer not-a-jwt");
            case EXPIRED_TOKEN ->
                Http.bearer(Tokens.withClaims(any.idToken(), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }));
            default -> Http.bearer(users.get(actor).idToken());
        };
    }

    @ParameterizedTest(name = "{0} {2} skupina, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, boolean archived) throws Exception {
        GroupFixtures fixtures = new GroupFixtures(jdbc);
        Map<Actor, SignedIn> users = new EnumMap<>(Actor.class);
        for (Actor member : List.of(Actor.NON_MEMBER, Actor.VIEWER, Actor.EDITOR, Actor.ADMIN, Actor.OWNER)) {
            users.put(member, registeredUser(member.name()));
        }
        UUID group = fixtures.createGroup(fixtures.userId(users.get(Actor.OWNER).uid()), "Matrika", null, "tinta");
        for (Actor member : List.of(Actor.VIEWER, Actor.EDITOR, Actor.ADMIN)) {
            fixtures.addMember(group, fixtures.userId(users.get(member).uid()), member.name());
        }
        if (archived) {
            fixtures.archive(group);
        }
        Map<String, Object> before = fixtures.row(group);
        Map<String, String> headers = headers(actor, users, users.get(Actor.OWNER));
        String path = url("/api/groups/" + group);

        HttpResponse<String> response = endpoint == Endpoint.GET
                ? Http.send("GET", path, headers)
                : Http.send(
                        "PUT",
                        path,
                        headers,
                        "{\"title\":\"Spremenjeno\",\"description\":null,\"color\":\"rja\",\"version\":0}");

        Expected expected = expected(endpoint, actor, archived);
        assertThat(response.statusCode()).isEqualTo(expected.status());
        if (expected.status() == 200) {
            assertThat(json(response.body()))
                    .containsEntry("role", roleOf(actor))
                    .containsEntry("archived", archived);
        } else if (expected.body() == null) {
            assertThat(response.body()).isEmpty();
        } else {
            assertThat(json(response.body())).isEqualTo(expected.body());
        }
        if (endpoint == Endpoint.GET || expected.status() != 200) {
            assertThat(fixtures.row(group)).isEqualTo(before);
        } else {
            assertThat(fixtures.row(group))
                    .containsEntry("title", "Spremenjeno")
                    .containsEntry("color", "rja")
                    .containsEntry("version", 1L);
        }
    }

    private static String roleOf(Actor actor) {
        return actor.name();
    }

    enum UserEndpoint {
        CREATE(token -> new String[] {"POST", "/api/groups", "{\"title\":\"Ne sme nastati\"}"}),
        LIST(token -> new String[] {"GET", "/api/groups", null});

        final Function<String, String[]> request;

        UserEndpoint(Function<String, String[]> request) {
            this.request = request;
        }
    }

    static Stream<Arguments> userEndpoints() {
        List<Arguments> rows = new ArrayList<>();
        for (UserEndpoint endpoint : UserEndpoint.values()) {
            for (Actor actor : List.of(Actor.NO_TOKEN, Actor.MALFORMED_TOKEN, Actor.EXPIRED_TOKEN)) {
                rows.add(Arguments.of(endpoint, actor));
            }
        }
        return rows.stream();
    }

    @ParameterizedTest(name = "{0}, {1} → 401")
    @MethodSource("userEndpoints")
    void userEndpointsRequireSignIn(UserEndpoint endpoint, Actor actor) throws Exception {
        GroupFixtures fixtures = new GroupFixtures(jdbc);
        SignedIn any = registeredUser("Kdorkoli");
        int groupsBefore = fixtures.groupCount();
        String[] request = endpoint.request.apply(any.idToken());

        HttpResponse<String> response =
                Http.send(request[0], url(request[1]), headers(actor, Map.of(), any), request[2]);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "UNAUTHENTICATED"));
        assertThat(fixtures.groupCount()).isEqualTo(groupsBefore);
    }
}

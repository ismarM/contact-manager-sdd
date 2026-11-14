package si.contactmanager.group;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov 003 (konstitucija III in §3.1; FR-003-01, FR-003-06, FR-003-07, FR-003-09):
 * {@code POST …/archive}, {@code POST …/unarchive}, {@code DELETE} × akter × stanje skupine. Neprijavljen 401, nečlan
 * 404 brez telesa, vloga pod najnižjo 403 FORBIDDEN, lastnik: uspeh ali 409 s kodo poslovnega pravila (§2.2).
 */
@Tag("FR-003-01")
@Tag("FR-003-06")
@Tag("FR-003-07")
@Tag("FR-003-09")
class ArchiveIsolationMatrixSecurityIT extends ApiTest {

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
        ARCHIVE,
        UNARCHIVE,
        DELETE
    }

    /** Pričakovan odgovor: status in telo ({@code null} = prazno telo). */
    record Expected(int status, Map<String, Object> body) {}

    /** {@code alone}: lastnik je edini član (sicer ima skupina še tri člane). */
    static Expected expected(Endpoint endpoint, Actor actor, boolean archived, boolean alone) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER, EDITOR, ADMIN -> new Expected(403, Map.of("code", "FORBIDDEN"));
            case OWNER ->
                switch (endpoint) {
                    case ARCHIVE ->
                        archived ? new Expected(409, Map.of("code", "GROUP_ARCHIVED")) : new Expected(200, null);
                    case UNARCHIVE ->
                        archived ? new Expected(200, null) : new Expected(409, Map.of("code", "GROUP_NOT_ARCHIVED"));
                    case DELETE ->
                        alone ? new Expected(204, null) : new Expected(409, Map.of("code", "GROUP_HAS_OTHER_MEMBERS"));
                };
        };
    }

    static Stream<Arguments> matrix() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : Endpoint.values()) {
            for (boolean archived : new boolean[] {false, true}) {
                for (Actor actor : Actor.values()) {
                    // Izbris edinega člana: lastnik je sam; sicer ima skupina še tri člane (vloge za 403 so člani).
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

    private HttpResponse<String> send(Endpoint endpoint, UUID group, Map<String, String> headers) throws Exception {
        return switch (endpoint) {
            case ARCHIVE -> Http.send("POST", url("/api/groups/" + group + "/archive"), headers);
            case UNARCHIVE -> Http.send("POST", url("/api/groups/" + group + "/unarchive"), headers);
            case DELETE -> Http.send("DELETE", url("/api/groups/" + group), headers);
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
        Object archivedAtBefore = fixtures.archivedAt(group);

        HttpResponse<String> response = send(endpoint, group, headers(actor, users, users.get(Actor.OWNER)));

        Expected expected = expected(endpoint, actor, archived, false);
        assertThat(response.statusCode()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404) {
            assertThat(response.body()).isEmpty();
        }
        if (expected.status() == 200) {
            assertThat(json(response.body())).containsEntry("archived", endpoint == Endpoint.ARCHIVE);
            assertThat(fixtures.archivedAt(group) != null).isEqualTo(endpoint == Endpoint.ARCHIVE);
        } else {
            assertThat(fixtures.exists(group)).isTrue();
            assertThat(fixtures.archivedAt(group)).isEqualTo(archivedAtBefore);
            assertThat(fixtures.memberCount(group)).isEqualTo(4);
        }
    }

    /** Trajno arhivirana skupina (brez lastnika): vsi trije člani + nečlan; stanje 409/403 po pravilih FR-003-08/09. */
    enum PermanentActor {
        NO_TOKEN,
        NON_MEMBER,
        VIEWER,
        EDITOR,
        ADMIN
    }

    @ParameterizedTest(name = "{0} na trajno arhivirani skupini z več člani")
    @EnumSource(PermanentActor.class)
    void permanentlyArchivedGroupMatrix(PermanentActor actor) throws Exception {
        GroupFixtures fixtures = new GroupFixtures(jdbc);
        Map<Actor, SignedIn> users = new EnumMap<>(Actor.class);
        for (Actor member : List.of(Actor.NON_MEMBER, Actor.VIEWER, Actor.EDITOR, Actor.ADMIN, Actor.OWNER)) {
            users.put(member, registeredUser(member.name()));
        }
        UUID group = fixtures.createGroup(fixtures.userId(users.get(Actor.OWNER).uid()), "Trajna", null, "tinta");
        for (Actor member : List.of(Actor.VIEWER, Actor.EDITOR, Actor.ADMIN)) {
            fixtures.addMember(group, fixtures.userId(users.get(member).uid()), member.name());
        }
        fixtures.makePermanentlyArchived(group);
        Actor as = Actor.valueOf(actor.name());
        Map<String, String> headers = headers(as, users, users.get(Actor.VIEWER));

        for (Endpoint endpoint : Endpoint.values()) {
            HttpResponse<String> response = send(endpoint, group, headers);
            int status = response.statusCode();
            switch (actor) {
                case NO_TOKEN -> assertThat(status).isEqualTo(401);
                case NON_MEMBER -> assertThat(status).isEqualTo(404);
                default -> {
                    // brez lastnika: arhiviranje in odarhiviranje 403, izbris z drugimi člani 409
                    assertThat(status).isEqualTo(endpoint == Endpoint.DELETE ? 409 : 403);
                    if (endpoint == Endpoint.DELETE) {
                        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_HAS_OTHER_MEMBERS"));
                    }
                }
            }
        }
        assertThat(fixtures.exists(group)).isTrue();
        assertThat(fixtures.archivedAt(group)).isNotNull();
        assertThat(fixtures.memberCount(group)).isEqualTo(3);
    }

    @ParameterizedTest(name = "izbris edinega člana, arhivirana={0}")
    @ValueSource(booleans = {false, true})
    void soleOwnerCanDelete(boolean archived) throws Exception {
        GroupFixtures fixtures = new GroupFixtures(jdbc);
        SignedIn owner = registeredUser("OWNER");
        UUID group = fixtures.createGroup(fixtures.userId(owner.uid()), "Sam", null, "tinta");
        if (archived) {
            fixtures.archive(group);
        }

        HttpResponse<String> response = send(Endpoint.DELETE, group, Http.bearer(owner.idToken()));

        assertThat(response.statusCode())
                .isEqualTo(
                        expected(Endpoint.DELETE, Actor.OWNER, archived, true).status());
        assertThat(fixtures.exists(group)).isFalse();
    }

    @ParameterizedTest(name = "GET /api/groups/archived, {0} → 401")
    @EnumSource(
            value = Actor.class,
            names = {"NO_TOKEN", "MALFORMED_TOKEN", "EXPIRED_TOKEN"})
    void archivedListRequiresSignIn(Actor actor) throws Exception {
        SignedIn any = registeredUser("Kdorkoli");

        HttpResponse<String> response = Http.send("GET", url("/api/groups/archived"), headers(actor, Map.of(), any));

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "UNAUTHENTICATED"));
    }
}

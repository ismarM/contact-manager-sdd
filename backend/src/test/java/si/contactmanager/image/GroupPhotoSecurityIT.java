package si.contactmanager.image;

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
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije slike skupine (konstitucija III, §3.1; FR-018-05 do 08): GET (VIEWER), PUT in DELETE (ADMIN) ×
 * akter × stanje skupine. Neprijavljen 401, nečlan 404 brez telesa, VIEWER in EDITOR pri pisanju 403, ADMIN in OWNER
 * 2xx ali 409 {@code GROUP_ARCHIVED}; napaka datoteke (400) šele po 401 → 404 → 403 → 409.
 */
@Tag("FR-018-05")
@Tag("FR-018-06")
@Tag("FR-018-07")
@Tag("FR-018-08")
class GroupPhotoSecurityIT extends ImageApiTest {

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
        PUT,
        DELETE
    }

    enum State {
        ACTIVE,
        ARCHIVED,
        PERMANENTLY_ARCHIVED
    }

    record Expected(int status, String code) {}

    static Expected expected(Endpoint endpoint, Actor actor, State state) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, "UNAUTHENTICATED");
            case NON_MEMBER -> new Expected(404, null);
            // trajno arhivirana skupina nima lastnika: njegovo članstvo je izbrisano
            case OWNER -> state == State.PERMANENTLY_ARCHIVED ? new Expected(404, null) : allowed(endpoint, state);
            case VIEWER -> endpoint == Endpoint.GET ? new Expected(200, null) : new Expected(403, "FORBIDDEN");
            case EDITOR -> endpoint == Endpoint.GET ? new Expected(200, null) : new Expected(403, "FORBIDDEN");
            case ADMIN -> allowed(endpoint, state);
        };
    }

    private static Expected allowed(Endpoint endpoint, State state) {
        if (endpoint != Endpoint.GET && state != State.ACTIVE) {
            return new Expected(409, "GROUP_ARCHIVED");
        }
        return new Expected(200, null);
    }

    static Stream<Arguments> matrix() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : Endpoint.values()) {
            for (State state : State.values()) {
                for (Actor actor : Actor.values()) {
                    rows.add(Arguments.of(endpoint, actor, state));
                }
            }
        }
        return rows.stream();
    }

    private static Map<String, String> headers(Actor actor, Map<Who, SignedIn> users) {
        return switch (actor) {
            case NO_TOKEN -> Map.of();
            case MALFORMED_TOKEN -> Map.of("Authorization", "Bearer not-a-jwt");
            case EXPIRED_TOKEN ->
                Http.bearer(Tokens.withClaims(users.get(Who.OWNER).idToken(), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }));
            default -> Http.bearer(users.get(Who.valueOf(actor.name())).idToken());
        };
    }

    private HttpResponse<String> send(Endpoint endpoint, UUID group, Map<String, String> headers, byte[] file)
            throws Exception {
        return switch (endpoint) {
            case GET -> Http.send("GET", url(photoPath(group)), headers);
            case PUT ->
                multipart("PUT", photoPath(group), headers, List.of(Part.file(file), Part.field("version", "0")));
            case DELETE -> Http.send("DELETE", url(photoPath(group) + "?version=0"), headers);
        };
    }

    /** Skupina z lastnikovo sliko (verzija 1 po nalaganju), nato v želenem stanju. */
    private Scenario prepared(State state) throws Exception {
        Scenario s = scenario();
        assertThat(upload(photoPath(s.group()), s.token(Who.OWNER), TestImages.jpeg(300, 300), 0L)
                        .statusCode())
                .isEqualTo(200);
        // verzija 1: zahtevki matrike s staro verzijo 0 bi dali VERSION_CONFLICT, zato jo vrnemo na 0
        jdbc.update("update contact_group set version = 0 where id = ?", s.group());
        switch (state) {
            case ARCHIVED -> groups.archive(s.group());
            case PERMANENTLY_ARCHIVED -> groups.makePermanentlyArchived(s.group());
            default -> {}
        }
        return s;
    }

    @ParameterizedTest(name = "{0} {2}, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, State state) throws Exception {
        Scenario s = prepared(state);
        Map<String, Object> groupBefore = groups.row(s.group());
        Long revisionBefore = revisionOf("kind = 'GROUP' and group_id = ?", s.group());
        Expected expected = expected(endpoint, actor, state);

        HttpResponse<String> response = send(endpoint, s.group(), headers(actor, s.users()), TestImages.jpeg(300, 300));

        assertThat(response.statusCode()).as("status").isEqualTo(expected.status());
        if (expected.status() == 404) {
            assertThat(response.body()).as("nečlan ne izve ničesar o skupini").isEmpty();
        }
        if (expected.code() != null) {
            assertThat(json(response.body())).containsEntry("code", expected.code());
        }
        if (endpoint == Endpoint.GET && expected.status() != 200) {
            // slika se brez prijave in članstva nikoli ne vrne, tudi če je naslov znan
            assertThat(response.headers().firstValue("Content-Type").orElse("")).doesNotContain("image/");
        }
        if (expected.status() != 200 || endpoint == Endpoint.GET) {
            assertThat(groups.row(s.group())).as("skupina je nespremenjena").isEqualTo(groupBefore);
            assertThat(revisionOf("kind = 'GROUP' and group_id = ?", s.group())).isEqualTo(revisionBefore);
        } else if (endpoint == Endpoint.PUT) {
            assertThat(revisionOf("kind = 'GROUP' and group_id = ?", s.group())).isEqualTo(revisionBefore + 1);
        } else {
            assertThat(revisionOf("kind = 'GROUP' and group_id = ?", s.group())).isNull();
        }
    }

    @Test
    void unknownGroupIsNotFoundForEveryEndpoint() throws Exception {
        Scenario s = scenario();
        UUID unknown = UUID.randomUUID();
        Map<String, String> bearer = Http.bearer(s.token(Who.OWNER));

        for (Endpoint endpoint : Endpoint.values()) {
            HttpResponse<String> response = send(endpoint, unknown, bearer, TestImages.jpeg(100, 100));
            assertThat(response.statusCode()).as(endpoint.name()).isEqualTo(404);
        }
        assertThat(Http.send("GET", url("/api/groups/not-a-uuid/photo"), bearer).statusCode())
                .isEqualTo(404);
    }

    @Test
    void anotherGroupsPhotoIsNeverReachableThroughThisGroup() throws Exception {
        Scenario mine = scenario();
        Scenario other = scenario();
        upload(photoPath(other.group()), other.token(Who.OWNER), TestImages.jpeg(300, 300), 0L);

        // član skupine A za skupino B: 404, in njegova pisanja nič ne spremenijo
        for (Endpoint endpoint : Endpoint.values()) {
            HttpResponse<String> response =
                    send(endpoint, other.group(), Http.bearer(mine.token(Who.OWNER)), TestImages.jpeg(100, 100));
            assertThat(response.statusCode()).as(endpoint.name()).isEqualTo(404);
        }
        assertThat(revisionOf("kind = 'GROUP' and group_id = ?", other.group())).isEqualTo(1L);
    }

    @Test
    void invalidFileIsOnlyReportedAfterAccessAndArchiveChecks() throws Exception {
        Scenario s = scenario();
        byte[] junk = "not an image".getBytes();

        assertThat(send(Endpoint.PUT, s.group(), Map.of(), junk).statusCode()).isEqualTo(401);
        assertThat(send(Endpoint.PUT, s.group(), Http.bearer(s.token(Who.NON_MEMBER)), junk)
                        .statusCode())
                .isEqualTo(404);
        assertThat(send(Endpoint.PUT, s.group(), Http.bearer(s.token(Who.EDITOR)), junk)
                        .statusCode())
                .isEqualTo(403);
        HttpResponse<String> invalid = send(Endpoint.PUT, s.group(), Http.bearer(s.token(Who.ADMIN)), junk);
        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(invalid.body())).containsEntry("file", "INVALID_IMAGE");

        groups.archive(s.group());
        assertThat(send(Endpoint.PUT, s.group(), Http.bearer(s.token(Who.ADMIN)), junk)
                        .statusCode())
                .isEqualTo(409);
    }
}

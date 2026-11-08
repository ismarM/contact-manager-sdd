package si.contactmanager.invitation;

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
import si.contactmanager.invitation.support.InvitationApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov skupine v 006 (konstitucija III, workflow.md §2.5; FR-006-02, FR-006-13, FR-006-14):
 * {@code POST}, {@code GET} {@code …/invitations} in {@code DELETE …/invitations/{invitationId}} × akter × stanje
 * skupine. Neprijavljen 401, nečlan 404 brez telesa, VIEWER/EDITOR 403 (tudi v arhivirani), ADMIN/OWNER: uspeh ali 409.
 */
@Tag("FR-006-02")
@Tag("FR-006-13")
@Tag("FR-006-14")
class InvitationIsolationMatrixSecurityIT extends InvitationApiTest {

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
        SEND,
        LIST,
        WITHDRAW
    }

    record Expected(int status, Map<String, Object> body) {}

    static Expected expected(Endpoint endpoint, Actor actor, boolean archived) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER, EDITOR -> new Expected(403, Map.of("code", "FORBIDDEN"));
            case ADMIN, OWNER ->
                switch (endpoint) {
                    case SEND ->
                        archived ? new Expected(409, Map.of("code", "GROUP_ARCHIVED")) : new Expected(201, null);
                    case LIST -> new Expected(200, null);
                    case WITHDRAW -> new Expected(204, null);
                };
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
        Map<Actor, SignedIn> users = new EnumMap<>(Actor.class);
        for (Actor member : List.of(Actor.NON_MEMBER, Actor.VIEWER, Actor.EDITOR, Actor.ADMIN, Actor.OWNER)) {
            users.put(member, registeredUser(member.name()));
        }
        SignedIn invitee = registeredUser("INVITEE");
        UUID group = groups.createGroup(id(users.get(Actor.OWNER)), "Matrika");
        for (Actor member : List.of(Actor.VIEWER, Actor.EDITOR, Actor.ADMIN)) {
            groups.addMember(group, id(users.get(member)), member.name());
        }
        SignedIn other = registeredUser("DRUGI");
        UUID pending = invitations.invite(group, id(other), id(users.get(Actor.OWNER)), "EDITOR");
        if (archived) {
            groups.archive(group);
        }
        int membersBefore = groups.memberCount(group);
        Map<String, String> headers = headers(actor, users, users.get(Actor.OWNER));
        String path = "/api/groups/" + group + "/invitations";

        HttpResponse<String> response = switch (endpoint) {
            case SEND -> Http.send("POST", url(path), headers, body(email(invitee), "EDITOR"));
            case LIST -> Http.send("GET", url(path), headers);
            case WITHDRAW -> Http.send("DELETE", url(path + "/" + pending), headers);
        };

        Expected expected = expected(endpoint, actor, archived);
        assertThat(response.statusCode()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404) {
            assertThat(response.body()).isEmpty();
        }
        boolean succeeded = expected.status() < 300;
        int expectedInvitations = switch (endpoint) {
            case SEND -> succeeded ? 2 : 1;
            case LIST -> 1;
            case WITHDRAW -> succeeded ? 0 : 1;
        };
        assertThat(invitations.count(group)).isEqualTo(expectedInvitations);
        assertThat(groups.memberCount(group)).isEqualTo(membersBefore);
    }

    @ParameterizedTest(name = "{0} na trajno arhivirani skupini")
    @EnumSource(
            value = Actor.class,
            names = {"NO_TOKEN", "NON_MEMBER", "VIEWER", "EDITOR", "ADMIN"})
    void permanentlyArchivedGroupMatrix(Actor actor) throws Exception {
        Map<Actor, SignedIn> users = new EnumMap<>(Actor.class);
        for (Actor member : List.of(Actor.NON_MEMBER, Actor.VIEWER, Actor.EDITOR, Actor.ADMIN, Actor.OWNER)) {
            users.put(member, registeredUser(member.name()));
        }
        SignedIn invitee = registeredUser("INVITEE");
        UUID group = groups.createGroup(id(users.get(Actor.OWNER)), "Trajna");
        for (Actor member : List.of(Actor.VIEWER, Actor.EDITOR, Actor.ADMIN)) {
            groups.addMember(group, id(users.get(member)), member.name());
        }
        groups.makePermanentlyArchived(group);
        Map<String, String> headers = headers(actor, users, users.get(Actor.VIEWER));
        String path = "/api/groups/" + group + "/invitations";

        int send = Http.send("POST", url(path), headers, body(email(invitee), "EDITOR"))
                .statusCode();
        int list = Http.send("GET", url(path), headers).statusCode();
        UUID pending = invitations.invite(group, id(invitee), id(users.get(Actor.OWNER)), "EDITOR");
        int withdraw = Http.send("DELETE", url(path + "/" + pending), headers).statusCode();

        switch (actor) {
            case NO_TOKEN -> assertThat(List.of(send, list, withdraw)).containsExactly(401, 401, 401);
            case NON_MEMBER -> assertThat(List.of(send, list, withdraw)).containsExactly(404, 404, 404);
            case VIEWER, EDITOR -> assertThat(List.of(send, list, withdraw)).containsExactly(403, 403, 403);
            default -> assertThat(List.of(send, list, withdraw)).containsExactly(409, 200, 204);
        }
        assertThat(invitations.exists(pending)).isEqualTo(actor != Actor.ADMIN);
    }

    @ParameterizedTest(name = "neobstoječa skupina z veljavnim uuid, {0}")
    @ValueSource(strings = {"POST", "GET", "DELETE"})
    void nonexistentGroupIs404ForAnyMethod(String method) throws Exception {
        SignedIn user = registeredUser("Kdorkoli");
        String path = "/api/groups/" + UUID.randomUUID() + "/invitations"
                + (method.equals("DELETE") ? "/" + UUID.randomUUID() : "");

        HttpResponse<String> response =
                Http.send(method, url(path), Http.bearer(user.idToken()), method.equals("POST") ? "{}" : null);

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @ParameterizedTest(name = "neveljaven uuid skupine, {0}")
    @ValueSource(strings = {"POST", "GET", "DELETE"})
    void malformedGroupIdIs404ForAnyMethod(String method) throws Exception {
        SignedIn user = registeredUser("Kdorkoli");
        String path = "/api/groups/ni-uuid/invitations" + (method.equals("DELETE") ? "/" + UUID.randomUUID() : "");

        HttpResponse<String> response =
                Http.send(method, url(path), Http.bearer(user.idToken()), method.equals("POST") ? "{}" : null);

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }
}

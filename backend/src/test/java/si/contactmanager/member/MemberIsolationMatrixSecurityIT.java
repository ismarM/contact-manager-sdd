package si.contactmanager.member;

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
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.member.support.MemberApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije vseh petih endpointov 007 (konstitucija III in §3.1): seznam, sprememba vloge, odstranitev,
 * zapuščanje, prenos lastništva × akter × stanje skupine. Neprijavljen 401, nečlan 404 brez telesa, VIEWER/EDITOR 403
 * pri pisanju (tudi v arhivirani), ADMIN/OWNER uspeh ali 409; pričakovanja so ročno določena (spec.md, negativni scenariji).
 */
class MemberIsolationMatrixSecurityIT extends MemberApiTest {

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
        LIST,
        CHANGE_ROLE,
        REMOVE,
        LEAVE,
        TRANSFER
    }

    record Expected(int status, Map<String, Object> body) {}

    private static final Map<String, Object> UNAUTHENTICATED = Map.of("code", "UNAUTHENTICATED");
    private static final Map<String, Object> FORBIDDEN = Map.of("code", "FORBIDDEN");
    private static final Map<String, Object> ARCHIVED = Map.of("code", "GROUP_ARCHIVED");

    /** Ročno določena pričakovanja (ne iz izvedbe). */
    static Expected expected(Endpoint endpoint, Actor actor, boolean archived) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, UNAUTHENTICATED);
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER, EDITOR ->
                switch (endpoint) {
                    case LIST -> new Expected(200, null);
                    case LEAVE -> new Expected(204, null);
                    default -> new Expected(403, FORBIDDEN);
                };
            case ADMIN ->
                switch (endpoint) {
                    case LIST -> new Expected(200, null);
                    case CHANGE_ROLE -> archived ? new Expected(409, ARCHIVED) : new Expected(200, null);
                    case REMOVE -> archived ? new Expected(409, ARCHIVED) : new Expected(204, null);
                    case LEAVE -> new Expected(204, null);
                    case TRANSFER -> new Expected(403, FORBIDDEN);
                };
            case OWNER ->
                switch (endpoint) {
                    case LIST -> new Expected(200, null);
                    case CHANGE_ROLE -> archived ? new Expected(409, ARCHIVED) : new Expected(200, null);
                    case REMOVE -> archived ? new Expected(409, ARCHIVED) : new Expected(204, null);
                    case LEAVE -> new Expected(409, Map.of("code", "OWNER_CANNOT_LEAVE"));
                    case TRANSFER -> archived ? new Expected(409, ARCHIVED) : new Expected(200, null);
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

    @Tag("FR-007-01")
    @Tag("FR-007-03")
    @Tag("FR-007-05")
    @Tag("FR-007-06")
    @Tag("FR-007-09")
    @Tag("FR-007-10")
    @ParameterizedTest(name = "{0} {2} skupina, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, boolean archived) throws Exception {
        Map<Actor, SignedIn> users = new EnumMap<>(Actor.class);
        for (Actor member : List.of(Actor.NON_MEMBER, Actor.VIEWER, Actor.EDITOR, Actor.ADMIN, Actor.OWNER)) {
            users.put(member, registeredUser(member.name()));
        }
        SignedIn target = registeredUser("CILJ");
        UUID group = groups.createGroup(id(users.get(Actor.OWNER)), "Matrika");
        for (Actor member : List.of(Actor.VIEWER, Actor.EDITOR, Actor.ADMIN)) {
            groups.addMember(group, id(users.get(member)), member.name());
        }
        UUID targetId = join(group, target, "VIEWER");
        if (archived) {
            groups.archive(group);
        }
        int membersBefore = members.count(group);
        Map<String, String> headers = headers(actor, users, users.get(Actor.OWNER));
        String base = "/api/groups/" + group;

        HttpResponse<String> response = switch (endpoint) {
            case LIST -> Http.send("GET", url(base + "/members"), headers);
            case CHANGE_ROLE -> Http.send("PUT", url(base + "/members/" + targetId), headers, roleBody("EDITOR", 0));
            case REMOVE -> Http.send("DELETE", url(base + "/members/" + targetId), headers);
            case LEAVE -> Http.send("POST", url(base + "/leave"), headers, null);
            case TRANSFER -> Http.send("POST", url(base + "/ownership-transfer"), headers, transferBody(targetId));
        };

        Expected expected = expected(endpoint, actor, archived);
        assertThat(response.statusCode()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404 || expected.status() == 204) {
            assertThat(response.body()).isEmpty();
        }
        boolean denied = expected.status() >= 400;
        if (denied) {
            assertThat(members.count(group)).as("članstva ob zavrnitvi").isEqualTo(membersBefore);
            assertThat(members.role(group, id(target))).contains("VIEWER");
            assertThat(members.ownerCount(group)).isEqualTo(1);
        }
    }

    @org.junit.jupiter.api.Test
    void matrixHasEveryEndpointActorAndStateCombination() {
        assertThat(matrix().count()).isEqualTo(5 * 8 * 2);
        assertThat(unknownGroups().count()).isEqualTo(5 * 2);
        assertThat(bogusTargets().count()).isEqualTo(2 * 8);
    }

    static Stream<Arguments> unknownGroups() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : Endpoint.values()) {
            rows.add(Arguments.of(endpoint, UUID.randomUUID().toString()));
            rows.add(Arguments.of(endpoint, "ni-uuid"));
        }
        return rows.stream();
    }

    @Tag("FR-007-01")
    @Tag("FR-007-03")
    @Tag("FR-007-05")
    @Tag("FR-007-06")
    @Tag("FR-007-09")
    @ParameterizedTest(name = "{0}: neobstoječa skupina {1} → 404")
    @MethodSource("unknownGroups")
    void unknownOrInvalidGroupIs404ForAnAuthenticatedUser(Endpoint endpoint, String group) throws Exception {
        SignedIn user = registeredUser("TUJEC");
        Map<String, String> headers = Http.bearer(user.idToken());
        String base = "/api/groups/" + group;
        UUID member = UUID.randomUUID();

        HttpResponse<String> response = switch (endpoint) {
            case LIST -> Http.send("GET", url(base + "/members"), headers);
            case CHANGE_ROLE -> Http.send("PUT", url(base + "/members/" + member), headers, roleBody("EDITOR", 0));
            case REMOVE -> Http.send("DELETE", url(base + "/members/" + member), headers);
            case LEAVE -> Http.send("POST", url(base + "/leave"), headers, null);
            case TRANSFER -> Http.send("POST", url(base + "/ownership-transfer"), headers, transferBody(member));
        };

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @Tag("FR-007-03")
    @Tag("FR-007-05")
    @ParameterizedTest(name = "{0}, {1}: memberId ni v skupini")
    @MethodSource("bogusTargets")
    void unknownForeignOrInvalidMemberIdFollowsTheAuthorizationOrder(Endpoint endpoint, Actor actor) throws Exception {
        Map<Actor, SignedIn> users = new EnumMap<>(Actor.class);
        for (Actor member : List.of(Actor.NON_MEMBER, Actor.VIEWER, Actor.EDITOR, Actor.ADMIN, Actor.OWNER)) {
            users.put(member, registeredUser(member.name()));
        }
        UUID group = groups.createGroup(id(users.get(Actor.OWNER)), "Matrika");
        for (Actor member : List.of(Actor.VIEWER, Actor.EDITOR, Actor.ADMIN)) {
            groups.addMember(group, id(users.get(member)), member.name());
        }
        SignedIn otherOwner = registeredUser("DRUGA");
        UUID other = groups.createGroup(id(otherOwner), "Druga");
        UUID foreign = members.memberId(other, id(otherOwner));
        Map<String, String> headers = headers(actor, users, users.get(Actor.OWNER));
        int expected = switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> 401;
            case NON_MEMBER -> 404;
            case VIEWER, EDITOR -> 403;
            case ADMIN, OWNER -> 404;
        };

        for (Object unknown : List.of(UUID.randomUUID(), foreign, "ni-uuid")) {
            String path = "/api/groups/" + group + "/members/" + unknown;
            HttpResponse<String> response = endpoint == Endpoint.CHANGE_ROLE
                    ? Http.send("PUT", url(path), headers, roleBody("EDITOR", 0))
                    : Http.send("DELETE", url(path), headers);
            assertThat(response.statusCode()).as("%s %s", actor, unknown).isEqualTo(expected);
        }
        assertThat(members.role(other, id(otherOwner))).contains("OWNER");
    }

    static Stream<Arguments> bogusTargets() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : List.of(Endpoint.CHANGE_ROLE, Endpoint.REMOVE)) {
            for (Actor actor : Actor.values()) {
                rows.add(Arguments.of(endpoint, actor));
            }
        }
        return rows.stream();
    }
}

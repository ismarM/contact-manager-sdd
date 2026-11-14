package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.contact.support.BulkApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov 009 (konstitucija III in §3.1; FR-009-03, -11, -15, -18): štirje endpointi ×
 * akter × stanje skupine, nato identiteta kontakta druge skupine. Neprijavljen 401, nečlan 404 brez telesa, bralec pri
 * pisanju 403, urednik in višje uspeh ali 409 GROUP_ARCHIVED; branje je dovoljeno vsem članom tudi v arhivirani skupini.
 */
@Tag("FR-009-03")
@Tag("FR-009-11")
@Tag("FR-009-15")
@Tag("FR-009-18")
class BulkIsolationMatrixSecurityIT extends BulkApiTest {

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
        CONTACT_IDS,
        SELECTION_CHECK,
        BULK_UPDATE,
        BULK_DELETE
    }

    record Expected(int status, Map<String, Object> body) {}

    static boolean writes(Endpoint endpoint) {
        return endpoint == Endpoint.BULK_UPDATE || endpoint == Endpoint.BULK_DELETE;
    }

    static Expected expected(Endpoint endpoint, Actor actor, boolean archived) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER -> writes(endpoint) ? new Expected(403, Map.of("code", "FORBIDDEN")) : new Expected(200, null);
            case EDITOR, ADMIN, OWNER ->
                writes(endpoint) && archived
                        ? new Expected(409, Map.of("code", "GROUP_ARCHIVED"))
                        : new Expected(200, null);
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

    private HttpResponse<String> send(Endpoint endpoint, UUID group, UUID contact, Map<String, String> headers)
            throws Exception {
        return switch (endpoint) {
            case CONTACT_IDS -> Http.send("GET", url(contactIdsPath(group)), headers);
            case SELECTION_CHECK ->
                Http.send("POST", url(selectionCheckPath(group)), headers, body(request(List.of(contact))));
            case BULK_UPDATE ->
                Http.send(
                        "POST",
                        url(bulkUpdatePath(group)),
                        headers,
                        body(request(List.of(contact), "addTags", List.of("nova"))));
            case BULK_DELETE -> Http.send("POST", url(bulkDeletePath(group)), headers, body(request(List.of(contact))));
        };
    }

    @ParameterizedTest(name = "{0} {2} skupina, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        contacts.addTag(contact, 0, "vip");
        if (archived) {
            groups.archive(s.group());
        }
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = send(endpoint, s.group(), contact, headers(actor, s.users()));

        Expected expected = expected(endpoint, actor, archived);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404) {
            assertThat(response.body()).isEmpty();
        }
        boolean mutated = expected.status() == 200 && writes(endpoint);
        if (mutated) {
            String key = endpoint == Endpoint.BULK_UPDATE ? "changed" : "deleted";
            assertThat(json(response.body())).as("uspešen odgovor " + endpoint).containsEntry(key, 1);
        }
        if (!mutated) {
            assertUnchanged(before, snapshot(s.group()));
        }
    }

    @ParameterizedTest(name = "neobstoječa skupina, {0}")
    @EnumSource(Endpoint.class)
    void aNonExistentGroupIsNotFound(Endpoint endpoint) throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                send(endpoint, UUID.randomUUID(), UUID.randomUUID(), Http.bearer(s.token(Who.OWNER)));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @ParameterizedTest(name = "kontakt druge skupine, {0}, {1}")
    @MethodSource("foreignIdentityCases")
    void anIdentityOfAnotherGroupIsNotFoundForEveryRoleOfAMemberOfBothGroups(Endpoint endpoint, Actor actor)
            throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        if (who != Who.OWNER) {
            groups.addMember(other, s.id(who), who.name());
        }
        UUID mine = contacts.insert(s.group(), s.id(Who.OWNER), "Moj", "Kontakt");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        Snapshot beforeA = snapshot(s.group());
        Snapshot beforeB = snapshot(other);
        UUID target = foreign;

        // Identiteta tuje skupine je 404 že v koraku 2 (pred 403), tudi če je druga identiteta v skupini veljavna.
        HttpResponse<String> response = switch (endpoint) {
            case SELECTION_CHECK -> selectionCheck(s.token(who), s.group(), request(List.of(mine, target)));
            case BULK_UPDATE ->
                bulkUpdate(s.token(who), s.group(), request(List.of(mine, target), "addTags", List.of("nova")));
            default -> bulkDelete(s.token(who), s.group(), request(List.of(mine, target)));
        };

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertUnchanged(beforeA, snapshot(s.group()));
        assertUnchanged(beforeB, snapshot(other));
    }

    @ParameterizedTest(name = "kontakt druge skupine v queries[0].{1}, {0}")
    @MethodSource("foreignIdentityInQueryCases")
    void anIdentityOfAnotherGroupInsideAQueryIsNotFound(Actor actor, String listField) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        if (who != Who.OWNER) {
            groups.addMember(other, s.id(who), who.name());
        }
        UUID mine = contacts.insert(s.group(), s.id(Who.OWNER), "Moj", "Kontakt");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        Snapshot beforeA = snapshot(s.group());
        Snapshot beforeB = snapshot(other);
        Map<String, Object> query = "contactIds".equals(listField)
                ? checkQuery(List.of("vip"), List.of(mine, foreign), List.of())
                : checkQuery(List.of("vip"), List.of(mine), List.of(foreign));

        HttpResponse<String> response =
                selectionCheck(s.token(who), s.group(), request(List.of(mine), "queries", List.of(query)));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertUnchanged(beforeA, snapshot(s.group()));
        assertUnchanged(beforeB, snapshot(other));
    }

    static Stream<Arguments> foreignIdentityInQueryCases() {
        List<Arguments> rows = new ArrayList<>();
        for (Actor actor : List.of(Actor.VIEWER, Actor.EDITOR, Actor.ADMIN, Actor.OWNER)) {
            for (String field : List.of("contactIds", "excludedIds")) {
                rows.add(Arguments.of(actor, field));
            }
        }
        return rows.stream();
    }

    static Stream<Arguments> foreignIdentityCases() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : List.of(Endpoint.SELECTION_CHECK, Endpoint.BULK_UPDATE, Endpoint.BULK_DELETE)) {
            for (Actor actor : List.of(Actor.VIEWER, Actor.EDITOR, Actor.ADMIN, Actor.OWNER)) {
                rows.add(Arguments.of(endpoint, actor));
            }
        }
        return rows.stream();
    }
}

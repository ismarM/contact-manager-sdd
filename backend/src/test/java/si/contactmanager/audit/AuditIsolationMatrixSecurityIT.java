package si.contactmanager.audit;

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
import si.contactmanager.audit.support.AuditApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov 005 (konstitucija III in §3.1): vseh pet endpointov × akter × stanje skupine,
 * nato vnos druge skupine. Neprijavljen 401, nečlan 404 brez telesa, bralec in urednik pri rollbacku 403, admin in
 * lastnik uspeh ali 409 GROUP_ARCHIVED (§2.2); PUT/PATCH/DELETE vnosa 405 brez telesa.
 */
@Tag("FR-005-05")
@Tag("FR-005-07")
@Tag("FR-005-08")
@Tag("FR-005-09")
@Tag("FR-005-10")
@Tag("FR-005-11")
@Tag("FR-005-17")
class AuditIsolationMatrixSecurityIT extends AuditApiTest {

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
        ENTRY,
        CHANGES,
        ROLLBACK,
        INITIAL_ROLLBACK
    }

    record Expected(int status, Map<String, Object> body) {}

    static boolean rollsBack(Endpoint endpoint) {
        return endpoint == Endpoint.ROLLBACK || endpoint == Endpoint.INITIAL_ROLLBACK;
    }

    static Expected expected(Endpoint endpoint, Actor actor, boolean archived) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER, EDITOR -> rollsBack(endpoint) ? new Expected(403, Map.of("code", "FORBIDDEN")) : ok();
            case ADMIN, OWNER -> {
                if (!rollsBack(endpoint)) {
                    yield ok();
                }
                yield archived ? new Expected(409, Map.of("code", "GROUP_ARCHIVED")) : new Expected(201, null);
            }
        };
    }

    private static Expected ok() {
        return new Expected(200, null);
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

    private HttpResponse<String> send(
            Endpoint endpoint, UUID group, UUID entry, UUID latest, Map<String, String> headers) throws Exception {
        String body = body(rollbackBody(latest));
        return switch (endpoint) {
            case LIST -> Http.send("GET", url(auditPath(group)), headers);
            case ENTRY -> Http.send("GET", url(entryPath(group, entry)), headers);
            case CHANGES -> Http.send("GET", url(entryPath(group, entry) + "/changes"), headers);
            case ROLLBACK -> Http.send("POST", url(rollbackPath(group, entry)), headers, body);
            case INITIAL_ROLLBACK -> Http.send("POST", url(initialRollbackPath(group)), headers, body);
        };
    }

    /** Skupina z dvema vnosoma (dodajanje, urejanje) kontakta Ana; vrne id kontakta. */
    private UUID twoEntries(Scenario s) throws Exception {
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> values = valuesOf(a);
        values.put("phone", "02 222 222");
        update(s, Who.EDITOR, idOf(a), values, versionOf(a));
        return idOf(a);
    }

    @ParameterizedTest(name = "{0} {2} skupina, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        UUID contact = twoEntries(s);
        UUID first = (UUID) audit.entries(s.group()).get(0).get("id");
        UUID latest = audit.latestEntryId(s.group());
        if (archived) {
            groups.archive(s.group());
        }
        Map<String, Object> rowBefore = contacts.row(contact);
        int entriesBefore = audit.count(s.group());

        HttpResponse<String> response = send(endpoint, s.group(), first, latest, headers(actor, s.users()));

        Expected expected = expected(endpoint, actor, archived);
        assertThat(response.statusCode()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404) {
            assertThat(response.body()).isEmpty();
        }
        if (expected.status() != 201) {
            assertThat(audit.count(s.group())).isEqualTo(entriesBefore);
            assertThat(contacts.row(contact)).isEqualTo(rowBefore);
            assertThat(contacts.count(s.group())).isEqualTo(1);
        }
    }

    @ParameterizedTest(name = "vnos druge skupine, {0}")
    @EnumSource(
            value = Actor.class,
            names = {"VIEWER", "EDITOR", "ADMIN", "OWNER"})
    void anEntryOfAnotherGroupIsNotFoundForEveryRoleOfAMemberOfBothGroups(Actor actor) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        if (who != Who.OWNER) {
            groups.addMember(other, s.id(who), who.name());
        }
        Map<String, Object> foreignContact = asObject(
                json(post(contactsPath(other), s.token(Who.OWNER), body(contactInput("Tuj", "Kontakt", "01 999 999")))
                        .body()));
        UUID foreign = (UUID) audit.entries(other).get(0).get("id");
        UUID latest = audit.latestEntryId(other);
        Map<String, String> headers = Http.bearer(s.token(who));

        for (Endpoint endpoint : List.of(Endpoint.ENTRY, Endpoint.CHANGES, Endpoint.ROLLBACK)) {
            HttpResponse<String> response = send(endpoint, s.group(), foreign, latest, headers);

            // Vnos druge skupine je 404 v koraku 2, pred preverjanjem vloge – tudi za bralca.
            assertThat(response.statusCode()).as(endpoint.name()).isEqualTo(404);
            assertThat(response.body()).as(endpoint.name()).isEmpty();
        }
        HttpResponse<String> filtered =
                get(auditPath(s.group()) + "?contact=" + foreignContact.get("id"), s.token(who));
        assertThat(filtered.statusCode()).isEqualTo(200);
        assertThat(json(filtered.body())).containsEntry("total", 0);
        assertThat(audit.count(other)).isEqualTo(1);
        assertThat(contacts.count(other)).isEqualTo(1);
    }

    @ParameterizedTest(name = "{0} na vnos, {1}")
    @MethodSource("changingMethods")
    void changingOrDeletingAnEntryIsMethodNotAllowedWithoutABody(String method, Actor actor) throws Exception {
        Scenario s = scenario();
        twoEntries(s);
        UUID entry = (UUID) audit.entries(s.group()).get(0).get("id");

        HttpResponse<String> response = Http.send(method, url(entryPath(s.group(), entry)), headers(actor, s.users()));

        if (actor == Actor.NO_TOKEN || actor == Actor.MALFORMED_TOKEN || actor == Actor.EXPIRED_TOKEN) {
            assertThat(response.statusCode()).isEqualTo(401);
        } else {
            assertThat(response.statusCode()).isEqualTo(405);
            assertThat(response.body()).isEmpty();
        }
        assertThat(audit.count(s.group())).isEqualTo(2);
    }

    static Stream<Arguments> changingMethods() {
        List<Arguments> rows = new ArrayList<>();
        for (String method : List.of("PUT", "PATCH", "DELETE")) {
            for (Actor actor : Actor.values()) {
                rows.add(Arguments.of(method, actor));
            }
        }
        return rows.stream();
    }
}

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
import si.contactmanager.audit.support.HistoryApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov 015 (konstitucija III in §3.1): vseh osem endpointov × akter × stanje skupine, nato kontakt
 * in vnos druge skupine. Neprijavljen 401, nečlan 404 brez telesa, branje VIEWER+ tudi v arhivirani skupini, obnova
 * EDITOR+ (VIEWER 403, arhivirana 409 GROUP_ARCHIVED); pisanje na bralne poti je 405.
 */
@Tag("FR-015-01")
@Tag("FR-015-05")
@Tag("FR-015-08")
@Tag("FR-015-09")
@Tag("FR-015-10")
@Tag("FR-015-16")
@Tag("FR-015-21")
@Tag("FR-015-22")
class AuditHistoryIsolationMatrixSecurityIT extends HistoryApiTest {

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
        LIST_BY_ACTOR,
        ACTORS,
        HISTORY,
        VERSION,
        COMPARE,
        PREVIEW,
        RESTORE,
        DELETED
    }

    record Expected(int status, Map<String, Object> body) {}

    static Expected expected(Endpoint endpoint, Actor actor, boolean archived) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER ->
                endpoint == Endpoint.RESTORE ? new Expected(403, Map.of("code", "FORBIDDEN")) : new Expected(200, null);
            case EDITOR, ADMIN, OWNER -> {
                if (endpoint != Endpoint.RESTORE) {
                    yield new Expected(200, null);
                }
                yield archived ? new Expected(409, Map.of("code", "GROUP_ARCHIVED")) : new Expected(201, null);
            }
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

    private HttpResponse<String> send(
            Endpoint endpoint, UUID group, UUID contact, UUID entry, long version, Map<String, String> headers)
            throws Exception {
        String base = contactPath(group, contact);
        return switch (endpoint) {
            case LIST_BY_ACTOR -> Http.send("GET", url(auditPath(group) + "?actor=deleted"), headers);
            case ACTORS -> Http.send("GET", url(actorsPath(group)), headers);
            case HISTORY -> Http.send("GET", url(base + "/history"), headers);
            case VERSION -> Http.send("GET", url(base + "/versions/" + entry), headers);
            case COMPARE -> Http.send("GET", url(base + "/compare?from=" + entry + "&to=current"), headers);
            case PREVIEW -> Http.send("GET", url(base + "/restore-preview?from=" + entry), headers);
            case RESTORE -> Http.send("POST", url(base + "/restore"), headers, body(restoreBody(entry, version)));
            case DELETED -> Http.send("GET", url(deletedPath(group)), headers);
        };
    }

    /** Skupina z dvema vnosoma (dodajanje, urejanje) kontakta Ana; vrne njen id in verzijo. */
    private Map<String, Object> twoEntries(Scenario s) throws Exception {
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        return update(s, Who.EDITOR, idOf(a), withPhone(a, "+38690222221"), versionOf(a));
    }

    @ParameterizedTest(name = "{0} {2} skupina, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        Map<String, Object> contact = twoEntries(s);
        UUID id = idOf(contact);
        UUID first = (UUID) audit.entries(s.group()).get(0).get("id");
        if (archived) {
            groups.archive(s.group());
        }
        Map<String, Object> rowBefore = contacts.row(id);
        int entriesBefore = audit.count(s.group());

        HttpResponse<String> response =
                send(endpoint, s.group(), id, first, versionOf(contact), headers(actor, s.users()));

        Expected expected = expected(endpoint, actor, archived);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404) {
            assertThat(response.body()).isEmpty();
        }
        if (expected.status() != 201) {
            assertThat(audit.count(s.group())).isEqualTo(entriesBefore);
            assertThat(contacts.row(id)).isEqualTo(rowBefore);
        } else {
            assertThat(audit.count(s.group())).isEqualTo(entriesBefore + 1);
        }
    }

    @ParameterizedTest(name = "kontakt in vnos druge skupine, {0}")
    @EnumSource(
            value = Actor.class,
            names = {"VIEWER", "EDITOR", "ADMIN", "OWNER"})
    void aContactAndEntryOfAnotherGroupAreNotFoundForEveryRoleOfAMemberOfBothGroups(Actor actor) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        if (who != Who.OWNER) {
            groups.addMember(other, s.id(who), who.name());
        }
        Map<String, Object> foreign = asObject(
                json(post(contactsPath(other), s.token(Who.OWNER), body(contactInput("Tuj", "Kontakt", "+38690999999")))
                        .body()));
        Map<String, Object> mine = create(s, Who.EDITOR, contactInput("Moj", "Kontakt", "+38690111111"));
        UUID foreignEntry = (UUID) audit.entries(other).get(0).get("id");
        UUID myEntry = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, String> headers = Http.bearer(s.token(who));
        int entriesOther = audit.count(other);
        int entriesMine = audit.count(s.group());

        for (Endpoint endpoint :
                List.of(Endpoint.HISTORY, Endpoint.VERSION, Endpoint.COMPARE, Endpoint.PREVIEW, Endpoint.RESTORE)) {
            // Kontakt druge skupine prek moje skupine.
            HttpResponse<String> byContact =
                    send(endpoint, s.group(), idOf(foreign), foreignEntry, versionOf(foreign), headers);
            assertThat(byContact.statusCode())
                    .as(endpoint + " kontakt druge skupine")
                    .isEqualTo(404);
            assertThat(byContact.body()).isEmpty();
        }
        for (Endpoint endpoint : List.of(Endpoint.VERSION, Endpoint.COMPARE, Endpoint.PREVIEW, Endpoint.RESTORE)) {
            // Moj kontakt z vnosom druge skupine (različica druge skupine).
            HttpResponse<String> byEntry =
                    send(endpoint, s.group(), idOf(mine), foreignEntry, versionOf(mine), headers);
            int expected = endpoint == Endpoint.RESTORE && who == Who.VIEWER ? 403 : 404;
            assertThat(byEntry.statusCode())
                    .as(endpoint + " vnos druge skupine")
                    .isEqualTo(expected);
        }
        assertThat(get(historyPath(other, idOf(foreign)), s.token(who)).statusCode())
                .isEqualTo(200);
        HttpResponse<String> deleted = get(deletedPath(s.group()), s.token(who));
        assertThat(json(deleted.body())).containsEntry("total", 0);
        HttpResponse<String> filtered = get(auditPath(s.group()) + "?actor=deleted", s.token(who));
        assertThat(json(filtered.body())).containsEntry("total", 0);
        assertThat(audit.count(other)).isEqualTo(entriesOther);
        assertThat(audit.count(s.group())).isEqualTo(entriesMine);
        assertThat(myEntry).isNotNull();
    }

    @ParameterizedTest(name = "{0} na bralne poti, {1}")
    @MethodSource("writingMethods")
    void readingPathsRejectWritingMethodsWithoutABody(String method, Actor actor) throws Exception {
        Scenario s = scenario();
        Map<String, Object> contact = twoEntries(s);
        String path = historyPath(s.group(), idOf(contact));

        HttpResponse<String> response = Http.send(method, url(path), headers(actor, s.users()));

        if (actor == Actor.NO_TOKEN || actor == Actor.MALFORMED_TOKEN || actor == Actor.EXPIRED_TOKEN) {
            assertThat(response.statusCode()).isEqualTo(401);
        } else {
            assertThat(response.statusCode()).isIn(404, 405);
            assertThat(response.body()).isEmpty();
        }
        assertThat(audit.count(s.group())).isEqualTo(2);
    }

    static Stream<Arguments> writingMethods() {
        List<Arguments> rows = new ArrayList<>();
        for (String method : List.of("POST", "PUT", "PATCH", "DELETE")) {
            for (Actor actor : Actor.values()) {
                rows.add(Arguments.of(method, actor));
            }
        }
        return rows.stream();
    }
}

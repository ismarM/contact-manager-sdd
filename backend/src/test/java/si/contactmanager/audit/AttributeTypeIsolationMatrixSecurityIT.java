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
import si.contactmanager.audit.support.TypedAuditApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov sledi, zgodovine, rollbacka in obnove v delu 016 (konstitucija III in §3.1;
 * FR-016-26): sled s filtrom {@code ATTRIBUTE_TYPE}, vnos in spremembe, rollback in začetno stanje, zgodovina,
 * različica, primerjava in obnova kontakta × akter × stanje skupine, nato viri druge skupine. Neprijavljen 401,
 * nečlan 404 brez telesa, branje VIEWER 200 (tudi arhivirana), rollback samo ADMIN (EDITOR in VIEWER 403, arhivirana
 * 409), obnova EDITOR (VIEWER 403, arhivirana 409).
 */
@Tag("FR-016-26")
class AttributeTypeIsolationMatrixSecurityIT extends TypedAuditApiTest {

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
        AUDIT_TYPE_LIST,
        ENTRY,
        CHANGES,
        ROLLBACK,
        INITIAL_ROLLBACK,
        HISTORY,
        VERSION,
        COMPARE,
        RESTORE
    }

    record Expected(int status, Map<String, Object> body) {}

    static boolean rollsBack(Endpoint endpoint) {
        return endpoint == Endpoint.ROLLBACK || endpoint == Endpoint.INITIAL_ROLLBACK;
    }

    static Expected expected(Endpoint endpoint, Actor actor, boolean archived) {
        Expected forbidden = new Expected(403, Map.of("code", "FORBIDDEN"));
        Expected archivedRefused = new Expected(409, Map.of("code", "GROUP_ARCHIVED"));
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER -> rollsBack(endpoint) || endpoint == Endpoint.RESTORE ? forbidden : new Expected(200, null);
            case EDITOR ->
                rollsBack(endpoint)
                        ? forbidden
                        : endpoint == Endpoint.RESTORE
                                ? (archived ? archivedRefused : new Expected(201, null))
                                : new Expected(200, null);
            case ADMIN, OWNER ->
                rollsBack(endpoint) || endpoint == Endpoint.RESTORE
                        ? (archived ? archivedRefused : new Expected(201, null))
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

    /** Skupina s kontaktom, spremembo tipa ključa (vnos 2) in preimenovanjem (vnos 3). */
    private record Fixture(UUID contact, UUID created, UUID typed, long version) {}

    private Fixture fixture(Scenario s) throws Exception {
        Map<String, Object> ana = createWithAttribute(s, "Ana", "Mobilni", "041 123 456");
        UUID created = (UUID) audit.entries(s.group()).get(0).get("id");
        UUID typed = changeTypeOk(s, "mobilni", "PHONE", 0);
        Map<String, Object> current = detail(s, idOf(ana));
        Map<String, Object> values = valuesOf(current);
        values.put("firstName", "Anica");
        Map<String, Object> renamed = update(s, Who.EDITOR, idOf(ana), values, versionOf(current));
        return new Fixture(idOf(ana), created, typed, versionOf(renamed));
    }

    private HttpResponse<String> send(
            Endpoint endpoint, UUID group, Fixture f, UUID latest, Map<String, String> headers) throws Exception {
        String rollbackBody = body(rollbackBody(latest));
        return switch (endpoint) {
            case AUDIT_TYPE_LIST -> Http.send("GET", url(auditPath(group) + "?action=ATTRIBUTE_TYPE"), headers);
            case ENTRY -> Http.send("GET", url(entryPath(group, f.typed())), headers);
            case CHANGES -> Http.send("GET", url(entryPath(group, f.typed()) + "/changes"), headers);
            case ROLLBACK -> Http.send("POST", url(rollbackPath(group, f.created())), headers, rollbackBody);
            case INITIAL_ROLLBACK -> Http.send("POST", url(initialRollbackPath(group)), headers, rollbackBody);
            case HISTORY -> Http.send("GET", url(historyPath(group, f.contact())), headers);
            case VERSION -> Http.send("GET", url(versionPath(group, f.contact(), f.typed())), headers);
            case COMPARE ->
                Http.send(
                        "GET",
                        url(comparePath(group, f.contact()) + "?from=" + f.created() + "&to=" + f.typed()),
                        headers);
            case RESTORE ->
                Http.send(
                        "POST",
                        url(restorePath(group, f.contact())),
                        headers,
                        body(restoreBody(f.created(), f.version())));
        };
    }

    private Map<String, Object> groupState(UUID group, UUID contact) {
        return Map.of(
                "keys",
                jdbc.queryForList("select key_norm, type, version from attribute_key where group_id = ?", group),
                "contact",
                contacts.row(contact),
                "attributes",
                contacts.attributesOf(contact),
                "entries",
                audit.count(group));
    }

    @ParameterizedTest(name = "{0} {2} skupina, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        Fixture f = fixture(s);
        UUID latest = audit.latestEntryId(s.group());
        if (archived) {
            groups.archive(s.group());
        }
        Map<String, Object> before = groupState(s.group(), f.contact());

        HttpResponse<String> response = send(endpoint, s.group(), f, latest, headers(actor, s.users()));

        Expected expected = expected(endpoint, actor, archived);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404) {
            assertThat(response.body()).isEmpty();
        }
        if (expected.status() != 201) {
            assertThat(groupState(s.group(), f.contact())).isEqualTo(before);
        }
        if (expected.status() == 200 && endpoint == Endpoint.AUDIT_TYPE_LIST) {
            assertThat(json(response.body())).containsEntry("total", 1);
        }
        if (expected.status() == 200 && endpoint == Endpoint.HISTORY) {
            assertThat(asObjects(json(response.body()).get("items")))
                    .extracting(e -> e.get("action"))
                    .containsExactly("UPDATE", "ATTRIBUTE_TYPE", "CREATE");
        }
        if (expected.status() == 200 && endpoint == Endpoint.VERSION) {
            assertThat(asObjects(asObject(json(response.body()).get("state")).get("attributes")))
                    .containsExactly(Map.of("key", "Mobilni", "type", "PHONE", "value", "+38641123456"));
        }
    }

    @ParameterizedTest(name = "viri druge skupine, {0}")
    @EnumSource(
            value = Actor.class,
            names = {"VIEWER", "EDITOR", "ADMIN", "OWNER"})
    void entriesAndContactsOfAnotherGroupAreNotFoundForEveryRoleOfAMemberOfBothGroups(Actor actor) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        for (Who member : List.of(Who.VIEWER, Who.EDITOR, Who.ADMIN)) {
            groups.addMember(other, s.id(member), member.name());
        }
        // Tuja skupina ima kontakt, spremembo tipa in preimenovanje; zahtevki gredo prek skupine A.
        Scenario foreignScenario = new Scenario(other, s.users(), s.ids());
        Fixture foreign = fixture(foreignScenario);
        Fixture own = fixture(s);
        UUID foreignLatest = audit.latestEntryId(other);
        Map<String, String> headers = Http.bearer(s.token(Who.valueOf(actor.name())));
        Map<String, Object> foreignBefore = groupState(other, foreign.contact());
        int entriesMine = audit.count(s.group());

        for (Endpoint endpoint : List.of(
                Endpoint.ENTRY,
                Endpoint.CHANGES,
                Endpoint.ROLLBACK,
                Endpoint.HISTORY,
                Endpoint.VERSION,
                Endpoint.COMPARE,
                Endpoint.RESTORE)) {
            HttpResponse<String> response = send(endpoint, s.group(), foreign, foreignLatest, headers);

            // Vnos ali kontakt druge skupine je 404 v koraku 2, pred preverjanjem vloge – tudi za bralca.
            assertThat(response.statusCode()).as(endpoint.name()).isEqualTo(404);
            assertThat(response.body()).as(endpoint.name()).isEmpty();
        }
        // Moj kontakt z vnosoma druge skupine (različica druge skupine).
        Fixture mixed = new Fixture(own.contact(), foreign.created(), foreign.typed(), own.version());
        for (Endpoint endpoint : List.of(Endpoint.VERSION, Endpoint.COMPARE)) {
            HttpResponse<String> response = send(endpoint, s.group(), mixed, foreignLatest, headers);
            assertThat(response.statusCode())
                    .as(endpoint + " vnos druge skupine")
                    .isEqualTo(404);
        }
        HttpResponse<String> list = get(auditPath(s.group()) + "?action=ATTRIBUTE_TYPE", s.token(who));
        assertThat(list.statusCode()).isEqualTo(200);
        // Sled skupine A šteje samo njeno spremembo tipa.
        assertThat(asObjects(json(list.body()).get("items")))
                .extracting(e -> e.get("id"))
                .containsExactly(own.typed().toString());
        assertThat(groupState(other, foreign.contact())).isEqualTo(foreignBefore);
        assertThat(audit.count(s.group())).isEqualTo(entriesMine);
        assertThat(keyType(foreignScenario, "mobilni")).isEqualTo("PHONE");
    }
}

package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.contact.support.ContactSearchClient;
import si.contactmanager.contact.support.DuplicateApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov 011 (konstitucija III, workflow.md §2.5; FR-011-19, FR-011-20, FR-011-21): trije
 * endpointi × akter × stanje skupine, nato identitete kontaktov druge skupine. Neprijavljen 401, nečlan 404 brez
 * telesa, bralec 403 (tudi v arhivirani skupini), urednik in višje 200 ali 409 GROUP_ARCHIVED.
 */
@Tag("FR-011-19")
@Tag("FR-011-20")
@Tag("FR-011-21")
class DuplicateIsolationMatrixSecurityIT extends DuplicateApiTest {

    private static final String EMAIL = "skupni@primer.si";

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
        SEARCH,
        COMPARE,
        MERGE
    }

    record Expected(int status, Map<String, Object> body) {}

    static Expected expected(Actor actor, boolean archived) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER -> new Expected(403, Map.of("code", "FORBIDDEN"));
            case EDITOR, ADMIN, OWNER ->
                archived ? new Expected(409, Map.of("code", "GROUP_ARCHIVED")) : new Expected(200, null);
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

    private static Map<String, Object> merged() {
        return result("Janez", "Novak", null, null, null, null, null);
    }

    /** Veljaven zahtevek za endpoint: iskanje po e-naslovu, primerjava in združitev dveh obstoječih kontaktov. */
    private HttpResponse<String> send(Endpoint endpoint, UUID group, List<UUID> ids, Map<String, String> headers)
            throws Exception {
        return switch (endpoint) {
            case SEARCH ->
                Http.send("GET", url(duplicatesPath(group) + ContactSearchClient.query("category", "email")), headers);
            case COMPARE -> Http.send("GET", url(comparePath(group) + "?ids=" + String.join(",", ids(ids))), headers);
            case MERGE -> Http.send("POST", url(mergePath(group)), headers, body(mergeBody(versioned(ids), merged())));
        };
    }

    /** Identitete z verzijo iz baze; za neobstoječe (izmišljene) identitete verzija 0. */
    private List<Map<String, Object>> versioned(List<UUID> ids) {
        return ids.stream()
                .map(id -> contact(id, contacts.exists(id) ? contacts.version(id) : 0L))
                .toList();
    }

    private HttpResponse<String> sendAs(Endpoint endpoint, String token, UUID group, List<UUID> ids) throws Exception {
        return send(endpoint, group, ids, Http.bearer(token));
    }

    @ParameterizedTest(name = "{0} {2} skupina, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, EMAIL);
        if (archived) {
            groups.archive(s.group());
        }
        // verzije se preberejo pred zahtevkom; za merge se tako 200 ne more zamenjati z 409 VERSION_CONFLICT
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = send(endpoint, s.group(), ids, headers(actor, s.users()));

        Expected expected = expected(actor, archived);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404) {
            assertThat(response.body()).isEmpty();
        }
        boolean mutated = expected.status() == 200 && endpoint == Endpoint.MERGE;
        if (mutated) {
            assertThat(json(response.body())).as("uspešen odgovor").containsEntry("mergedCount", 2);
        } else {
            assertUnchanged(before, snapshot(s.group()));
        }
        if (expected.status() == 200 && endpoint == Endpoint.SEARCH) {
            assertThat(asObjects(json(response.body()).get("groups"))).hasSize(1);
        }
        if (expected.status() == 200 && endpoint == Endpoint.COMPARE) {
            assertThat(asObjects(json(response.body()).get("contacts"))).hasSize(2);
        }
    }

    @ParameterizedTest(name = "neobstoječa skupina, {0}")
    @EnumSource(Endpoint.class)
    void aNonExistentGroupIsNotFound(Endpoint endpoint) throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                sendAs(endpoint, s.token(Who.OWNER), UUID.randomUUID(), List.of(UUID.randomUUID(), UUID.randomUUID()));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    // --- identitete druge skupine -----------------------------------------------------------------------------------

    /** Skupina B, v kateri je akter član (ali ne); vrne njen id. */
    private UUID otherGroup(Scenario s, Who who, boolean memberOfB) {
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        if (memberOfB && who != Who.OWNER) {
            groups.addMember(other, s.id(who), who.name());
        }
        return other;
    }

    static Stream<Arguments> foreignCases() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : List.of(Endpoint.COMPARE, Endpoint.MERGE)) {
            for (Actor actor : List.of(Actor.EDITOR, Actor.ADMIN, Actor.OWNER)) {
                for (boolean memberOfB : new boolean[] {false, true}) {
                    rows.add(Arguments.of(endpoint, actor, memberOfB));
                }
            }
        }
        return rows.stream();
    }

    @ParameterizedTest(name = "en kontakt skupine B, {0}, {1}, član B: {2}")
    @MethodSource("foreignCases")
    void oneContactOfAnotherGroupMakesTheRequestNotFoundAndChangesNothing(
            Endpoint endpoint, Actor actor, boolean memberOfB) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = otherGroup(s, who, memberOfB);
        List<UUID> mine = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, EMAIL);
        UUID foreign =
                contacts.insertDuplicates(other, s.id(Who.OWNER), 1, EMAIL).get(0);
        List<UUID> ids = List.of(mine.get(0), mine.get(1), foreign);
        Snapshot beforeA = snapshot(s.group());
        Snapshot beforeB = snapshot(other);

        HttpResponse<String> response = sendAs(endpoint, s.token(who), s.group(), ids);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertUnchanged(beforeA, snapshot(s.group()));
        assertUnchanged(beforeB, snapshot(other));
        assertThat(contacts.exists(foreign)).isTrue();
    }

    @ParameterizedTest(name = "izmišljen UUID, {0}")
    @EnumSource(
            value = Endpoint.class,
            names = {"COMPARE", "MERGE"})
    void aFabricatedIdentityIsNotFoundAndChangesNothing(Endpoint endpoint) throws Exception {
        Scenario s = scenario();
        List<UUID> mine = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, EMAIL);
        Snapshot before = snapshot(s.group());
        List<UUID> ids = List.of(mine.get(0), mine.get(1), UUID.randomUUID());

        HttpResponse<String> response = sendAs(endpoint, s.token(Who.EDITOR), s.group(), ids);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(404);
        assertUnchanged(before, snapshot(s.group()));
    }

    @ParameterizedTest(name = "iskanje ne prečka skupin, {0}")
    @EnumSource(
            value = Actor.class,
            names = {"EDITOR", "ADMIN", "OWNER"})
    void searchInGroupADoesNotReturnContactsOfGroupB(Actor actor) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = otherGroup(s, who, true);
        List<UUID> mine = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, EMAIL);
        List<UUID> foreign = contacts.insertDuplicates(other, s.id(Who.OWNER), 3, EMAIL);
        // en sam kontakt skupine A z e-naslovom, ki ga ima en sam kontakt skupine B: ni dvojnik
        contacts.insertContact(s.group(), s.id(Who.OWNER), "A", "Sam", "samo@primer.si", null, java.time.Instant.now());
        contacts.insertContact(other, s.id(Who.OWNER), "B", "Sam", "samo@primer.si", null, java.time.Instant.now());

        HttpResponse<String> response = duplicates(s.token(who), s.group(), "category", "email");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        Map<String, Object> page = json(response.body());
        assertThat(page).containsEntry("total", 1);
        List<Map<String, Object>> found = asObjects(page.get("groups"));
        assertThat(found).hasSize(1);
        List<String> contactIds = new ArrayList<>();
        for (Map<String, Object> contact : asObjects(found.get(0).get("contacts"))) {
            contactIds.add((String) contact.get("id"));
        }
        assertThat(contactIds).containsExactlyInAnyOrderElementsOf(ids(mine));
        assertThat(contactIds).doesNotContainAnyElementsOf(ids(foreign));
    }

    // --- 11 identitet ------------------------------------------------------------------------------------------------

    @ParameterizedTest(name = "11 kontaktov iste skupine, {0}")
    @EnumSource(
            value = Endpoint.class,
            names = {"COMPARE", "MERGE"})
    void elevenContactsOfTheSameGroupAreAValidationError(Endpoint endpoint) throws Exception {
        Scenario s = scenario();
        List<UUID> eleven = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 11, EMAIL);
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = sendAs(endpoint, s.token(Who.EDITOR), s.group(), eleven);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body()))
                .containsEntry(endpoint == Endpoint.COMPARE ? "ids" : "contacts", "TOO_MANY");
        assertUnchanged(before, snapshot(s.group()));
    }

    @ParameterizedTest(name = "11 identitet, med njimi tuj kontakt, {0}")
    @EnumSource(
            value = Endpoint.class,
            names = {"COMPARE", "MERGE"})
    void elevenIdentitiesWithAForeignOneAreNeverSuccessfulAndChangeNothing(Endpoint endpoint) throws Exception {
        Scenario s = scenario();
        UUID other = otherGroup(s, Who.EDITOR, true);
        List<UUID> ids = new ArrayList<>(contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 10, EMAIL));
        ids.add(contacts.insertDuplicates(other, s.id(Who.OWNER), 1, EMAIL).get(0));
        Snapshot beforeA = snapshot(s.group());
        Snapshot beforeB = snapshot(other);

        HttpResponse<String> response = sendAs(endpoint, s.token(Who.EDITOR), s.group(), ids);

        // spec ne določa vrstnega reda preverjanja števila in pripadnosti (research R-07): 400 ali 404, nikoli 2xx
        assertThat(response.statusCode()).as(response.body()).isIn(400, 404);
        assertUnchanged(beforeA, snapshot(s.group()));
        assertUnchanged(beforeB, snapshot(other));
    }

    @ParameterizedTest(name = "10 identitet, med njimi tuj kontakt, {0}")
    @EnumSource(
            value = Endpoint.class,
            names = {"COMPARE", "MERGE"})
    void tenIdentitiesWithAForeignOneAreNotFound(Endpoint endpoint) throws Exception {
        Scenario s = scenario();
        UUID other = otherGroup(s, Who.EDITOR, true);
        List<UUID> ids = new ArrayList<>(contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 9, EMAIL));
        ids.add(contacts.insertDuplicates(other, s.id(Who.OWNER), 1, EMAIL).get(0));
        Snapshot beforeA = snapshot(s.group());
        Snapshot beforeB = snapshot(other);

        HttpResponse<String> response = sendAs(endpoint, s.token(Who.EDITOR), s.group(), ids);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertUnchanged(beforeA, snapshot(s.group()));
        assertUnchanged(beforeB, snapshot(other));
    }

    // --- metode ------------------------------------------------------------------------------------------------------

    static Stream<Arguments> unsupportedMethods() {
        List<Arguments> rows = new ArrayList<>();
        for (String path : List.of("", "/compare", "/merge")) {
            for (String method : List.of("PUT", "PATCH", "DELETE")) {
                rows.add(Arguments.of(method, path));
            }
        }
        return rows.stream();
    }

    @ParameterizedTest(name = "{0} /duplicates{1}")
    @MethodSource("unsupportedMethods")
    void putPatchAndDeleteAreNotAllowed(String method, String suffix) throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 2, EMAIL);
        Snapshot before = snapshot(s.group());
        Map<String, Object> request = new LinkedHashMap<>(mergeBodyNow(ids, merged()));

        HttpResponse<String> response = Http.send(
                method,
                url(duplicatesPath(s.group()) + suffix),
                Http.bearer(s.token(Who.OWNER)),
                "DELETE".equals(method) ? null : body(request));

        assertThat(response.statusCode()).isEqualTo(405);
        assertUnchanged(before, snapshot(s.group()));
    }
}

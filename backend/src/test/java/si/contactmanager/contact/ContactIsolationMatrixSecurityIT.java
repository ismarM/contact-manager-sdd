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
import si.contactmanager.contact.support.ContactApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije endpointov 004 (konstitucija III, workflow.md §2.5; FR-004-01, -04, -06, -08, -10, -12, -14, -15):
 * vseh šest endpointov × akter × stanje skupine, nato kontakt druge skupine. Neprijavljen 401, nečlan 404 brez
 * telesa, bralec pri pisanju in predlogih 403 FORBIDDEN, urednik in višje uspeh ali 409 GROUP_ARCHIVED (§2.2).
 */
@Tag("FR-004-01")
@Tag("FR-004-04")
@Tag("FR-004-06")
@Tag("FR-004-08")
@Tag("FR-004-10")
@Tag("FR-004-12")
@Tag("FR-004-14")
@Tag("FR-004-15")
class ContactIsolationMatrixSecurityIT extends ContactApiTest {

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
        GET,
        CREATE,
        UPDATE,
        DELETE,
        TAGS
    }

    /** Pričakovan odgovor: status in telo ({@code null} = poljubno oziroma prazno pri 404). */
    record Expected(int status, Map<String, Object> body) {}

    static boolean writes(Endpoint endpoint) {
        return endpoint == Endpoint.CREATE || endpoint == Endpoint.UPDATE || endpoint == Endpoint.DELETE;
    }

    static Expected expected(Endpoint endpoint, Actor actor, boolean archived) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, Map.of("code", "UNAUTHENTICATED"));
            case NON_MEMBER -> new Expected(404, null);
            case VIEWER -> {
                boolean read = endpoint == Endpoint.LIST || endpoint == Endpoint.GET;
                yield read ? new Expected(200, null) : new Expected(403, Map.of("code", "FORBIDDEN"));
            }
            case EDITOR, ADMIN, OWNER -> {
                if (writes(endpoint) && archived) {
                    yield new Expected(409, Map.of("code", "GROUP_ARCHIVED"));
                }
                yield new Expected(
                        switch (endpoint) {
                            case CREATE -> 201;
                            case DELETE -> 204;
                            default -> 200;
                        },
                        null);
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
            Endpoint endpoint, UUID group, UUID contact, Map<String, String> headers, String contactsPath)
            throws Exception {
        String one = contactsPath + "/" + contact;
        return switch (endpoint) {
            case LIST -> Http.send("GET", url(contactsPath), headers);
            case GET -> Http.send("GET", url(one), headers);
            case CREATE -> Http.send("POST", url(contactsPath), headers, body(input("Nov", "Kontakt")));
            case UPDATE -> Http.send("PUT", url(one), headers, body(withVersion(input("Prepisan", "Kontakt"), 0)));
            case DELETE -> Http.send("DELETE", url(one + "?version=0"), headers);
            case TAGS -> Http.send("GET", url("/api/groups/" + group + "/tags?q=v"), headers);
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
        Map<String, Object> rowBefore = contacts.row(contact);

        HttpResponse<String> response =
                send(endpoint, s.group(), contact, headers(actor, s.users()), contactsPath(s.group()));

        Expected expected = expected(endpoint, actor, archived);
        assertThat(response.statusCode()).isEqualTo(expected.status());
        if (expected.body() != null) {
            assertThat(json(response.body())).isEqualTo(expected.body());
        } else if (expected.status() == 404) {
            assertThat(response.body()).isEmpty();
        }
        boolean mutated = expected.status() >= 200 && expected.status() < 300 && writes(endpoint);
        if (!mutated) {
            assertThat(contacts.exists(contact)).isTrue();
            assertThat(contacts.row(contact)).isEqualTo(rowBefore);
            assertThat(contacts.count(s.group())).isEqualTo(1);
            assertThat(contacts.tagsOf(contact)).containsExactly("vip");
        }
    }

    @ParameterizedTest(name = "kontakt druge skupine, {0}")
    @EnumSource(
            value = Actor.class,
            names = {"VIEWER", "EDITOR", "ADMIN", "OWNER"})
    void contactOfAnotherGroupIsNotFoundForEveryRoleOfAMemberOfBothGroups(Actor actor) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        // Isti uporabnik je član druge skupine B z isto vlogo in v B obstaja kontakt.
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        if (who != Who.OWNER) {
            groups.addMember(other, s.id(who), who.name());
        }
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        Map<String, Object> rowBefore = contacts.row(foreign);
        String path = contactsPath(s.group());
        Map<String, String> headers = Http.bearer(s.token(who));

        HttpResponse<String> read = send(Endpoint.GET, s.group(), foreign, headers, path);
        HttpResponse<String> update = send(Endpoint.UPDATE, s.group(), foreign, headers, path);
        HttpResponse<String> remove = send(Endpoint.DELETE, s.group(), foreign, headers, path);

        // Vir v tuji skupini je 404 že v koraku 2 (feature-map §2.2), pred preverjanjem vloge – tudi za bralca.
        assertThat(read.statusCode()).isEqualTo(404);
        assertThat(read.body()).isEmpty();
        assertThat(update.statusCode()).isEqualTo(404);
        assertThat(update.body()).isEmpty();
        assertThat(remove.statusCode()).isEqualTo(404);
        assertThat(remove.body()).isEmpty();
        assertThat(contacts.exists(foreign)).isTrue();
        assertThat(contacts.row(foreign)).isEqualTo(rowBefore);
        assertThat(contacts.count(s.group())).isZero();
    }
}

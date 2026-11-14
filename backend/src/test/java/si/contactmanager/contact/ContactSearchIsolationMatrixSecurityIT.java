package si.contactmanager.contact;

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
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.contact.support.ContactSearchApiTest;
import si.contactmanager.contact.support.ContactSearchClient;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije obeh endpointov iskanja (konstitucija III in §3.1; FR-008-06, -14, -15, -16; SC-004):
 * neprijavljen 401, nečlan 404 brez telesa (tudi pri neveljavnih parametrih), vsak član 200 (tudi v arhivirani skupini),
 * nikoli 403 ali 409; podatki druge skupine nikoli v odgovoru.
 */
@Tag("FR-008-06")
@Tag("FR-008-14")
@Tag("FR-008-15")
@Tag("FR-008-16")
class ContactSearchIsolationMatrixSecurityIT extends ContactSearchApiTest {

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
        LIST_WITH_PARAMETERS,
        LIST_WITH_INVALID_PARAMETERS,
        FILTERS
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

    private HttpResponse<String> send(Endpoint endpoint, UUID group, Map<String, String> headers) throws Exception {
        String path = switch (endpoint) {
            case LIST_WITH_PARAMETERS ->
                ContactSearchClient.listPath(group)
                        + ContactSearchClient.query(
                                "q", "novak", "f", "email:feri", "tag", "vip", "sort", "email", "dir", "desc");
            case LIST_WITH_INVALID_PARAMETERS ->
                ContactSearchClient.listPath(group) + ContactSearchClient.query("size", "7", "sort", "foo");
            case FILTERS -> ContactSearchClient.filtersPath(group);
        };
        return Http.send("GET", url(path), headers);
    }

    @ParameterizedTest(name = "{0}, arhivirana={2}, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak", "janez@feri.si", null, null);
        contacts.addTags(contact, "vip");
        contacts.insert(s.group(), s.id(Who.OWNER), "Mojca", "Kralj", "mojca@primer.si", null, null);
        if (archived) {
            groups.archive(s.group());
        }

        HttpResponse<String> response = send(endpoint, s.group(), headers(actor, s.users()));

        switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> {
                assertThat(response.statusCode()).isEqualTo(401);
                assertThat(json(response.body())).isEqualTo(Map.of("code", "UNAUTHENTICATED"));
            }
            case NON_MEMBER -> {
                assertThat(response.statusCode()).isEqualTo(404);
                assertThat(response.body()).isEmpty();
            }
            default -> {
                // brez 403 in 409: samo branje, tudi v arhivirani skupini
                int expected = endpoint == Endpoint.LIST_WITH_INVALID_PARAMETERS ? 400 : 200;
                assertThat(response.statusCode()).as(response.body()).isEqualTo(expected);
                if (endpoint == Endpoint.LIST_WITH_PARAMETERS) {
                    assertThat(ContactSearchClient.names(response.body())).containsExactly("Janez Novak");
                }
                if (endpoint == Endpoint.FILTERS) {
                    assertThat(ContactSearchClient.options(response.body(), "tags"))
                            .containsExactly("vip");
                }
            }
        }
        assertThat(contacts.count(s.group())).isEqualTo(2);
    }

    @ParameterizedTest(name = "neobstoječa skupina, {0}")
    @EnumSource(Endpoint.class)
    void aNonExistingGroupIsNotFoundForAMember(Endpoint endpoint) throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = send(endpoint, UUID.randomUUID(), Http.bearer(s.token(Who.OWNER)));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @Test
    void aMemberOfTwoGroupsNeverSeesDataOfTheOtherGroupInThePath() throws Exception {
        Scenario a = scenario();
        contacts.insert(a.group(), a.id(Who.OWNER), "Janez", "Novak");
        UUID other = groups.createGroup(a.id(Who.OWNER), "Skupina B");
        groups.addMember(other, a.id(Who.VIEWER), "VIEWER");
        UUID foreign =
                contacts.insert(other, a.id(Who.OWNER), "Tuj", "Kralj", "tuj@skrivno.si", "090 000 000", "Tajna ulica");
        contacts.addAttribute(foreign, 0, "skrivno", "podatek-iz-b");
        contacts.addTags(foreign, "tajno");

        // vse poizvedbe, ki bi v skupini B kaj našle, v skupini A ne najdejo ničesar
        for (String[] query : new String[][] {
            {"q", "kralj"},
            {"q", "skrivno"},
            {"q", "tajna"},
            {"f", "email:skrivno"},
            {"f", "phone:090"},
            {"tag", "tajno"},
            {"q", "podatek"}
        }) {
            HttpResponse<String> response = search(a, query);
            assertThat(response.statusCode()).as(String.join("=", query)).isEqualTo(200);
            assertThat(ContactSearchClient.total(response.body()))
                    .as(String.join("=", query))
                    .isZero();
        }
        // ključ druge skupine: enaka napaka kot za ključ, ki ne obstaja
        assertThat(search(a, "f", "x.skrivno:podatek").statusCode()).isEqualTo(400);
        assertThat(search(a, "sort", "x.skrivno").statusCode()).isEqualTo(400);
        // celoten seznam in možnosti skupine A ne vsebujejo nič iz B
        HttpResponse<String> all = search(a);
        assertThat(ContactSearchClient.names(all.body())).containsExactly("Janez Novak");
        assertThat(ContactSearchClient.total(all.body())).isEqualTo(1);
        HttpResponse<String> options = get(ContactSearchClient.filtersPath(a.group()), a.token(Who.VIEWER));
        assertThat(options.body())
                .doesNotContain("skrivno")
                .doesNotContain("tajno")
                .doesNotContain("Kralj")
                .doesNotContain("podatek");
        // in obratno: v skupini B so vidni samo podatki skupine B
        HttpResponse<String> inOther =
                get(ContactSearchClient.listPath(other) + ContactSearchClient.query("q", "janez"), a.token(Who.VIEWER));
        assertThat(ContactSearchClient.total(inOther.body())).isZero();
    }
}

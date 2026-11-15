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
import si.contactmanager.contact.support.ContactApiTest;
import si.contactmanager.contact.support.ContactSearchClient;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije predlogov (konstitucija III in §3.1; FR-013-16; SC-005): neprijavljen 401, nečlan 404 brez telesa,
 * bralec 403, urednik, admin in lastnik 200 (tudi v arhivirani skupini); podatki druge skupine nikoli v odgovoru.
 */
@Tag("FR-013-09")
@Tag("FR-013-11")
@Tag("FR-013-12")
@Tag("FR-013-14")
@Tag("FR-013-16")
class SuggestionsIsolationMatrixSecurityIT extends ContactApiTest {

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

    enum Type {
        KEY,
        VALUE,
        COMPANY,
        TAG,
        COUNTRY
    }

    static Stream<Arguments> matrix() {
        List<Arguments> rows = new ArrayList<>();
        for (Type type : Type.values()) {
            for (boolean archived : new boolean[] {false, true}) {
                for (Actor actor : Actor.values()) {
                    rows.add(Arguments.of(type, actor, archived));
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

    private static String path(UUID group, Type type) {
        String base = "/api/groups/" + group + "/suggestions";
        return switch (type) {
            case KEY -> base + ContactSearchClient.query("type", "key");
            case VALUE -> base + ContactSearchClient.query("type", "value", "key", "Kompetenca");
            case COMPANY -> base + ContactSearchClient.query("type", "company");
            case TAG -> base + ContactSearchClient.query("type", "tag");
            case COUNTRY -> base + ContactSearchClient.query("type", "country");
        };
    }

    private UUID seed(UUID group, long owner, String key, String value, String tag, String company, String country) {
        UUID contact = contacts.insert(group, owner, "Janez", "Novak");
        contacts.addAttribute(contact, 0, key, value);
        contacts.addTag(contact, 0, tag);
        contacts.setCompanyAndCountry(contact, company, country);
        return contact;
    }

    @ParameterizedTest(name = "{0}, arhivirana={2}, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Type type, Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        seed(s.group(), s.id(Who.OWNER), "Kompetenca", "web dev", "vip", "Acme", "AT");
        if (archived) {
            groups.archive(s.group());
        }

        HttpResponse<String> response = Http.send("GET", url(path(s.group(), type)), headers(actor, s.users()));

        switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> {
                assertThat(response.statusCode()).isEqualTo(401);
                assertThat(json(response.body())).isEqualTo(Map.of("code", "UNAUTHENTICATED"));
            }
            case NON_MEMBER -> {
                assertThat(response.statusCode()).isEqualTo(404);
                assertThat(response.body()).isEmpty();
            }
            case VIEWER -> {
                assertThat(response.statusCode()).isEqualTo(403);
                assertThat(response.body()).doesNotContain("Kompetenca", "vip", "Acme");
            }
            default -> {
                // brez 409: samo branje, tudi v arhivirani skupini
                assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
                List<Map<String, Object>> items =
                        asObjects(json(response.body()).get("items"));
                assertThat(items).hasSize(1);
                assertThat(items.get(0).get("text"))
                        .isEqualTo(
                                switch (type) {
                                    case KEY -> "Kompetenca";
                                    case VALUE -> "web dev";
                                    case COMPANY -> "Acme";
                                    case TAG -> "vip";
                                    case COUNTRY -> "AT";
                                });
            }
        }
    }

    @ParameterizedTest(name = "neobstoječa skupina, {0}")
    @EnumSource(Type.class)
    void aNonExistingGroupIsNotFoundForAMember(Type type) throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = get(path(UUID.randomUUID(), type), s.token(Who.OWNER));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @ParameterizedTest(name = "član dveh skupin, {0}")
    @EnumSource(Type.class)
    void aMemberOfTwoGroupsNeverSeesTheOtherGroupsDataInTheOtherPath(Type type) throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga skupina");
        seed(other, s.id(Who.OWNER), "Kompetenca", "tajno", "tajna", "Skrita", "FR");

        HttpResponse<String> response = get(path(s.group(), type), s.token(Who.OWNER));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(response.body()).get("items"))).isEmpty();
    }

    @Test
    void readingSuggestionsNeverChangesData() throws Exception {
        Scenario s = scenario();
        UUID c = seed(s.group(), s.id(Who.OWNER), "Kompetenca", "x", "vip", "Acme", "AT");
        long version = contacts.version(c);

        for (Type type : Type.values()) {
            get(path(s.group(), type), s.token(Who.EDITOR));
        }

        assertThat(contacts.version(c)).isEqualTo(version);
        assertThat(contacts.count(s.group())).isEqualTo(1);
    }
}

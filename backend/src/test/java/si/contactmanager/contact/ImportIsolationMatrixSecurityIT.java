package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.contact.support.ImportApiTest;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije uvoza (konstitucija III, §3.1; FR-014-01, -05, -08): {@code parse}, {@code preview} in potrditev ×
 * akter × stanje skupine. Neprijavljen 401, nečlan in neobstoječa skupina 404 brez telesa, VIEWER 403, EDITOR in višje
 * 2xx; v arhivirani in trajno arhivirani skupini 409 GROUP_ARCHIVED. Nič se ne spremeni razen ob uspešni potrditvi.
 */
@Tag("FR-014-01")
@Tag("FR-014-05")
@Tag("SC-007")
class ImportIsolationMatrixSecurityIT extends ImportApiTest {

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
        PARSE,
        PARSE_VCF,
        PREVIEW,
        COMMIT
    }

    enum State {
        ACTIVE,
        ARCHIVED,
        PERMANENTLY_ARCHIVED
    }

    static Stream<Arguments> matrix() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : Endpoint.values()) {
            for (State state : State.values()) {
                for (Actor actor : Actor.values()) {
                    rows.add(Arguments.of(endpoint, state, actor));
                }
            }
        }
        return rows.stream();
    }

    private String token(Actor actor, Scenario s) {
        return switch (actor) {
            case NO_TOKEN -> null;
            case MALFORMED_TOKEN -> "not-a-jwt";
            case EXPIRED_TOKEN ->
                Tokens.withClaims(s.token(Who.OWNER), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                });
            default -> s.token(Who.valueOf(actor.name()));
        };
    }

    private HttpResponse<String> send(Endpoint endpoint, String token, UUID group) throws Exception {
        return switch (endpoint) {
            case PARSE -> parse(token, group, xlsx(List.of(List.of("Ime"), List.of("Ana"))), "XLSX", "sl");
            case PARSE_VCF ->
                parse(
                        token,
                        group,
                        "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana Kos\r\nEND:VCARD\r\n".getBytes(StandardCharsets.UTF_8),
                        "VCF",
                        "sl");
            case PREVIEW -> preview(token, group, List.of(person("Ana", "Kos")));
            case COMMIT -> commit(token, group, "XLSX", List.of(person("Ana", "Kos")));
        };
    }

    @ParameterizedTest(name = "{0} {1} {2}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, State state, Actor actor) throws Exception {
        Scenario s = scenario();
        contacts.insert(s.group(), s.id(Who.OWNER), "Obstoječ", "Kontakt");
        if (state != State.ACTIVE) {
            groups.archive(s.group());
        }
        if (state == State.PERMANENTLY_ARCHIVED) {
            groups.makePermanentlyArchived(s.group());
        }
        Snapshot before = snapshot(s.group());

        HttpResponse<String> response = send(endpoint, token(actor, s), s.group());

        boolean changed = false;
        // Trajno arhivirana skupina nima lastnika (012): nekdanji lastnik je nečlan.
        Actor effective = state == State.PERMANENTLY_ARCHIVED && actor == Actor.OWNER ? Actor.NON_MEMBER : actor;
        switch (effective) {
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
                assertThat(json(response.body())).isEqualTo(Map.of("code", "FORBIDDEN"));
            }
            default -> {
                if (state != State.ACTIVE) {
                    assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
                    assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
                } else {
                    assertThat(response.statusCode())
                            .as(response.body())
                            .isEqualTo(endpoint == Endpoint.COMMIT ? 201 : 200);
                    changed = endpoint == Endpoint.COMMIT;
                }
            }
        }
        if (changed) {
            assertThat(contacts.count(s.group())).isEqualTo(2);
        } else {
            assertUnchanged(before, snapshot(s.group()));
            assertThat(contacts.count(s.group())).isEqualTo(1);
        }
    }

    @Test
    void aNonExistentGroupIsNotFoundForEveryEndpoint() throws Exception {
        Scenario s = scenario();
        for (Endpoint endpoint : Endpoint.values()) {
            HttpResponse<String> response = send(endpoint, s.token(Who.OWNER), UUID.randomUUID());

            assertThat(response.statusCode()).as(endpoint.name()).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
    }

    /** Vrstni red (feature-map §2.2): nečlan dobi 404 pred napako prevelike ali neveljavne datoteke. */
    @Test
    void aNonMemberGetsNotFoundBeforeFileValidation() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> big =
                parse(s.token(Who.NON_MEMBER), s.group(), new byte[10 * 1024 * 1024 + 10], "XLSX", "sl");
        HttpResponse<String> bad = commit(s.token(Who.NON_MEMBER), s.group(), "XLSX", List.of());

        assertThat(big.statusCode()).isEqualTo(404);
        assertThat(bad.statusCode()).isEqualTo(404);
    }
}

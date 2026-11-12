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
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.contact.support.ExportApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije izvoza (konstitucija III, workflow.md §2.5; FR-010-02, FR-010-12, FR-010-16; SC-006):
 * {@code POST …/contacts/export} × akter × stanje skupine, nato identiteta kontakta druge skupine ali izmišljena.
 * Neprijavljen 401, nečlan 404 brez telesa, vsi člani 200 (tudi v arhivirani skupini).
 */
@Tag("FR-010-02")
@Tag("FR-010-12")
@Tag("FR-010-16")
@Tag("SC-006")
class ExportIsolationMatrixSecurityIT extends ExportApiTest {

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

    static Stream<Arguments> matrix() {
        List<Arguments> rows = new ArrayList<>();
        for (boolean archived : new boolean[] {false, true}) {
            for (Actor actor : Actor.values()) {
                rows.add(Arguments.of(actor, archived));
            }
        }
        return rows.stream();
    }

    static Stream<Actor> members() {
        return Stream.of(Actor.VIEWER, Actor.EDITOR, Actor.ADMIN, Actor.OWNER);
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

    private HttpResponse<String> send(UUID group, Map<String, String> headers, Object requestBody) throws Exception {
        return Http.send("POST", url(exportPath(group)), headers, body(requestBody));
    }

    @ParameterizedTest(name = "{1} skupina arhivirana, {0}")
    @MethodSource("matrix")
    void isolationMatrix(Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        contacts.addTag(contact, 0, "vip");
        if (archived) {
            groups.archive(s.group());
        }
        Snapshot before = readOnlySnapshot(s.group());

        HttpResponse<String> response = send(s.group(), headers(actor, s.users()), exportBody(List.of(contact), "sl"));

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
                assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
                assertThat(response.headers().firstValue("Content-Type")).contains(XLSX);
            }
        }
        assertUnchanged(before, readOnlySnapshot(s.group()));
    }

    @Test
    void aNonExistentGroupIsNotFound() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                send(UUID.randomUUID(), Http.bearer(s.token(Who.OWNER)), exportBody(List.of(UUID.randomUUID()), "sl"));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @ParameterizedTest(name = "identiteta druge skupine ali izmišljena, {0}")
    @MethodSource("members")
    void anIdentityOfAnotherGroupOrAFabricatedOneIsNotFoundAlone(Actor actor) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        if (who != Who.OWNER) {
            groups.addMember(other, s.id(who), who.name());
        }
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        Snapshot beforeA = readOnlySnapshot(s.group());
        Snapshot beforeB = readOnlySnapshot(other);

        HttpResponse<String> foreignAlone =
                send(s.group(), Http.bearer(s.token(who)), exportBody(List.of(foreign), "sl"));
        HttpResponse<String> fabricatedAlone =
                send(s.group(), Http.bearer(s.token(who)), exportBody(List.of(UUID.randomUUID()), "sl"));

        assertThat(foreignAlone.statusCode()).isEqualTo(404);
        assertThat(foreignAlone.body()).isEmpty();
        assertThat(fabricatedAlone.statusCode()).isEqualTo(404);
        assertThat(fabricatedAlone.body()).isEqualTo(foreignAlone.body());
        assertThat(fabricatedAlone.headers().map().keySet())
                .containsAll(foreignAlone.headers().map().keySet().stream()
                        .filter(h -> !h.equalsIgnoreCase("date"))
                        .toList());
        assertUnchanged(beforeA, readOnlySnapshot(s.group()));
        assertUnchanged(beforeB, readOnlySnapshot(other));
    }

    @ParameterizedTest(name = "identiteta druge skupine skupaj z veljavnimi, {0}")
    @MethodSource("members")
    void aForeignOrFabricatedIdentityTogetherWithValidOnesRejectsTheWholeExport(Actor actor) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        if (who != Who.OWNER) {
            groups.addMember(other, s.id(who), who.name());
        }
        UUID mine = contacts.insert(s.group(), s.id(Who.OWNER), "Moj", "Kontakt");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");

        HttpResponse<String> withForeign =
                send(s.group(), Http.bearer(s.token(who)), exportBody(List.of(mine, foreign), "sl"));
        HttpResponse<String> withFabricated =
                send(s.group(), Http.bearer(s.token(who)), exportBody(List.of(mine, UUID.randomUUID()), "sl"));

        for (HttpResponse<String> response : List.of(withForeign, withFabricated)) {
            assertThat(response.statusCode()).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
    }

    /** Vrstni red preverjanj (R-04): 404 pred 400 – neveljavno telo ne razkrije obstoja skupine ali identitete. */
    @Test
    void aNonMemberGetsNotFoundBeforeValidationOfAnEmptySelection() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                send(s.group(), Http.bearer(s.token(Who.NON_MEMBER)), exportBody(List.of(), "sl"));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @Test
    void aNonExistentGroupGetsNotFoundBeforeValidationOfTheLanguage() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response =
                send(UUID.randomUUID(), Http.bearer(s.token(Who.OWNER)), exportBody(List.of(UUID.randomUUID()), "de"));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @ParameterizedTest(name = "tuja identiteta in neveljaven language, {0}")
    @MethodSource("members")
    void aForeignIdentityGetsNotFoundBeforeValidationOfTheLanguage(Actor actor) throws Exception {
        Scenario s = scenario();
        Who who = Who.valueOf(actor.name());
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");

        HttpResponse<String> response = send(s.group(), Http.bearer(s.token(who)), exportBody(List.of(foreign), "de"));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    @Test
    void noFileContainsAContactOfAnotherGroup() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        UUID mine = contacts.insert(s.group(), s.id(Who.OWNER), "Moj", "Kontakt");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        contacts.addAttribute(foreign, 0, "skrivnost", "tuja vrednost");

        HttpResponse<byte[]> response = export(s.token(Who.OWNER), s.group(), exportBody(List.of(mine), "sl"));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(workbook(response).rows())
                .containsExactly(
                        List.of("Ime", "Priimek", "Naslov", "E-naslov", "Telefon", "Značke"),
                        List.of("Moj", "Kontakt", "", "", "", ""));
        assertThat(new String(response.body(), java.nio.charset.StandardCharsets.ISO_8859_1))
                .doesNotContain("skrivnost");
    }
}

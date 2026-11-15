package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactApiTest;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/** {@code POST /api/countries/resolve} (FR-013-19, -20): prepoznavanje držav za prijavljenega uporabnika. */
@Tag("FR-013-19")
@Tag("FR-013-20")
class CountryResolveIT extends ContactApiTest {

    private static final String PATH = "/api/countries/resolve";

    @Test
    void resolvesFoundAmbiguousAndUnknownWithoutChangingAnything() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = post(
                PATH,
                s.token(Who.VIEWER),
                body(Map.of("values", List.of("Slovenija", "slovenia", "Korea", "Slovenija?!", "SVN"))));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        List<Map<String, Object>> results = asObjects(json(response.body()).get("results"));
        assertThat(results).hasSize(5);
        assertThat(results.get(0))
                .containsEntry("input", "Slovenija")
                .containsEntry("status", "FOUND")
                .containsEntry("code", "SI");
        assertThat(results.get(1)).containsEntry("status", "FOUND").containsEntry("code", "SI");
        assertThat(results.get(2)).containsEntry("status", "AMBIGUOUS");
        assertThat(asStrings(results.get(2).get("candidates"))).contains("KR", "KP");
        assertThat(results.get(3)).containsEntry("status", "UNKNOWN");
        assertThat(results.get(4)).containsEntry("status", "FOUND").containsEntry("code", "SI");
    }

    @Test
    void requiresAnAuthenticatedUserButNoMembership() throws Exception {
        Scenario s = scenario();
        String body = body(Map.of("values", List.of("Avstrija")));

        HttpResponse<String> none = Http.send("POST", url(PATH), Map.of("Content-Type", "application/json"), body);
        HttpResponse<String> expired = post(
                PATH,
                Tokens.withClaims(s.token(Who.OWNER), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }),
                body);
        HttpResponse<String> nonMember = post(PATH, s.token(Who.NON_MEMBER), body);

        assertThat(none.statusCode()).isEqualTo(401);
        assertThat(expired.statusCode()).isEqualTo(401);
        assertThat(nonMember.statusCode()).isEqualTo(200);
    }

    @Test
    void rejectsMalformedBodiesAndTooManyOrTooLongValues() throws Exception {
        Scenario s = scenario();
        String token = s.token(Who.EDITOR);

        assertThat(fieldErrors(post(PATH, token, "not json").body())).containsEntry("body", "MALFORMED");
        assertThat(fieldErrors(post(PATH, token, "{}").body())).containsEntry("values", "REQUIRED");
        assertThat(fieldErrors(post(PATH, token, "{\"values\":\"SI\"}").body()))
                .containsEntry("values", "INVALID_VALUE");
        assertThat(fieldErrors(
                        post(PATH, token, body(Map.of("values", List.of(1)))).body()))
                .containsEntry("values[0]", "INVALID_VALUE");
        assertThat(fieldErrors(post(PATH, token, body(Map.of("values", java.util.Collections.nCopies(51, "SI"))))
                        .body()))
                .containsEntry("values", "TOO_MANY");
        assertThat(fieldErrors(post(PATH, token, body(Map.of("values", List.of("x".repeat(101)))))
                        .body()))
                .containsEntry("values[0]", "TOO_LONG");
    }
}
